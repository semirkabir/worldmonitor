import { LANGUAGES, getCurrentLanguage, changeLanguage, t } from '@/services/i18n';
import { getAiFlowSettings, setAiFlowSetting, getStreamQuality, setStreamQuality, STREAM_QUALITY_OPTIONS } from '@/services/ai-flow-settings';
import { getUnifiedTheme, setUnifiedTheme, UNIFIED_THEME_OPTIONS } from '@/config/basemap';
import { getLiveStreamsAlwaysOn, setLiveStreamsAlwaysOn } from '@/services/live-stream-settings';
import { getGlobeVisualPreset, setGlobeVisualPreset, GLOBE_VISUAL_PRESET_OPTIONS, type GlobeVisualPreset } from '@/services/globe-render-settings';
import type { StreamQuality } from '@/services/ai-flow-settings';
import { getThemePreference, setThemePreference, type ThemePreference } from '@/utils/theme-manager';
import { escapeHtml } from '@/utils/sanitize';
import { trackLanguageChange } from '@/services/analytics';
import { exportSettings, importSettings, type ImportResult } from '@/utils/settings-persistence';

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
      }, { signal });

      if (!host.isDesktopApp) updateAiStatus(container);

      return () => ac.abort();
    },
  };
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
