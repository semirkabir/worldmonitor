import { LANGUAGES, getCurrentLanguage, changeLanguage, t } from '@/services/i18n';
import { getAiFlowSettings, setAiFlowSetting, getStreamQuality, setStreamQuality, STREAM_QUALITY_OPTIONS } from '@/services/ai-flow-settings';
import { getUnifiedTheme, setUnifiedTheme, UNIFIED_THEME_OPTIONS } from '@/config/basemap';
import { getLiveStreamsAlwaysOn, setLiveStreamsAlwaysOn } from '@/services/live-stream-settings';
import { getGlobeVisualPreset, setGlobeVisualPreset, GLOBE_VISUAL_PRESET_OPTIONS, type GlobeVisualPreset } from '@/services/globe-render-settings';
import { getInsightSeverityPreference, setInsightSeverityPreference, INSIGHT_SEVERITY_OPTIONS, type InsightSeverityPreference } from '@/services/insight-severity-settings';
import type { StreamQuality } from '@/services/ai-flow-settings';
import { getThemePreference, setThemePreference, getFontPreference, setFontPreference, type ThemePreference, type FontPreference } from '@/utils/theme-manager';
import { escapeHtml } from '@/utils/sanitize';
import { trackLanguageChange } from '@/services/analytics';
import { exportSettings, importSettings, type ImportResult } from '@/utils/settings-persistence';
import {
  CURSOR_THEME_OPTIONS,
  checkCursorThemeAvailability,
  getCursorPreviewUrl,
  getCursorPreference,
  getCursorTheme,
  setCursorPreference,
  setCursorTheme,
  type CursorPreference,
  type CursorTheme,
} from '@/utils/forced-cursor';

const DESKTOP_RELEASES_URL = 'https://github.com/koala73/worldmonitor/releases';

const HEADER_TZ_KEY = 'worldmonitor-header-timezone';
const HEADER_FMT_KEY = 'worldmonitor-header-clock-format';

export function getHeaderTimezone(): string {
  return localStorage.getItem(HEADER_TZ_KEY) || 'UTC';
}

export function setHeaderTimezone(tz: string): void {
  localStorage.setItem(HEADER_TZ_KEY, tz);
}

export function getClockFormat(): '12h' | '24h' {
  return (localStorage.getItem(HEADER_FMT_KEY) as '12h' | '24h') || '24h';
}

export function setClockFormat(fmt: '12h' | '24h'): void {
  localStorage.setItem(HEADER_FMT_KEY, fmt);
}

const TIMEZONE_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: 'UTC',                              label: 'UTC',               group: '' },
  { value: 'local',                            label: 'Local (auto-detect)', group: '' },
  { value: 'America/New_York',                 label: 'New York (ET)',     group: 'Americas' },
  { value: 'America/Chicago',                  label: 'Chicago (CT)',      group: 'Americas' },
  { value: 'America/Denver',                   label: 'Denver (MT)',       group: 'Americas' },
  { value: 'America/Los_Angeles',              label: 'Los Angeles (PT)',  group: 'Americas' },
  { value: 'America/Toronto',                  label: 'Toronto (ET)',      group: 'Americas' },
  { value: 'America/Mexico_City',              label: 'Mexico City',       group: 'Americas' },
  { value: 'America/Sao_Paulo',               label: 'São Paulo',         group: 'Americas' },
  { value: 'America/Argentina/Buenos_Aires',   label: 'Buenos Aires',      group: 'Americas' },
  { value: 'Europe/London',                    label: 'London (GMT/BST)',  group: 'Europe' },
  { value: 'Europe/Paris',                     label: 'Paris (CET)',       group: 'Europe' },
  { value: 'Europe/Berlin',                    label: 'Frankfurt (CET)',   group: 'Europe' },
  { value: 'Europe/Zurich',                    label: 'Zurich (CET)',      group: 'Europe' },
  { value: 'Europe/Moscow',                    label: 'Moscow (MSK)',      group: 'Europe' },
  { value: 'Europe/Istanbul',                  label: 'Istanbul (TRT)',    group: 'Europe' },
  { value: 'Asia/Riyadh',                      label: 'Riyadh (AST)',      group: 'Middle East & Africa' },
  { value: 'Asia/Dubai',                       label: 'Dubai (GST)',       group: 'Middle East & Africa' },
  { value: 'Africa/Cairo',                     label: 'Cairo (EET)',       group: 'Middle East & Africa' },
  { value: 'Africa/Lagos',                     label: 'Lagos (WAT)',       group: 'Middle East & Africa' },
  { value: 'Africa/Johannesburg',              label: 'Johannesburg (SAST)', group: 'Middle East & Africa' },
  { value: 'Asia/Kolkata',                     label: 'Mumbai (IST)',      group: 'Asia-Pacific' },
  { value: 'Asia/Bangkok',                     label: 'Bangkok (ICT)',     group: 'Asia-Pacific' },
  { value: 'Asia/Singapore',                   label: 'Singapore (SGT)',   group: 'Asia-Pacific' },
  { value: 'Asia/Hong_Kong',                   label: 'Hong Kong (HKT)',   group: 'Asia-Pacific' },
  { value: 'Asia/Shanghai',                    label: 'Shanghai (CST)',    group: 'Asia-Pacific' },
  { value: 'Asia/Seoul',                       label: 'Seoul (KST)',       group: 'Asia-Pacific' },
  { value: 'Asia/Tokyo',                       label: 'Tokyo (JST)',       group: 'Asia-Pacific' },
  { value: 'Australia/Sydney',                 label: 'Sydney (AEST)',     group: 'Asia-Pacific' },
  { value: 'Pacific/Auckland',                 label: 'Auckland (NZST)',   group: 'Asia-Pacific' },
];

export interface PreferencesHost {
  isDesktopApp: boolean;
}

export interface PreferencesResult {
  html: string;
  attach: (container: HTMLElement) => () => void;
}

function toggleRowHtml(id: string, label: string, desc: string, checked: boolean): string {
  return `
    <div class="ai-flow-toggle-row">
      <div class="ai-flow-toggle-label-wrap">
        <div class="ai-flow-toggle-label">${label}</div>
        <div class="ai-flow-toggle-desc">${desc}</div>
      </div>
      <label class="ai-flow-switch">
        <input type="checkbox" id="${id}"${checked ? ' checked' : ''}>
        <span class="ai-flow-slider"></span>
      </label>
    </div>
  `;
}

function renderInsightSeverityControl(current: InsightSeverityPreference): string {
  const currentOption = INSIGHT_SEVERITY_OPTIONS.find((option) => option.value === current) ?? INSIGHT_SEVERITY_OPTIONS[1]!;
  return `
    <div class="ai-flow-toggle-row">
      <div class="ai-flow-toggle-label-wrap">
        <div class="ai-flow-toggle-label">Insight Sensitivity</div>
        <div class="ai-flow-toggle-desc">Choose how strict AI Market Insights should be before marking a story as elevated or critical.</div>
      </div>
    </div>
    <div class="us-insight-sensitivity" data-current-value="${current}">
      <input type="range" min="0" max="2" step="1" value="${INSIGHT_SEVERITY_OPTIONS.findIndex((option) => option.value === current)}" id="us-insight-sensitivity-range" class="us-insight-sensitivity-range" aria-label="Insight sensitivity">
      <div class="us-insight-sensitivity-track" role="radiogroup" aria-label="Insight sensitivity presets">
        ${INSIGHT_SEVERITY_OPTIONS.map((option, index) => `
          <button
            type="button"
            class="us-insight-sensitivity-option${option.value === current ? ' active' : ''}"
            data-insight-sensitivity="${option.value}"
            data-insight-index="${index}"
            role="radio"
            aria-checked="${option.value === current ? 'true' : 'false'}"
          >
            <span class="us-insight-sensitivity-option-title">${escapeHtml(option.label)}</span>
            <span class="us-insight-sensitivity-option-desc">${escapeHtml(option.description)}</span>
          </button>
        `).join('')}
      </div>
      <div class="us-insight-sensitivity-summary" id="usInsightSensitivitySummary">${escapeHtml(currentOption.description)}</div>
    </div>
  `;
}


function updateAiStatus(container: HTMLElement): void {
  const settings = getAiFlowSettings();
  const dot = container.querySelector('#usStatusDot');
  const text = container.querySelector('#usStatusText');
  if (!dot || !text) return;

  dot.className = 'ai-flow-status-dot';
  if (settings.cloudLlm && settings.browserModel) {
    dot.classList.add('active');
    text.textContent = t('components.insights.aiFlowStatusCloudAndBrowser');
  } else if (settings.cloudLlm) {
    dot.classList.add('active');
    text.textContent = t('components.insights.aiFlowStatusActive');
  } else if (settings.browserModel) {
    dot.classList.add('browser-only');
    text.textContent = t('components.insights.aiFlowStatusBrowserOnly');
  } else {
    dot.classList.add('disabled');
    text.textContent = t('components.insights.aiFlowStatusDisabled');
  }
}

export function renderPreferences(host: PreferencesHost): PreferencesResult {
  const settings = getAiFlowSettings();
  const currentLang = getCurrentLanguage();
  let html = '';

  // ── Display group ──
  html += `<details class="wm-pref-group" open>`;
  html += `<summary>${t('preferences.display')}</summary>`;
  html += `<div class="wm-pref-group-content">`;

  // Appearance
  const currentThemePref = getThemePreference();
  const currentFontPref = getFontPreference();
  html += `<div class="ai-flow-toggle-row">
    <div class="ai-flow-toggle-label-wrap">
      <div class="ai-flow-toggle-label">${t('preferences.theme')}</div>
      <div class="ai-flow-toggle-desc">${t('preferences.themeDesc')}</div>
    </div>
  </div>`;
  html += `<select class="unified-settings-select" id="us-theme">`;
  for (const opt of [
    { value: 'auto', label: t('preferences.themeAuto') },
    { value: 'dark', label: t('preferences.themeDark') },
    { value: 'light', label: t('preferences.themeLight') },
  ] as { value: ThemePreference; label: string }[]) {
    const selected = opt.value === currentThemePref ? ' selected' : '';
    html += `<option value="${opt.value}"${selected}>${escapeHtml(opt.label)}</option>`;
  }
  html += `</select>`;

  html += `<div class="ai-flow-toggle-row">
    <div class="ai-flow-toggle-label-wrap">
      <div class="ai-flow-toggle-label">Font</div>
      <div class="ai-flow-toggle-desc">Choose between the current theme font and the news/article reading font.</div>
    </div>
  </div>`;
  html += `<select class="unified-settings-select" id="us-font-preference">`;
  for (const opt of [
    { value: 'theme', label: 'Theme font' },
    { value: 'article', label: 'Article font' },
  ] as { value: FontPreference; label: string }[]) {
    const selected = opt.value === currentFontPref ? ' selected' : '';
    html += `<option value="${opt.value}"${selected}>${escapeHtml(opt.label)}</option>`;
  }
  html += `</select>`;
  html += `<div class="us-font-preview-grid">
    ${renderFontPreviewCard('theme', 'Theme font', 'Operator console', 'CURRENT SITUATION UPDATE // SIGNALS STABLE', currentFontPref)}
    ${renderFontPreviewCard('article', 'Article font', 'News/article reading', 'Current situation update: signals stable.', currentFontPref)}
  </div>`;

  const currentCursorPref = getCursorPreference();
  const currentCursorTheme = getCursorTheme();
  html += `<div class="ai-flow-toggle-row">
    <div class="ai-flow-toggle-label-wrap">
      <div class="ai-flow-toggle-label">Cursor mode</div>
      <div class="ai-flow-toggle-desc">Choose between the browser cursor and the custom overlay cursor used when CSS cursors are ignored.</div>
    </div>
  </div>`;
  html += `<div class="us-cursor-preview-grid">
    ${renderCursorPreviewCard('auto', 'Default', 'Use the browser / webview cursor stack', 'Standard CSS cursor mode', currentCursorPref, currentCursorTheme)}
    ${renderCursorPreviewCard('forced', 'Custom overlay', 'Hide the OS cursor inside the app and draw the cursor manually', 'Best when the browser keeps showing the system cursor', currentCursorPref, currentCursorTheme)}
  </div>`;
  html += `<div class="us-cursor-theme-wrap"${currentCursorPref === 'forced' ? '' : ' hidden'}>
    <div class="ai-flow-toggle-row">
    <div class="ai-flow-toggle-label-wrap">
      <div class="ai-flow-toggle-label">Cursor theme</div>
      <div class="ai-flow-toggle-desc">Choose which custom overlay cursor set the app should use.</div>
    </div>
  </div>`;
  html += `<select class="unified-settings-select" id="us-cursor-theme">`;
  for (const opt of CURSOR_THEME_OPTIONS) {
    html += `<option value="${opt.value}"${opt.value === currentCursorTheme ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`;
  }
  html += `</select>`;
  html += `<div class="ai-flow-toggle-desc" id="us-cursor-theme-status"></div></div>`;

  // Map theme (unified — all providers in one grouped dropdown)
  const currentUnifiedTheme = getUnifiedTheme();
  html += `<div class="ai-flow-toggle-row">
    <div class="ai-flow-toggle-label-wrap">
      <div class="ai-flow-toggle-label">${t('preferences.mapTheme')}</div>
      <div class="ai-flow-toggle-desc">${t('preferences.mapThemeDesc')}</div>
    </div>
  </div>`;
  html += `<select class="unified-settings-select" id="us-map-theme">`;
  const seenGroups = new Set<string>();
  for (const opt of UNIFIED_THEME_OPTIONS) {
    if (!seenGroups.has(opt.group)) {
      if (seenGroups.size > 0) html += `</optgroup>`;
      html += `<optgroup label="${escapeHtml(opt.group)}">`;
      seenGroups.add(opt.group);
    }
    html += `<option value="${opt.value}"${opt.value === currentUnifiedTheme ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`;
  }
  if (seenGroups.size > 0) html += `</optgroup>`;
  html += `</select>`;

  html += toggleRowHtml('us-map-flash', t('components.insights.mapFlashLabel'), t('components.insights.mapFlashDesc'), settings.mapNewsFlash);

  // 3D Globe Visual Preset
  const currentPreset = getGlobeVisualPreset();
  html += `<div class="ai-flow-toggle-row">
    <div class="ai-flow-toggle-label-wrap">
      <div class="ai-flow-toggle-label">${t('preferences.globePreset')}</div>
      <div class="ai-flow-toggle-desc">${t('preferences.globePresetDesc')}</div>
    </div>
  </div>`;
  html += `<select class="unified-settings-select" id="us-globe-visual-preset">`;
  for (const opt of GLOBE_VISUAL_PRESET_OPTIONS) {
    const selected = opt.value === currentPreset ? ' selected' : '';
    html += `<option value="${opt.value}"${selected}>${escapeHtml(opt.label)}</option>`;
  }
  html += `</select>`;

  // Clock (timezone + format inline)
  const currentTz = getHeaderTimezone();
  const currentFmt = getClockFormat();
  html += `<div class="ai-flow-toggle-row">
    <div class="ai-flow-toggle-label-wrap">
      <div class="ai-flow-toggle-label">${t('preferences.clock')}</div>
      <div class="ai-flow-toggle-desc">${t('preferences.clockDesc')}</div>
    </div>
  </div>`;
  html += `<div class="us-clock-row">`;

  // Timezone select
  const tzGroups: Record<string, { value: string; label: string }[]> = {};
  const tzTopLevel: { value: string; label: string }[] = [];
  for (const opt of TIMEZONE_OPTIONS) {
    if (!opt.group) { tzTopLevel.push(opt); continue; }
    (tzGroups[opt.group] ??= []).push(opt);
  }
  html += `<select class="unified-settings-select us-clock-tz" id="us-header-timezone">`;
  for (const opt of tzTopLevel) {
    html += `<option value="${opt.value}"${opt.value === currentTz ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`;
  }
  for (const [group, opts] of Object.entries(tzGroups)) {
    html += `<optgroup label="${escapeHtml(group)}">`;
    for (const opt of opts) {
      html += `<option value="${opt.value}"${opt.value === currentTz ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`;
    }
    html += `</optgroup>`;
  }
  html += `</select>`;

  // Format select
  html += `<select class="unified-settings-select us-clock-fmt" id="us-header-clock-format">
    <option value="24h"${currentFmt === '24h' ? ' selected' : ''}>24h</option>
    <option value="12h"${currentFmt === '12h' ? ' selected' : ''}>12h</option>
  </select>`;

  html += `</div>`;

  // Language
  html += `<div class="ai-flow-section-label">${t('header.languageLabel')}</div>`;
  html += `<select class="unified-settings-lang-select" id="us-language">`;
  for (const lang of LANGUAGES) {
    const selected = lang.code === currentLang ? ' selected' : '';
    html += `<option value="${lang.code}"${selected}>${lang.flag} ${escapeHtml(lang.label)}</option>`;
  }
  html += `</select>`;
  if (currentLang === 'vi') {
    html += `<div class="ai-flow-toggle-desc">${t('components.languageSelector.mapLabelsFallbackVi')}</div>`;
  }

  html += `</div></details>`;

  // ── Intelligence group ──
  html += `<details class="wm-pref-group">`;
  html += `<summary>${t('preferences.intelligence')}</summary>`;
  html += `<div class="wm-pref-group-content">`;

  if (!host.isDesktopApp) {
    html += toggleRowHtml('us-cloud', t('components.insights.aiFlowCloudLabel'), t('components.insights.aiFlowCloudDesc'), settings.cloudLlm);
    html += toggleRowHtml('us-browser', t('components.insights.aiFlowBrowserLabel'), t('components.insights.aiFlowBrowserDesc'), settings.browserModel);
    html += `<div class="ai-flow-toggle-warn" style="display:${settings.browserModel ? 'block' : 'none'}">${t('components.insights.aiFlowBrowserWarn')}</div>`;
    html += `
      <div class="ai-flow-cta">
        <div class="ai-flow-cta-title">${t('components.insights.aiFlowOllamaCta')}</div>
        <div class="ai-flow-cta-desc">${t('components.insights.aiFlowOllamaCtaDesc')}</div>
        <a href="${DESKTOP_RELEASES_URL}" target="_blank" rel="noopener noreferrer" class="ai-flow-cta-link">${t('components.insights.aiFlowDownloadDesktop')}</a>
      </div>
    `;
  }

  html += toggleRowHtml('us-headline-memory', t('components.insights.headlineMemoryLabel'), t('components.insights.headlineMemoryDesc'), settings.headlineMemory);
  html += renderInsightSeverityControl(getInsightSeverityPreference());

  html += `</div></details>`;

  // ── Media group ──
  html += `<details class="wm-pref-group">`;
  html += `<summary>${t('preferences.media')}</summary>`;
  html += `<div class="wm-pref-group-content">`;

  const currentQuality = getStreamQuality();
  html += `<div class="ai-flow-toggle-row">
    <div class="ai-flow-toggle-label-wrap">
      <div class="ai-flow-toggle-label">${t('components.insights.streamQualityLabel')}</div>
      <div class="ai-flow-toggle-desc">${t('components.insights.streamQualityDesc')}</div>
    </div>
  </div>`;
  html += `<select class="unified-settings-select" id="us-stream-quality">`;
  for (const opt of STREAM_QUALITY_OPTIONS) {
    const selected = opt.value === currentQuality ? ' selected' : '';
    html += `<option value="${opt.value}"${selected}>${escapeHtml(opt.label)}</option>`;
  }
  html += `</select>`;

  html += toggleRowHtml(
    'us-live-streams-always-on',
    t('components.insights.streamAlwaysOnLabel'),
    t('components.insights.streamAlwaysOnDesc'),
    getLiveStreamsAlwaysOn(),
  );

  html += `</div></details>`;

  // ── Panels group ──
  html += `<details class="wm-pref-group">`;
  html += `<summary>${t('preferences.panels')}</summary>`;
  html += `<div class="wm-pref-group-content">`;
  html += toggleRowHtml('us-badge-anim', t('components.insights.badgeAnimLabel'), t('components.insights.badgeAnimDesc'), settings.badgeAnimation);
  html += `</div></details>`;

  // ── Data & Community group ──
  html += `<details class="wm-pref-group">`;
  html += `<summary>${t('preferences.dataAndCommunity')}</summary>`;
  html += `<div class="wm-pref-group-content">`;
  html += `
    <div class="us-data-mgmt">
      <button type="button" class="settings-btn settings-btn-secondary" id="usExportBtn">${t('components.settings.exportSettings')}</button>
      <button type="button" class="settings-btn settings-btn-secondary" id="usImportBtn">${t('components.settings.importSettings')}</button>
      <input type="file" id="usImportInput" accept=".json" class="us-hidden-input" />
    </div>
    <div class="us-data-mgmt-toast" id="usDataMgmtToast"></div>
  `;
  html += `</div></details>`;

  // AI status footer (web-only)
  if (!host.isDesktopApp) {
    html += `<div class="ai-flow-popup-footer"><span class="ai-flow-status-dot" id="usStatusDot"></span><span class="ai-flow-status-text" id="usStatusText"></span></div>`;
  }

  // Save Changes footer
  html += `<div class="us-save-footer"><span class="us-unsaved-hint" id="usUnsavedHint"></span><button type="button" class="us-save-btn" id="usSaveChangesBtn">Save Changes</button></div>`;

  return {
    html,
    attach(container: HTMLElement): () => void {
      const ac = new AbortController();
      const { signal } = ac;

      function markDirty(): void {
        const footer = container.querySelector<HTMLElement>('.us-save-footer');
        const hint = container.querySelector<HTMLElement>('#usUnsavedHint');
        if (footer) footer.classList.add('visible');
        if (hint) hint.textContent = 'Unsaved changes';
      }

      container.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;

        if (target.id === 'usImportInput') {
          const file = target.files?.[0];
          if (!file) return;
          importSettings(file).then((result: ImportResult) => {
            showToast(container, t('components.settings.importSuccess', { count: String(result.keysImported) }), true);
          }).catch(() => {
            showToast(container, t('components.settings.importFailed'), false);
          });
          target.value = '';
          return;
        }

        if (target.id === 'us-header-timezone') {
          setHeaderTimezone(target.value);
          markDirty();
          return;
        }
        if (target.id === 'us-header-clock-format') {
          setClockFormat(target.value as '12h' | '24h');
          markDirty();
          return;
        }
        if (target.id === 'us-stream-quality') {
          setStreamQuality(target.value as StreamQuality);
          markDirty();
          return;
        }
        if (target.id === 'us-globe-visual-preset') {
          setGlobeVisualPreset(target.value as GlobeVisualPreset);
          markDirty();
          return;
        }
        if (target.id === 'us-theme') {
          setThemePreference(target.value as ThemePreference);
          markDirty();
          return;
        }
        if (target.id === 'us-font-preference') {
          const value = target.value as FontPreference;
          setFontPreference(value);
          syncFontPreviewState(container, value);
          markDirty();
          return;
        }
        if (target.id === 'us-cursor-theme') {
          const value = target.value as CursorTheme;
          setCursorTheme(value);
          syncCursorThemePreview(container, value);
          void syncCursorThemeStatus(container, value);
          markDirty();
          return;
        }
        if (target.id === 'us-map-theme') {
          setUnifiedTheme(target.value);
          window.dispatchEvent(new CustomEvent('map-theme-changed'));
          markDirty();
          return;
        }
        if (target.id === 'us-live-streams-always-on') {
          setLiveStreamsAlwaysOn(target.checked);
          markDirty();
          return;
        }
        if (target.id === 'us-language') {
          trackLanguageChange(target.value);
          void changeLanguage(target.value);
          markDirty();
          return;
        }
        if (target.id === 'us-insight-sensitivity-range') {
          const option = INSIGHT_SEVERITY_OPTIONS[Number(target.value)]?.value;
          if (!option) return;
          setInsightSeverityPreference(option);
          syncInsightSeverityControl(container, option);
          markDirty();
          return;
        }
        if (target.id === 'us-cloud') {
          setAiFlowSetting('cloudLlm', target.checked);
          updateAiStatus(container);
          markDirty();
        } else if (target.id === 'us-browser') {
          setAiFlowSetting('browserModel', target.checked);
          const warn = container.querySelector('.ai-flow-toggle-warn') as HTMLElement;
          if (warn) warn.style.display = target.checked ? 'block' : 'none';
          updateAiStatus(container);
          markDirty();
        } else if (target.id === 'us-map-flash') {
          setAiFlowSetting('mapNewsFlash', target.checked);
          markDirty();
        } else if (target.id === 'us-headline-memory') {
          setAiFlowSetting('headlineMemory', target.checked);
          markDirty();
        } else if (target.id === 'us-badge-anim') {
          setAiFlowSetting('badgeAnimation', target.checked);
          markDirty();
        }
      }, { signal });

      container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const fontCard = target.closest<HTMLElement>('.us-font-preview-card');
        if (fontCard?.dataset.fontPreference) {
          const value = fontCard.dataset.fontPreference as FontPreference;
          const select = container.querySelector<HTMLSelectElement>('#us-font-preference');
          if (select) select.value = value;
          setFontPreference(value);
          syncFontPreviewState(container, value);
          markDirty();
          return;
        }
        const cursorCard = target.closest<HTMLElement>('.us-cursor-preview-card');
        if (cursorCard?.dataset.cursorPreference) {
          const value = cursorCard.dataset.cursorPreference as CursorPreference;
          setCursorPreference(value);
          syncCursorPreviewState(container, value);
          syncCursorThemeVisibility(container, value);
          markDirty();
          return;
        }
        if (target.closest('#usSaveChangesBtn')) {
          const btn = container.querySelector<HTMLButtonElement>('#usSaveChangesBtn');
          const footer = container.querySelector<HTMLElement>('.us-save-footer');
          const hint = container.querySelector<HTMLElement>('#usUnsavedHint');
          if (btn) {
            btn.textContent = 'Saved!';
            btn.disabled = true;
          }
          if (hint) hint.textContent = '';
          setTimeout(() => {
            footer?.classList.remove('visible');
            if (btn) { btn.textContent = 'Save Changes'; btn.disabled = false; }
          }, 1500);
          return;
        }
        if (target.closest('#usExportBtn')) {
          try {
            exportSettings();
            showToast(container, t('components.settings.exportSuccess'), true);
          } catch {
            showToast(container, t('components.settings.exportFailed'), false);
          }
          return;
        }
        if (target.closest('#usImportBtn')) {
          container.querySelector<HTMLInputElement>('#usImportInput')?.click();
          return;
        }
        const sensitivityOption = target.closest<HTMLElement>('[data-insight-sensitivity]');
        if (sensitivityOption?.dataset.insightSensitivity) {
          const value = sensitivityOption.dataset.insightSensitivity as InsightSeverityPreference;
          const range = container.querySelector<HTMLInputElement>('#us-insight-sensitivity-range');
          const nextIndex = INSIGHT_SEVERITY_OPTIONS.findIndex((option) => option.value === value);
          if (range && nextIndex >= 0) range.value = String(nextIndex);
          setInsightSeverityPreference(value);
          syncInsightSeverityControl(container, value);
          markDirty();
          return;
        }
      }, { signal });

      if (!host.isDesktopApp) updateAiStatus(container);
      syncCursorThemePreview(container, currentCursorTheme);
      syncCursorThemeVisibility(container, currentCursorPref);
      void syncCursorThemeStatus(container, currentCursorTheme);
      syncCursorPreviewState(container, currentCursorPref);
      syncInsightSeverityControl(container, getInsightSeverityPreference());

      return () => ac.abort();
    },
  };
}

function renderFontPreviewCard(value: FontPreference, title: string, subtitle: string, sample: string, current: FontPreference): string {
  const active = current === value ? ' active' : '';
  return `
    <button type="button" class="us-font-preview-card${active}" data-font-preference="${value}">
      <div class="us-font-preview-top">
        <span class="us-font-preview-title">${escapeHtml(title)}</span>
        <span class="us-font-preview-subtitle">${escapeHtml(subtitle)}</span>
      </div>
      <div class="us-font-preview-sample us-font-preview-sample-${value}">${escapeHtml(sample)}</div>
    </button>
  `;
}

function renderCursorPreviewCard(
  value: CursorPreference,
  title: string,
  subtitle: string,
  sample: string,
  current: CursorPreference,
  theme: CursorTheme,
): string {
  const active = current === value ? ' active' : '';
  const cursorKind = value === 'forced' ? 'move' : 'default';
  const icon = getCursorPreviewUrl(cursorKind, theme);
  const badge = value === 'forced' ? 'CUSTOM' : 'DEFAULT';
  return `
    <button type="button" class="us-cursor-preview-card${active}" data-cursor-preference="${value}">
      <div class="us-font-preview-top">
        <span class="us-font-preview-title">${escapeHtml(title)}</span>
        <span class="us-font-preview-subtitle">${escapeHtml(subtitle)}</span>
      </div>
      <div class="us-cursor-preview-sample">
        <img src="${icon}" alt="" class="us-cursor-preview-image" data-cursor-kind="${cursorKind}" />
        <div class="us-cursor-preview-copy">
          <span class="us-cursor-preview-badge">${escapeHtml(badge)}</span>
          <span class="us-cursor-preview-text">${escapeHtml(sample)}</span>
        </div>
      </div>
    </button>
  `;
}

function syncFontPreviewState(container: HTMLElement, value: FontPreference): void {
  container.querySelectorAll<HTMLElement>('.us-font-preview-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.fontPreference === value);
  });
}

function syncCursorPreviewState(container: HTMLElement, value: CursorPreference): void {
  container.querySelectorAll<HTMLElement>('.us-cursor-preview-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.cursorPreference === value);
  });
}

function syncCursorThemeVisibility(container: HTMLElement, value: CursorPreference): void {
  const wrap = container.querySelector<HTMLElement>('.us-cursor-theme-wrap');
  if (!wrap) return;
  wrap.toggleAttribute('hidden', value !== 'forced');
}

function syncCursorThemePreview(container: HTMLElement, theme: CursorTheme): void {
  container.querySelectorAll<HTMLImageElement>('.us-cursor-preview-image[data-cursor-kind]').forEach((img) => {
    const kind = img.dataset.cursorKind as 'default' | 'move' | undefined;
    if (!kind) return;
    img.src = getCursorPreviewUrl(kind, kind === 'default' ? 'classic' : theme);
  });
}

async function syncCursorThemeStatus(container: HTMLElement, value: CursorTheme): Promise<void> {
  const statusEl = container.querySelector<HTMLElement>('#us-cursor-theme-status');
  if (!statusEl) return;
  const option = CURSOR_THEME_OPTIONS.find((item) => item.value === value) ?? CURSOR_THEME_OPTIONS[0]!;
  if (value === 'classic') {
    statusEl.textContent = option.description;
    return;
  }
  statusEl.textContent = `Checking ${option.label}…`;
  const available = await checkCursorThemeAvailability(value);
  if (container.querySelector<HTMLSelectElement>('#us-cursor-theme')?.value !== value) return;
  statusEl.textContent = available
    ? option.description
    : `${option.label} is missing from this build. Expected /public/cursors/${value}/1-Normal-Select.cur.png.`;
}

function syncInsightSeverityControl(container: HTMLElement, value: InsightSeverityPreference): void {
  const summary = container.querySelector<HTMLElement>('#usInsightSensitivitySummary');
  const wrapper = container.querySelector<HTMLElement>('.us-insight-sensitivity');
  const nextOption = INSIGHT_SEVERITY_OPTIONS.find((option) => option.value === value);
  if (wrapper) wrapper.dataset.currentValue = value;
  if (summary && nextOption) summary.textContent = nextOption.description;
  container.querySelectorAll<HTMLElement>('.us-insight-sensitivity-option').forEach((optionEl) => {
    const active = optionEl.dataset.insightSensitivity === value;
    optionEl.classList.toggle('active', active);
    optionEl.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function showToast(container: HTMLElement, msg: string, success: boolean): void {
  const toast = container.querySelector('#usDataMgmtToast');
  if (!toast) return;
  toast.className = `us-data-mgmt-toast ${success ? 'ok' : 'error'}`;
  toast.innerHTML = success
    ? `${escapeHtml(msg)} <a href="#" class="us-toast-reload">${t('components.settings.reloadNow')}</a>`
    : escapeHtml(msg);
  toast.querySelector('.us-toast-reload')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.reload();
  });
}
