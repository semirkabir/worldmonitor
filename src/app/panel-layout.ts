import type { AppContext, AppModule } from '@/app/app-context';
import { replayPendingCalls, clearAllPendingCalls } from '@/app/pending-panel-data';
import type { RelatedAsset } from '@/types';
import type { TheaterPostureSummary } from '@/services/military-surge';
import {
  MapContainer,
  NewsPanel,
  MarketPanel,
  HeatmapPanel,
  CommoditiesPanel,
  CryptoPanel,
  PredictionPanel,
  MonitorPanel,
  EconomicPanel,
  GdeltIntelPanel,
  LiveNewsPanel,
  LiveWebcamsPanel,
  CIIPanel,
  CascadePanel,
  StrategicRiskPanel,
  StrategicPosturePanel,
  TechEventsPanel,
  ServiceStatusPanel,
  RuntimeConfigPanel,
  InsightsPanel,
  MacroSignalsPanel,
  ETFFlowsPanel,
  StablecoinPanel,
  UcdpEventsPanel,
  InvestmentsPanel,
  TradePolicyPanel,
  SupplyChainPanel,
  GulfEconomiesPanel,
  WorldClockPanel,
  AirlineIntelPanel,
  AviationCommandBar,
  EconomicCalendarPanel,
  SanctionsTrackerPanel,
  SolarWeatherPanel,
  AlertRulesPanel,
  GeopoliticalRiskPanel,
  CorrelationMatrixPanel,
  TradeFlowPanel,
  EarningsCalendarPanel,
  IPOCalendarPanel,
  InsiderTradingPanel,
  SocialSentimentPanel,
  OptionsChainPanel,
  PortfolioPanel,
} from '@/components';
import { SatelliteFiresPanel } from '@/components/SatelliteFiresPanel';
import { MarketplacePanel } from '@/components/MarketplacePanel';
import { focusInvestmentOnMap } from '@/services/investments-focus';
import { debounce, saveToStorage, loadFromStorage } from '@/utils';
import { escapeHtml } from '@/utils/sanitize';
import {
  FEEDS,
  INTEL_SOURCES,
  DEFAULT_PANELS,
  STORAGE_KEYS,
  SITE_VARIANT,
  getVariantStorageKey,
} from '@/config';
import { BETA_MODE } from '@/config/beta';
import { t } from '@/services/i18n';
import { getCurrentTheme } from '@/utils';
import { trackCriticalBannerAction } from '@/services/analytics';
import { getSecretState } from '@/services/runtime-config';
import { checkFeatureAccess } from '@/services/auth-modal';
import { isLoggedIn } from '@/services/user-auth';
import { LIMITED_LOCAL_RPC_DEV_MODE } from '@/services/local-dev-stability';

export interface PanelLayoutCallbacks {
  openCountryStory: (code: string, name: string) => void;
  openCountryBrief: (code: string) => void;
  loadAllData: () => Promise<void>;
  updateMonitorResults: () => void;
  loadSecurityAdvisories?: () => Promise<void>;
}

export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  createdAt: number;
}

const CUSTOM_CATEGORIES_KEY = 'wm-custom-categories-v1';
const NEWS_REFRESH_SWEEP_EVENT = 'wm:news-refresh-sweep';

function loadCustomCategories(): CustomCategory[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomCategory[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomCategories(categories: CustomCategory[]): void {
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
  } catch {
    // ignore
  }
}

function generateCategoryId(): string {
  return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

export class PanelLayoutManager implements AppModule {
  private ctx: AppContext;
  private callbacks: PanelLayoutCallbacks;
  private panelDragCleanupHandlers: Array<() => void> = [];
  private resolvedPanelOrder: string[] = [];
  private bottomSetMemory: Set<string> = new Set();
  private criticalBannerEl: HTMLElement | null = null;
  private aviationCommandBar: AviationCommandBar | null = null;
  private readonly applyTimeRangeFilterDebounced: (() => void) & { cancel(): void };
  private customCategories: CustomCategory[] = [];
  private hoverTimers: Map<string, number> = new Map();
  private newsRefreshSweepCleanup: (() => void) | null = null;

  constructor(ctx: AppContext, callbacks: PanelLayoutCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.applyTimeRangeFilterDebounced = debounce(() => {
      this.applyTimeRangeFilterToNewsPanels();
    }, 120);
    this.customCategories = loadCustomCategories();
  }

  init(): void {
    this.renderLayout();
    this.setupNewsRefreshSweepEffect();
    this.initShellGuidanceAfterRender();
  }

  destroy(): void {
    clearAllPendingCalls();
    this.applyTimeRangeFilterDebounced.cancel();
    this.newsRefreshSweepCleanup?.();
    this.newsRefreshSweepCleanup = null;
    this.panelDragCleanupHandlers.forEach((cleanup) => cleanup());
    this.panelDragCleanupHandlers = [];
    if (this.criticalBannerEl) {
      this.criticalBannerEl.remove();
      this.criticalBannerEl = null;
    }
    // Clean up happy variant panels
    this.ctx.tvMode?.destroy();
    this.ctx.tvMode = null;
    this.ctx.countersPanel?.destroy();
    this.ctx.progressPanel?.destroy();
    this.ctx.breakthroughsPanel?.destroy();
    this.ctx.heroPanel?.destroy();
    this.ctx.digestPanel?.destroy();
    this.ctx.speciesPanel?.destroy();
    this.ctx.renewablePanel?.destroy();

    // Clean up aviation components
    this.aviationCommandBar?.destroy();
    this.aviationCommandBar = null;
    this.ctx.panels['airline-intel']?.destroy();

    window.removeEventListener('resize', this.ensureCorrectZones);
  }

  renderLayout(): void {
    this.ctx.container.innerHTML = `
      ${this.ctx.isDesktopApp ? '<div class="tauri-titlebar" data-tauri-drag-region></div>' : ''}
      <div class="header">
        <div class="header-left">
          <button class="hamburger-btn" id="hamburgerBtn" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div class="variant-switcher" id="variantSwitcher">${(() => {
        const local = this.ctx.isDesktopApp || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const vHref = (v: string, prod: string) => local || SITE_VARIANT === v ? '#' : prod;
        const vTarget = (_v: string) => '';
        const customCats = this.customCategories.map(cat => `
            <span class="variant-divider"></span>
            <a href="#"
               class="variant-option custom-category"
               data-custom-id="${cat.id}"
               title="${escapeHtml(cat.name)}">
              <span class="variant-icon">${cat.icon}</span>
              <span class="variant-label">${escapeHtml(cat.name)}</span>
              <button class="variant-delete" data-delete-id="${cat.id}" title="Delete category">×</button>
            </a>
        `).join('');
        return `
            <a href="${vHref('full', 'https://worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'full' ? 'active' : ''}"
               data-variant="full"
               ${vTarget('full')}
               title="${t('header.world')}${SITE_VARIANT === 'full' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">🌍</span>
              <span class="variant-label">${t('header.world')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('tech', 'https://tech.worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'tech' ? 'active' : ''}"
               data-variant="tech"
               ${vTarget('tech')}
               title="${t('header.tech')}${SITE_VARIANT === 'tech' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">💻</span>
              <span class="variant-label">${t('header.tech')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('finance', 'https://finance.worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'finance' ? 'active' : ''}"
               data-variant="finance"
               ${vTarget('finance')}
               title="${t('header.finance')}${SITE_VARIANT === 'finance' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">📈</span>
              <span class="variant-label">${t('header.finance')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('commodity', 'https://commodity.worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'commodity' ? 'active' : ''}"
               data-variant="commodity"
               ${vTarget('commodity')}
               title="${t('header.commodity')}${SITE_VARIANT === 'commodity' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">⛏️</span>
              <span class="variant-label">${t('header.commodity')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('happy', 'https://happy.worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'happy' ? 'active' : ''}"
               data-variant="happy"
               ${vTarget('happy')}
               title="${t('header.happy')}${SITE_VARIANT === 'happy' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">☀️</span>
              <span class="variant-label">${t('header.happy')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('conflicts', 'https://conflicts.worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'conflicts' ? 'active' : ''}"
               data-variant="conflicts"
               ${vTarget('conflicts')}
               title="${t('header.conflicts')}${SITE_VARIANT === 'conflicts' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">⚔️</span>
              <span class="variant-label">${t('header.conflicts')}</span>
            </a>
            ${customCats}
            <span class="variant-divider"></span>
            <button class="variant-option new-category" id="newCategoryBtn" title="Create new category">
              <span class="variant-icon">+</span>
              <span class="variant-label">New</span>
            </button>`;
      })()}</div>
          <span class="logo-mobile">World Monitor</span>${BETA_MODE ? '<span class="beta-badge">BETA</span>' : ''}
          <button class="mobile-settings-btn" id="mobileSettingsBtn" title="${t('header.settings')}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <div class="status-indicator">
            <span class="status-dot ${isLoggedIn() ? '' : 'delayed'}" id="statusDot"></span>
            <span id="statusText">${isLoggedIn() ? t('header.live') : '10 mins'}</span>
          </div>
          <div class="region-selector">
            <select id="regionSelect" class="region-select">
              <option value="global">${t('components.deckgl.views.global')}</option>
              <option value="america">${t('components.deckgl.views.americas')}</option>
              <option value="mena">${t('components.deckgl.views.mena')}</option>
              <option value="eu">${t('components.deckgl.views.europe')}</option>
              <option value="asia">${t('components.deckgl.views.asia')}</option>
              <option value="latam">${t('components.deckgl.views.latam')}</option>
              <option value="africa">${t('components.deckgl.views.africa')}</option>
              <option value="oceania">${t('components.deckgl.views.oceania')}</option>
            </select>
          </div>
          <button class="mobile-search-btn" id="mobileSearchBtn" aria-label="${t('header.search')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <div class="header-right">
          <button class="search-btn" id="searchBtn"><kbd>⌥</kbd> ${t('header.search')}</button>
          ${this.ctx.isDesktopApp ? '' : `<div class="save-reset-dropdown" id="saveResetDropdown"><button class="copy-link-btn" id="saveResetLayoutBtn">${t('header.saveResetLayout')}</button><div class="save-reset-menu"><button id="saveLayoutBtn">${t('header.saveLayout')}</button><button id="resetLayoutBtn">${t('header.resetLayout')}</button></div></div>`}

          <button class="theme-toggle-btn" id="headerThemeToggle" title="${t('header.toggleTheme')}">
            ${getCurrentTheme() === 'dark'
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>'}
          </button>
          ${this.ctx.isDesktopApp ? '' : `<button class="fullscreen-btn" id="fullscreenBtn" title="${t('header.fullscreen')}">⛶</button>`}
          ${SITE_VARIANT === 'happy' ? `<button class="tv-mode-btn" id="tvModeBtn" title="TV Mode (Shift+T)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></button>` : ''}
          <span id="unifiedSettingsMount"></span>
        </div>
      </div>
      <div class="shell-guidance-strip" id="shellGuidanceStrip" role="note">
        <div class="shell-guidance-copy">
          <strong>Faster navigation:</strong> use Cmd/Ctrl+K to jump between regions, layers, and panels. Save your view, share it, or reset back to the default layout from the shell.
        </div>
        <div class="shell-guidance-actions">
          <button type="button" class="shell-guidance-btn" id="shellGuidanceSearch">Open search</button>
          <button type="button" class="shell-guidance-btn" id="shellGuidanceDismiss">Dismiss</button>
        </div>
      </div>
      ${LIMITED_LOCAL_RPC_DEV_MODE ? `
      <div class="local-dev-api-notice" role="note">
        <div class="local-dev-api-notice-copy">
          <strong>Local API mode:</strong> some RPC-backed panels are off by default in web dev because their local routes are unavailable. They still remain in Add Panel if you want to test them manually.
        </div>
      </div>
      ` : ''}
      <div class="mobile-menu-overlay" id="mobileMenuOverlay"></div>
      <nav class="mobile-menu" id="mobileMenu">
        <div class="mobile-menu-header">
          <span class="mobile-menu-title">WORLD MONITOR</span>
          <button class="mobile-menu-close" id="mobileMenuClose" aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="mobile-menu-divider"></div>
        ${(() => {
        const variants = [
          { key: 'full', icon: '🌍', label: t('header.world') },
          { key: 'tech', icon: '💻', label: t('header.tech') },
          { key: 'finance', icon: '📈', label: t('header.finance') },
          { key: 'commodity', icon: '⛏️', label: t('header.commodity') },
          { key: 'happy', icon: '☀️', label: 'Good News' },
          { key: 'conflicts', icon: '⚔️', label: t('header.conflicts') },
        ];
        return variants.map(v =>
          `<button class="mobile-menu-item mobile-menu-variant ${v.key === SITE_VARIANT ? 'active' : ''}" data-variant="${v.key}">
            <span class="mobile-menu-item-icon">${v.icon}</span>
            <span class="mobile-menu-item-label">${v.label}</span>
            ${v.key === SITE_VARIANT ? '<span class="mobile-menu-check">✓</span>' : ''}
          </button>`
        ).join('');
      })()}
        <div class="mobile-menu-divider"></div>
        <button class="mobile-menu-item" id="mobileMenuRegion">
          <span class="mobile-menu-item-icon">🌐</span>
          <span class="mobile-menu-item-label">${t('components.deckgl.views.global')}</span>
          <span class="mobile-menu-chevron">▸</span>
        </button>
        <div class="mobile-menu-divider"></div>
        <button class="mobile-menu-item" id="mobileMenuSettings">
          <span class="mobile-menu-item-icon">⚙️</span>
          <span class="mobile-menu-item-label">${t('header.settings')}</span>
        </button>
        <button class="mobile-menu-item" id="mobileMenuHelp">
          <span class="mobile-menu-item-icon">?</span>
          <span class="mobile-menu-item-label">Help & shortcuts</span>
        </button>
        <button class="mobile-menu-item" id="mobileMenuTheme">
          <span class="mobile-menu-item-icon">${getCurrentTheme() === 'dark' ? '☀️' : '🌙'}</span>
          <span class="mobile-menu-item-label">${getCurrentTheme() === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <div class="mobile-menu-divider"></div>
      </nav>
      <div class="mobile-help-overlay" id="mobileHelpOverlay">
        <div class="mobile-help-sheet" id="mobileHelpSheet">
          <div class="mobile-help-header">
            <div>
              <div class="mobile-help-eyebrow">World Monitor</div>
              <div class="mobile-help-title">Mobile control guide</div>
            </div>
            <button class="mobile-help-close" id="mobileHelpClose" aria-label="Close">×</button>
          </div>
          <div class="mobile-help-list">
            <div class="mobile-help-item"><strong>Search</strong><span>Use the floating search button to jump to regions, layers, and panels.</span></div>
            <div class="mobile-help-item"><strong>Map</strong><span>Tap markers for details and drag the popup sheet upward for more context.</span></div>
            <div class="mobile-help-item"><strong>Layout</strong><span>Save, share, or reset the current view directly from the header.</span></div>
          </div>
          <div class="mobile-help-actions">
            <button type="button" class="shell-guidance-btn" id="mobileHelpDismiss">Don’t show again</button>
            <button type="button" class="shell-guidance-btn primary" id="mobileHelpDone">Continue</button>
          </div>
        </div>
      </div>
      <div class="region-sheet-backdrop" id="regionSheetBackdrop"></div>
      <div class="region-bottom-sheet" id="regionBottomSheet">
        <div class="region-sheet-header">${t('header.selectRegion')}</div>
        <div class="region-sheet-divider"></div>
        ${[
        { value: 'global', label: t('components.deckgl.views.global') },
        { value: 'america', label: t('components.deckgl.views.americas') },
        { value: 'mena', label: t('components.deckgl.views.mena') },
        { value: 'eu', label: t('components.deckgl.views.europe') },
        { value: 'asia', label: t('components.deckgl.views.asia') },
        { value: 'latam', label: t('components.deckgl.views.latam') },
        { value: 'africa', label: t('components.deckgl.views.africa') },
        { value: 'oceania', label: t('components.deckgl.views.oceania') },
      ].map(r =>
        `<button class="region-sheet-option ${r.value === 'global' ? 'active' : ''}" data-region="${r.value}">
          <span>${r.label}</span>
          <span class="region-sheet-check">${r.value === 'global' ? '✓' : ''}</span>
        </button>`
      ).join('')}
      </div>
      <div class="main-content">
        <div class="map-section" id="mapSection">
          <div class="panel-header">
            <div class="panel-header-left">
              <span class="panel-title"><span class="panel-title-edge">Edge</span><span class="panel-title-pannel">Pannel</span></span>
            </div>
            <span class="header-clock" id="headerClock" translate="no"></span>
            <div class="map-header-actions">
              <div class="map-dimension-toggle" id="mapDimensionToggle">
                <button class="map-dim-btn${loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe' ? '' : ' active'}" data-mode="flat" title="2D Map">2D</button>
                <button class="map-dim-btn${loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe' ? ' active' : ''}" data-mode="globe" title="3D Globe">3D</button>
              </div>
              <button class="map-pin-btn" id="mapFullscreenBtn" title="Fullscreen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
              </button>
              <button class="map-pin-btn" id="mapPinBtn" title="${t('header.pinMap')}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v1a1 1 0 001 1 1 1 0 011 1v3.76z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="map-container" id="mapContainer"></div>
          ${SITE_VARIANT === 'happy' ? '<button class="tv-exit-btn" id="tvExitBtn">Exit TV Mode</button>' : ''}
          <div class="bottom-grid-resize-handle" id="bottomGridResizeHandle">
            <div class="corner-resize-handle" id="cornerResizeHandle" title="Drag to resize both panels"></div>
          </div>
          <div class="map-bottom-grid" id="mapBottomGrid"></div>
          <div class="map-resize-handle" id="mapResizeHandle"></div>
        </div>
        <div class="panels-grid" id="panelsGrid"></div>
        <button class="search-mobile-fab" id="searchMobileFab" aria-label="Search">\u{1F50D}</button>
      </div>
    `;

    this.createPanels();
    this.setupCustomCategoryHandlers();

    if (this.ctx.isMobile) {
      this.setupMobileMapToggle();
    }
  }

  private setupCustomCategoryHandlers(): void {
    const variantSwitcher = document.getElementById('variantSwitcher');
    if (!variantSwitcher) return;

    // Handle "New" category button
    const newCategoryBtn = document.getElementById('newCategoryBtn');
    newCategoryBtn?.addEventListener('click', () => this.handleCreateCategory());

    // Handle hover effects and delete buttons for custom categories
    const customCategoryLinks = variantSwitcher.querySelectorAll('.custom-category');
    customCategoryLinks.forEach((link) => {
      const categoryId = link.getAttribute('data-custom-id');
      if (!categoryId) return;

      // Prevent default link behavior on click
      link.addEventListener('click', (e) => {
        e.preventDefault();
      });

      // Show delete button after 3 seconds of hover
      link.addEventListener('mouseenter', () => {
        const timer = window.setTimeout(() => {
          link.classList.add('show-delete');
        }, 3000);
        this.hoverTimers.set(categoryId, timer);
      });

      // Cancel timer and hide delete button on mouse leave
      link.addEventListener('mouseleave', () => {
        const timer = this.hoverTimers.get(categoryId);
        if (timer) {
          window.clearTimeout(timer);
          this.hoverTimers.delete(categoryId);
        }
        link.classList.remove('show-delete');
      });
    });

    // Handle delete button clicks
    variantSwitcher.addEventListener('click', (e) => {
      const deleteBtn = (e.target as HTMLElement).closest('.variant-delete');
      if (!deleteBtn) return;
      e.preventDefault();
      e.stopPropagation();
      const categoryId = deleteBtn.getAttribute('data-delete-id');
      if (categoryId) {
        this.handleDeleteCategory(categoryId);
      }
    });
  }

  private handleCreateCategory(): void {
    // Remove any existing modal
    document.querySelector('.custom-category-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'custom-category-modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    const modal = document.createElement('div');
    modal.className = 'custom-category-modal';

    const title = document.createElement('div');
    title.className = 'custom-category-modal-title';
    title.textContent = 'Create Custom Category';
    modal.appendChild(title);

    const nameLabel = document.createElement('label');
    nameLabel.className = 'custom-category-modal-label';
    nameLabel.textContent = 'Category name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'custom-category-modal-input';
    nameInput.placeholder = 'e.g. My Watch List';
    nameInput.maxLength = 40;
    nameInput.focus();
    nameLabel.appendChild(nameInput);
    modal.appendChild(nameLabel);

    const iconLabel = document.createElement('label');
    iconLabel.className = 'custom-category-modal-label';
    iconLabel.textContent = 'Icon (emoji)';
    const iconInput = document.createElement('input');
    iconInput.type = 'text';
    iconInput.className = 'custom-category-modal-input';
    iconInput.placeholder = 'e.g. 🎯 📌 🔔';
    iconInput.maxLength = 2;
    iconInput.value = '📁';
    iconLabel.appendChild(iconInput);
    modal.appendChild(iconLabel);

    const actions = document.createElement('div');
    actions.className = 'custom-category-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'custom-category-modal-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(cancelBtn);

    const createBtn = document.createElement('button');
    createBtn.className = 'custom-category-modal-btn create';
    createBtn.textContent = 'Create';
    createBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const icon = iconInput.value.trim() || '📁';

      const newCategory: CustomCategory = {
        id: generateCategoryId(),
        name: name,
        icon: icon,
        createdAt: Date.now(),
      };

      this.customCategories.push(newCategory);
      saveCustomCategories(this.customCategories);
      overlay.remove();
      this.renderLayout();
      this.initShellGuidanceAfterRender();
    });
    actions.appendChild(createBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Allow Enter to create, Escape to cancel
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createBtn.click();
      if (e.key === 'Escape') overlay.remove();
    });
    iconInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createBtn.click();
      if (e.key === 'Escape') overlay.remove();
    });
  }

  private handleDeleteCategory(categoryId: string): void {
    const category = this.customCategories.find(c => c.id === categoryId);
    if (!category) return;

    const confirmed = confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;

    this.customCategories = this.customCategories.filter(c => c.id !== categoryId);
    saveCustomCategories(this.customCategories);
    this.renderLayout();
    this.initShellGuidanceAfterRender();
  }

  private setupMobileMapToggle(): void {
    const mapSection = document.getElementById('mapSection');
    const headerLeft = mapSection?.querySelector('.panel-header-left');
    if (!mapSection || !headerLeft) return;

    const stored = localStorage.getItem('mobile-map-collapsed');
    const collapsed = stored === 'true';
    if (collapsed) mapSection.classList.add('collapsed');

    const updateBtn = (btn: HTMLButtonElement, isCollapsed: boolean) => {
      btn.textContent = isCollapsed ? `▶ ${t('components.map.showMap')}` : `▼ ${t('components.map.hideMap')}`;
    };

    const btn = document.createElement('button');
    btn.className = 'map-collapse-btn';
    updateBtn(btn, collapsed);
    headerLeft.after(btn);

    btn.addEventListener('click', () => {
      const isCollapsed = mapSection.classList.toggle('collapsed');
      updateBtn(btn, isCollapsed);
      localStorage.setItem('mobile-map-collapsed', String(isCollapsed));
      if (!isCollapsed) window.dispatchEvent(new Event('resize'));
    });
  }

  renderCriticalBanner(postures: TheaterPostureSummary[]): void {
    if (this.ctx.isMobile) {
      if (this.criticalBannerEl) {
        this.criticalBannerEl.remove();
        this.criticalBannerEl = null;
      }
      document.body.classList.remove('has-critical-banner');
      return;
    }

    const dismissedAt = sessionStorage.getItem('banner-dismissed');
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < 30 * 60 * 1000) {
      return;
    }

    const critical = postures.filter(
      (p) => p.postureLevel === 'critical' || (p.postureLevel === 'elevated' && p.strikeCapable)
    );

    if (critical.length === 0) {
      if (this.criticalBannerEl) {
        this.criticalBannerEl.remove();
        this.criticalBannerEl = null;
        document.body.classList.remove('has-critical-banner');
      }
      return;
    }

    const top = critical[0]!;
    const isCritical = top.postureLevel === 'critical';

    if (!this.criticalBannerEl) {
      this.criticalBannerEl = document.createElement('div');
      this.criticalBannerEl.className = 'critical-posture-banner';
      const header = document.querySelector('.header');
      if (header) header.insertAdjacentElement('afterend', this.criticalBannerEl);
    }

    document.body.classList.add('has-critical-banner');
    this.criticalBannerEl.className = `critical-posture-banner ${isCritical ? 'severity-critical' : 'severity-elevated'}`;
    this.criticalBannerEl.innerHTML = `
      <div class="banner-content">
        <span class="banner-icon">${isCritical ? '🚨' : '⚠️'}</span>
        <span class="banner-headline">${escapeHtml(top.headline)}</span>
        <span class="banner-stats">${top.totalAircraft} aircraft • ${escapeHtml(top.summary)}</span>
        ${top.strikeCapable ? '<span class="banner-strike">STRIKE CAPABLE</span>' : ''}
      </div>
      <button class="banner-view" data-lat="${top.centerLat}" data-lon="${top.centerLon}">View Region</button>
      <button class="banner-dismiss">×</button>
    `;

    this.criticalBannerEl.querySelector('.banner-view')?.addEventListener('click', () => {
      console.log('[Banner] View Region clicked:', top.theaterId, 'lat:', top.centerLat, 'lon:', top.centerLon);
      trackCriticalBannerAction('view', top.theaterId);
      if (typeof top.centerLat === 'number' && typeof top.centerLon === 'number') {
        this.ctx.map?.setCenter(top.centerLat, top.centerLon, 4);
      } else {
        console.error('[Banner] Missing coordinates for', top.theaterId);
      }
    });

    this.criticalBannerEl.querySelector('.banner-dismiss')?.addEventListener('click', () => {
      trackCriticalBannerAction('dismiss', top.theaterId);
      this.criticalBannerEl?.classList.add('dismissed');
      document.body.classList.remove('has-critical-banner');
      sessionStorage.setItem('banner-dismissed', Date.now().toString());
    });
  }

  applyPanelSettings(): void {
    Object.entries(this.ctx.panelSettings).forEach(([key, config]) => {
      if (key === 'map') {
        const mapSection = document.getElementById('mapSection');
        if (mapSection) {
          mapSection.classList.toggle('hidden', !config.enabled);
          const mainContent = document.querySelector('.main-content');
          if (mainContent) {
            mainContent.classList.toggle('map-hidden', !config.enabled);
          }
        }
        return;
      }
      const panel = this.ctx.panels[key];
      panel?.toggle(config.enabled);
    });
  }

  private createPanels(): void {
    const panelsGrid = document.getElementById('panelsGrid')!;

    const mapContainer = document.getElementById('mapContainer') as HTMLElement;
    const preferGlobe = loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe';
    this.ctx.map = new MapContainer(mapContainer, {
      zoom: this.ctx.isMobile ? 2.5 : 1.0,
      pan: { x: 0, y: 0 },
      view: this.ctx.isMobile ? this.ctx.resolvedLocation : 'global',
      layers: this.ctx.mapLayers,
      timeRange: '7d',
    }, preferGlobe);

    this.ctx.map.initEscalationGetters();
    this.ctx.currentTimeRange = this.ctx.map.getTimeRange();

    const politicsPanel = new NewsPanel('politics', t('panels.politics'));
    this.attachRelatedAssetHandlers(politicsPanel);
    this.ctx.newsPanels['politics'] = politicsPanel;
    this.ctx.panels['politics'] = politicsPanel;

    const techPanel = new NewsPanel('tech', t('panels.tech'));
    this.attachRelatedAssetHandlers(techPanel);
    this.ctx.newsPanels['tech'] = techPanel;
    this.ctx.panels['tech'] = techPanel;

    const financePanel = new NewsPanel('finance', t('panels.finance'));
    this.attachRelatedAssetHandlers(financePanel);
    this.ctx.newsPanels['finance'] = financePanel;
    this.ctx.panels['finance'] = financePanel;

    const heatmapPanel = new HeatmapPanel();
    this.ctx.panels['heatmap'] = heatmapPanel;

    const marketsPanel = new MarketPanel();
    this.ctx.panels['markets'] = marketsPanel;

    const monitorPanel = new MonitorPanel(this.ctx.monitors);
    this.ctx.panels['monitors'] = monitorPanel;
    monitorPanel.onChanged((monitors) => {
      this.ctx.monitors = monitors;
      saveToStorage(STORAGE_KEYS.monitors, monitors);
      this.callbacks.updateMonitorResults();
    });

    const commoditiesPanel = new CommoditiesPanel();
    this.ctx.panels['commodities'] = commoditiesPanel;

    const predictionPanel = new PredictionPanel();
    predictionPanel.setOnMarketClick((market) => {
      if (this.ctx.entityDetailPanel) {
        this.ctx.countryBriefPage?.hide();
        this.ctx.entityDetailPanel.show('predictionMarket', {
          title: market.title,
          slug: market.slug || '',
          category: 'geopolitics',
          volume: market.volume,
          endDate: market.endDate,
          closed: false,
          url: market.url,
        });
      }
    });
    this.ctx.panels['polymarket'] = predictionPanel;

    const govPanel = new NewsPanel('gov', t('panels.gov'));
    this.attachRelatedAssetHandlers(govPanel);
    this.ctx.newsPanels['gov'] = govPanel;
    this.ctx.panels['gov'] = govPanel;

    // Intel Feed - uses GDELT real-time events (RSS-based version reserved for Pro)
    const intelPanel = new GdeltIntelPanel();
    this.ctx.panels['intel'] = intelPanel;

    const cryptoPanel = new CryptoPanel();
    cryptoPanel.setOnCoinClick((coin) => {
      if (this.ctx.entityDetailPanel) {
        this.ctx.countryBriefPage?.hide();
        this.ctx.entityDetailPanel.show('crypto', coin);
      }
    });
    this.ctx.panels['crypto'] = cryptoPanel;

    const middleeastPanel = new NewsPanel('middleeast', t('panels.middleeast'));
    this.attachRelatedAssetHandlers(middleeastPanel);
    this.ctx.newsPanels['middleeast'] = middleeastPanel;
    this.ctx.panels['middleeast'] = middleeastPanel;

    const layoffsPanel = new NewsPanel('layoffs', t('panels.layoffs'));
    this.attachRelatedAssetHandlers(layoffsPanel);
    this.ctx.newsPanels['layoffs'] = layoffsPanel;
    this.ctx.panels['layoffs'] = layoffsPanel;

    const aiPanel = new NewsPanel('ai', t('panels.ai'));
    this.attachRelatedAssetHandlers(aiPanel);
    this.ctx.newsPanels['ai'] = aiPanel;
    this.ctx.panels['ai'] = aiPanel;

    const startupsPanel = new NewsPanel('startups', t('panels.startups'));
    this.attachRelatedAssetHandlers(startupsPanel);
    this.ctx.newsPanels['startups'] = startupsPanel;
    this.ctx.panels['startups'] = startupsPanel;

    const vcblogsPanel = new NewsPanel('vcblogs', t('panels.vcblogs'));
    this.attachRelatedAssetHandlers(vcblogsPanel);
    this.ctx.newsPanels['vcblogs'] = vcblogsPanel;
    this.ctx.panels['vcblogs'] = vcblogsPanel;

    const regionalStartupsPanel = new NewsPanel('regionalStartups', t('panels.regionalStartups'));
    this.attachRelatedAssetHandlers(regionalStartupsPanel);
    this.ctx.newsPanels['regionalStartups'] = regionalStartupsPanel;
    this.ctx.panels['regionalStartups'] = regionalStartupsPanel;

    const unicornsPanel = new NewsPanel('unicorns', t('panels.unicorns'));
    this.attachRelatedAssetHandlers(unicornsPanel);
    this.ctx.newsPanels['unicorns'] = unicornsPanel;
    this.ctx.panels['unicorns'] = unicornsPanel;

    const acceleratorsPanel = new NewsPanel('accelerators', t('panels.accelerators'));
    this.attachRelatedAssetHandlers(acceleratorsPanel);
    this.ctx.newsPanels['accelerators'] = acceleratorsPanel;
    this.ctx.panels['accelerators'] = acceleratorsPanel;

    const fundingPanel = new NewsPanel('funding', t('panels.funding'));
    this.attachRelatedAssetHandlers(fundingPanel);
    this.ctx.newsPanels['funding'] = fundingPanel;
    this.ctx.panels['funding'] = fundingPanel;

    const producthuntPanel = new NewsPanel('producthunt', t('panels.producthunt'));
    this.attachRelatedAssetHandlers(producthuntPanel);
    this.ctx.newsPanels['producthunt'] = producthuntPanel;
    this.ctx.panels['producthunt'] = producthuntPanel;

    const securityPanel = new NewsPanel('security', t('panels.security'));
    this.attachRelatedAssetHandlers(securityPanel);
    this.ctx.newsPanels['security'] = securityPanel;
    this.ctx.panels['security'] = securityPanel;

    const policyPanel = new NewsPanel('policy', t('panels.policy'));
    this.attachRelatedAssetHandlers(policyPanel);
    this.ctx.newsPanels['policy'] = policyPanel;
    this.ctx.panels['policy'] = policyPanel;

    const hardwarePanel = new NewsPanel('hardware', t('panels.hardware'));
    this.attachRelatedAssetHandlers(hardwarePanel);
    this.ctx.newsPanels['hardware'] = hardwarePanel;
    this.ctx.panels['hardware'] = hardwarePanel;

    const cloudPanel = new NewsPanel('cloud', t('panels.cloud'));
    this.attachRelatedAssetHandlers(cloudPanel);
    this.ctx.newsPanels['cloud'] = cloudPanel;
    this.ctx.panels['cloud'] = cloudPanel;

    const devPanel = new NewsPanel('dev', t('panels.dev'));
    this.attachRelatedAssetHandlers(devPanel);
    this.ctx.newsPanels['dev'] = devPanel;
    this.ctx.panels['dev'] = devPanel;

    const githubPanel = new NewsPanel('github', t('panels.github'));
    this.attachRelatedAssetHandlers(githubPanel);
    this.ctx.newsPanels['github'] = githubPanel;
    this.ctx.panels['github'] = githubPanel;

    const ipoPanel = new NewsPanel('ipo', t('panels.ipo'));
    this.attachRelatedAssetHandlers(ipoPanel);
    this.ctx.newsPanels['ipo'] = ipoPanel;
    this.ctx.panels['ipo'] = ipoPanel;

    const thinktanksPanel = new NewsPanel('thinktanks', t('panels.thinktanks'));
    this.attachRelatedAssetHandlers(thinktanksPanel);
    this.ctx.newsPanels['thinktanks'] = thinktanksPanel;
    this.ctx.panels['thinktanks'] = thinktanksPanel;

    const economicPanel = new EconomicPanel();
    this.ctx.panels['economic'] = economicPanel;

    if (SITE_VARIANT === 'full' || SITE_VARIANT === 'finance') {
      const tradePolicyPanel = new TradePolicyPanel();
      this.ctx.panels['trade-policy'] = tradePolicyPanel;

      const supplyChainPanel = new SupplyChainPanel();
      this.ctx.panels['supply-chain'] = supplyChainPanel;
    }

    const africaPanel = new NewsPanel('africa', t('panels.africa'));
    this.attachRelatedAssetHandlers(africaPanel);
    this.ctx.newsPanels['africa'] = africaPanel;
    this.ctx.panels['africa'] = africaPanel;

    const latamPanel = new NewsPanel('latam', t('panels.latam'));
    this.attachRelatedAssetHandlers(latamPanel);
    this.ctx.newsPanels['latam'] = latamPanel;
    this.ctx.panels['latam'] = latamPanel;

    const asiaPanel = new NewsPanel('asia', t('panels.asia'));
    this.attachRelatedAssetHandlers(asiaPanel);
    this.ctx.newsPanels['asia'] = asiaPanel;
    this.ctx.panels['asia'] = asiaPanel;

    const energyPanel = new NewsPanel('energy', t('panels.energy'));
    this.attachRelatedAssetHandlers(energyPanel);
    this.ctx.newsPanels['energy'] = energyPanel;
    this.ctx.panels['energy'] = energyPanel;

    for (const key of Object.keys(FEEDS)) {
      if (this.ctx.newsPanels[key]) continue;
      if (!Array.isArray((FEEDS as Record<string, unknown>)[key])) continue;
      const panelKey = this.ctx.panels[key] && !this.ctx.newsPanels[key] ? `${key}-news` : key;
      if (this.ctx.panels[panelKey]) continue;
      const panelConfig = DEFAULT_PANELS[panelKey] ?? DEFAULT_PANELS[key];
      const label = panelConfig?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
      const panel = new NewsPanel(panelKey, label);
      this.attachRelatedAssetHandlers(panel);
      this.ctx.newsPanels[key] = panel;
      this.ctx.panels[panelKey] = panel;
    }

    if (SITE_VARIANT === 'full') {
      const gdeltIntelPanel = new GdeltIntelPanel();
      this.ctx.panels['gdelt-intel'] = gdeltIntelPanel;

      if (this.ctx.isDesktopApp) {
        import('@/components/DeductionPanel').then(({ DeductionPanel }) => {
          const deductionPanel = new DeductionPanel(() => this.ctx.allNews);
          this.ctx.panels['deduction'] = deductionPanel;
          const el = deductionPanel.getElement();
          this.makeDraggable(el, 'deduction');
          const grid = document.getElementById('panelsGrid');
          if (grid) {
            const gdeltEl = this.ctx.panels['gdelt-intel']?.getElement();
            if (gdeltEl?.nextSibling) {
              grid.insertBefore(el, gdeltEl.nextSibling);
            } else {
              grid.appendChild(el);
            }
          }
        });
      }

      const ciiPanel = new CIIPanel();
      ciiPanel.setShareStoryHandler((code, name) => {
        this.callbacks.openCountryStory(code, name);
      });
      ciiPanel.setCountryClickHandler((code) => {
        this.callbacks.openCountryBrief(code);
      });
      this.ctx.panels['cii'] = ciiPanel;

      const cascadePanel = new CascadePanel();
      this.ctx.panels['cascade'] = cascadePanel;

      const satelliteFiresPanel = new SatelliteFiresPanel();
      this.ctx.panels['satellite-fires'] = satelliteFiresPanel;

      const strategicRiskPanel = new StrategicRiskPanel();
      strategicRiskPanel.setLocationClickHandler((lat, lon) => {
        this.ctx.map?.setCenter(lat, lon, 4);
      });
      this.ctx.panels['strategic-risk'] = strategicRiskPanel;

      const strategicPosturePanel = new StrategicPosturePanel(() => this.ctx.allNews);
      strategicPosturePanel.setLocationClickHandler((lat, lon) => {
        console.log('[App] StrategicPosture handler called:', { lat, lon, hasMap: !!this.ctx.map });
        this.ctx.map?.setCenter(lat, lon, 4);
      });
      this.ctx.panels['strategic-posture'] = strategicPosturePanel;

      const ucdpEventsPanel = new UcdpEventsPanel();
      ucdpEventsPanel.setEventClickHandler((lat, lon) => {
        this.ctx.map?.setCenter(lat, lon, 5);
      });
      this.ctx.panels['ucdp-events'] = ucdpEventsPanel;

      this.lazyPanel('displacement', () =>
        import('@/components/DisplacementPanel').then(m => {
          const p = new m.DisplacementPanel();
          p.setCountryClickHandler((lat: number, lon: number) => { this.ctx.map?.setCenter(lat, lon, 4); });
          return p;
        }),
      );

      this.lazyPanel('climate', () =>
        import('@/components/ClimateAnomalyPanel').then(m => {
          const p = new m.ClimateAnomalyPanel();
          p.setZoneClickHandler((lat: number, lon: number) => { this.ctx.map?.setCenter(lat, lon, 4); });
          return p;
        }),
      );

      this.lazyPanel('population-exposure', () =>
        import('@/components/PopulationExposurePanel').then(m => new m.PopulationExposurePanel()),
      );

      this.lazyPanel('security-advisories', () =>
        import('@/components/SecurityAdvisoriesPanel').then(m => {
          const p = new m.SecurityAdvisoriesPanel();
          p.setRefreshHandler(() => { void this.callbacks.loadSecurityAdvisories?.(); });
          return p;
        }),
      );

      const _wmKeyPresent = getSecretState('WORLDMONITOR_API_KEY').present;
      const _lockPanels = this.ctx.isDesktopApp && !_wmKeyPresent;

      this.lazyPanel('oref-sirens', () =>
        import('@/components/OrefSirensPanel').then(m => new m.OrefSirensPanel()),
        undefined,
        _lockPanels ? [t('premium.features.orefSirens1'), t('premium.features.orefSirens2')] : undefined,
      );

      this.lazyPanel('telegram-intel', () =>
        import('@/components/TelegramIntelPanel').then(m => new m.TelegramIntelPanel()),
        undefined,
        _lockPanels ? [t('premium.features.telegramIntel1'), t('premium.features.telegramIntel2')] : undefined,
      );
    }

    if (SITE_VARIANT === 'finance') {
      const investmentsPanel = new InvestmentsPanel((inv) => {
        focusInvestmentOnMap(this.ctx.map, this.ctx.mapLayers, inv.lat, inv.lon);
      });
      this.ctx.panels['gcc-investments'] = investmentsPanel;

      const gulfEconomiesPanel = new GulfEconomiesPanel();
      this.ctx.panels['gulf-economies'] = gulfEconomiesPanel;
    }

    this.ctx.panels['world-clock'] = new WorldClockPanel();

    // Airline Intelligence panel (non-happy variants)
    if (SITE_VARIANT !== 'happy') {
      this.ctx.panels['airline-intel'] = new AirlineIntelPanel();
      // Launch the Ctrl+J command bar (attaches global keydown listener)
      this.aviationCommandBar = new AviationCommandBar();
    }

    if (SITE_VARIANT !== 'happy') {
      if (!this.ctx.panels['gulf-economies']) {
        const gulfEconomiesPanel = new GulfEconomiesPanel();
        this.ctx.panels['gulf-economies'] = gulfEconomiesPanel;
      }

      const liveNewsPanel = new LiveNewsPanel();
      this.ctx.panels['live-news'] = liveNewsPanel;

      const liveWebcamsPanel = new LiveWebcamsPanel();
      this.ctx.panels['live-webcams'] = liveWebcamsPanel;

      this.ctx.panels['events'] = new TechEventsPanel('events', () => this.ctx.allNews);

      const serviceStatusPanel = new ServiceStatusPanel();
      this.ctx.panels['service-status'] = serviceStatusPanel;

      this.lazyPanel('tech-readiness', () =>
        import('@/components/TechReadinessPanel').then(m => {
          const p = new m.TechReadinessPanel();
          void p.refresh();
          return p;
        }),
      );

      this.ctx.panels['macro-signals'] = new MacroSignalsPanel();
      this.ctx.panels['etf-flows'] = new ETFFlowsPanel();
      this.ctx.panels['stablecoins'] = new StablecoinPanel();
      this.ctx.panels['economic-calendar'] = new EconomicCalendarPanel();
      this.ctx.panels['sanctions-tracker'] = new SanctionsTrackerPanel();
      this.ctx.panels['solar-weather'] = new SolarWeatherPanel();
      if (isLoggedIn()) {
        this.ctx.panels['alert-rules'] = new AlertRulesPanel();
      }
      this.ctx.panels['geopolitical-risk'] = new GeopoliticalRiskPanel();
      this.ctx.panels['correlation-matrix'] = new CorrelationMatrixPanel();
      this.ctx.panels['trade-flows'] = new TradeFlowPanel();
      this.ctx.panels['earnings-calendar'] = new EarningsCalendarPanel();
      this.ctx.panels['ipo-calendar'] = new IPOCalendarPanel();
      this.ctx.panels['insider-trading'] = new InsiderTradingPanel();
      this.ctx.panels['social-sentiment'] = new SocialSentimentPanel();
      this.ctx.panels['options-chain'] = new OptionsChainPanel();
      this.ctx.panels['portfolio-tracker'] = new PortfolioPanel();
    }

    if (this.ctx.isDesktopApp) {
      const runtimeConfigPanel = new RuntimeConfigPanel({ mode: 'alert' });
      this.ctx.panels['runtime-config'] = runtimeConfigPanel;
    }

    const insightsPanel = new InsightsPanel();
    this.ctx.panels['insights'] = insightsPanel;

    this.ctx.panels['marketplace'] = new MarketplacePanel();

    // Global Giving panel (all variants)
    this.lazyPanel('giving', () =>
      import('@/components/GivingPanel').then(m => new m.GivingPanel()),
    );

    // Happy variant panels (lazy-loaded — only relevant for happy variant)
    if (SITE_VARIANT === 'happy') {
      this.lazyPanel('positive-feed', () =>
        import('@/components/PositiveNewsFeedPanel').then(m => {
          const p = new m.PositiveNewsFeedPanel();
          this.ctx.positivePanel = p;
          return p;
        }),
      );

      this.lazyPanel('counters', () =>
        import('@/components/CountersPanel').then(m => {
          const p = new m.CountersPanel();
          p.startTicking();
          this.ctx.countersPanel = p;
          return p;
        }),
      );

      this.lazyPanel('progress', () =>
        import('@/components/ProgressChartsPanel').then(m => {
          const p = new m.ProgressChartsPanel();
          this.ctx.progressPanel = p;
          return p;
        }),
      );

      this.lazyPanel('breakthroughs', () =>
        import('@/components/BreakthroughsTickerPanel').then(m => {
          const p = new m.BreakthroughsTickerPanel();
          this.ctx.breakthroughsPanel = p;
          return p;
        }),
      );

      this.lazyPanel('spotlight', () =>
        import('@/components/HeroSpotlightPanel').then(m => {
          const p = new m.HeroSpotlightPanel();
          p.onLocationRequest = (lat: number, lon: number) => {
            this.ctx.map?.setCenter(lat, lon, 4);
            this.ctx.map?.flashLocation(lat, lon, 3000);
          };
          this.ctx.heroPanel = p;
          return p;
        }),
      );

      this.lazyPanel('digest', () =>
        import('@/components/GoodThingsDigestPanel').then(m => {
          const p = new m.GoodThingsDigestPanel();
          this.ctx.digestPanel = p;
          return p;
        }),
      );

      this.lazyPanel('species', () =>
        import('@/components/SpeciesComebackPanel').then(m => {
          const p = new m.SpeciesComebackPanel();
          this.ctx.speciesPanel = p;
          return p;
        }),
      );

      this.lazyPanel('renewable', () =>
        import('@/components/RenewableEnergyPanel').then(m => {
          const p = new m.RenewableEnergyPanel();
          this.ctx.renewablePanel = p;
          return p;
        }),
      );
    }

    const defaultOrder = Object.keys(DEFAULT_PANELS).filter(k => k !== 'map');
    const activePanelKeys = Object.keys(this.ctx.panelSettings).filter(k => k !== 'map');
    const bottomSet = this.getSavedBottomSet();
    const savedOrder = this.getSavedPanelOrder();
    this.bottomSetMemory = bottomSet;
    const effectiveUltraWide = this.getEffectiveUltraWide();
    this.wasUltraWide = effectiveUltraWide;

    const hasSavedOrder = savedOrder.length > 0;
    let allOrder: string[];

    if (hasSavedOrder) {
      const valid = savedOrder.filter(k => activePanelKeys.includes(k));
      const missing = activePanelKeys.filter(k => !valid.includes(k));

      missing.forEach(k => {
        if (k === 'monitors') return;
        const defaultIdx = defaultOrder.indexOf(k);
        if (defaultIdx === -1) { valid.push(k); return; }
        let inserted = false;
        for (let i = defaultIdx + 1; i < defaultOrder.length; i++) {
          const afterIdx = valid.indexOf(defaultOrder[i]!);
          if (afterIdx !== -1) { valid.splice(afterIdx, 0, k); inserted = true; break; }
        }
        if (!inserted) valid.push(k);
      });

      const monitorsIdx = valid.indexOf('monitors');
      if (monitorsIdx !== -1) valid.splice(monitorsIdx, 1);
      if (SITE_VARIANT !== 'happy') valid.push('monitors');
      allOrder = valid;
    } else {
      allOrder = [...defaultOrder];

      if (SITE_VARIANT !== 'happy') {
        const liveNewsIdx = allOrder.indexOf('live-news');
        if (liveNewsIdx > 0) {
          allOrder.splice(liveNewsIdx, 1);
          allOrder.unshift('live-news');
        }

        const webcamsIdx = allOrder.indexOf('live-webcams');
        if (webcamsIdx !== -1 && webcamsIdx !== allOrder.indexOf('live-news') + 1) {
          allOrder.splice(webcamsIdx, 1);
          const afterNews = allOrder.indexOf('live-news') + 1;
          allOrder.splice(afterNews, 0, 'live-webcams');
        }
      }

      if (this.ctx.isDesktopApp) {
        const runtimeIdx = allOrder.indexOf('runtime-config');
        if (runtimeIdx > 1) {
          allOrder.splice(runtimeIdx, 1);
          allOrder.splice(1, 0, 'runtime-config');
        } else if (runtimeIdx === -1) {
          allOrder.splice(1, 0, 'runtime-config');
        }
      }
    }

    this.resolvedPanelOrder = allOrder;

    const sidebarOrder = effectiveUltraWide
      ? allOrder.filter(k => !this.bottomSetMemory.has(k))
      : allOrder;
    const bottomOrder = effectiveUltraWide
      ? allOrder.filter(k => this.bottomSetMemory.has(k))
      : [];

    sidebarOrder.forEach((key: string) => {
      const panel = this.ctx.panels[key];
      if (panel && !panel.getElement().parentElement) {
        const el = panel.getElement();
        this.makeDraggable(el, key);
        panelsGrid.appendChild(el);
      }
    });

    const bottomGrid = document.getElementById('mapBottomGrid');
    if (bottomGrid) {
      bottomOrder.forEach(key => {
        const panel = this.ctx.panels[key];
        if (panel && !panel.getElement().parentElement) {
          const el = panel.getElement();
          this.makeDraggable(el, key);
          this.insertByOrder(bottomGrid, el, key);
        }
      });
    }

    window.addEventListener('resize', () => this.ensureCorrectZones());

    this.ctx.map.onTimeRangeChanged((range) => {
      this.ctx.currentTimeRange = range;
      this.applyTimeRangeFilterDebounced();
    });

    this.applyPanelSettings();
    this.applyInitialUrlState();

    // Remove button delegation
    panelsGrid.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.panel-remove-btn');
      if (!btn) return;
      e.stopPropagation();
      const panelEl = btn.closest('[data-panel]') as HTMLElement;
      const key = panelEl?.dataset.panel;
      if (key) this.removePanel(key);
    });

    this.mountAddWidgetBtn(panelsGrid);
    this.setupPanelCollapseHandle();
    this.setupLayoutToggle();
    this.setupScrollToTopButtons();
  }

  private layoutMode: 'bottom' | 'side' = 'bottom';
  private panelsHidden = false;
  private bottomGridHidden = false;
  private readonly panelsCollapsedStorageKey = 'worldmonitor-panels-collapsed';
  private readonly bottomGridCollapsedStorageKey = 'worldmonitor-bottom-grid-collapsed';

  private buildLayoutIcon(mode: 'bottom' | 'side'): SVGElement {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', '3'); rect.setAttribute('y', '3');
    rect.setAttribute('width', '18'); rect.setAttribute('height', '18');
    rect.setAttribute('rx', '2');
    svg.appendChild(rect);
    const line = document.createElementNS(NS, 'line');
    if (mode === 'side') {
      line.setAttribute('x1', '12'); line.setAttribute('y1', '3');
      line.setAttribute('x2', '12'); line.setAttribute('y2', '21');
    } else {
      line.setAttribute('x1', '3'); line.setAttribute('y1', '14');
      line.setAttribute('x2', '21'); line.setAttribute('y2', '14');
    }
    svg.appendChild(line);
    return svg;
  }

  private setupScrollToTopButtons(): void {
    const createScrollBtn = (container: HTMLElement, scrollTarget: HTMLElement): void => {
      const btn = document.createElement('button');
      btn.className = 'scroll-to-top-btn';
      btn.setAttribute('aria-label', 'Scroll to top');
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;

      container.style.position = 'relative';
      container.appendChild(btn);

      const updateVisibility = () => {
        const scrolled = scrollTarget.scrollTop > 60;
        btn.classList.toggle('visible', scrolled);
      };

      scrollTarget.addEventListener('scroll', updateVisibility, { passive: true });

      btn.addEventListener('click', () => {
        scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
      });
    };

    // Right panel: button in panels-grid, scroll on main-content
    const panelsGrid = document.getElementById('panelsGrid');
    const mainContent = document.querySelector('.main-content') as HTMLElement | null;
    if (panelsGrid && mainContent) createScrollBtn(panelsGrid, mainContent);

    // Bottom grid: button and scroll on the same element
    const bottomGrid = document.getElementById('mapBottomGrid');
    if (bottomGrid) createScrollBtn(bottomGrid, bottomGrid);
  }

  private setupLayoutToggle(): void {
    const btn = document.getElementById('layoutToggleBtn');
    const mainContent = document.querySelector('.main-content') as HTMLElement | null;
    if (!btn || !mainContent) return;

    const applyMode = (mode: 'bottom' | 'side') => {
      this.layoutMode = mode;
      mainContent.classList.toggle('layout-side', mode === 'side');
      btn.classList.toggle('active', mode === 'side');
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      btn.appendChild(this.buildLayoutIcon(mode));
      btn.title = mode === 'side' ? 'Side layout — click for bottom' : 'Bottom layout — click for side';
      try { localStorage.setItem(STORAGE_KEYS.layoutMode, mode); } catch { /* noop */ }
      setTimeout(() => this.ctx.map?.setIsResizing(false), 320);
    };

    try {
      const saved = localStorage.getItem(STORAGE_KEYS.layoutMode);
      if (saved === 'side') applyMode('side');
    } catch { /* noop */ }

    btn.addEventListener('click', () => applyMode(this.layoutMode === 'bottom' ? 'side' : 'bottom'));
  }

  private buildChevronSvg(dir: 'up' | 'down' | 'left' | 'right'): SVGElement {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '12'); svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    const poly = document.createElementNS(NS, 'polyline');
    const pts: Record<string, string> = {
      up: '6 15 12 9 18 15', down: '6 9 12 15 18 9',
      left: '15 18 9 12 15 6', right: '9 6 15 12 9 18',
    };
    poly.setAttribute('points', pts[dir]!);
    svg.appendChild(poly);
    return svg;
  }

  private setupPanelCollapseHandle(): void {
    const mainContent = document.querySelector('.main-content') as HTMLElement | null;
    const mapSection = document.getElementById('mapSection') as HTMLElement | null;
    const resizeHandle = document.getElementById('mapResizeHandle');
    const bottomGridHandle = document.getElementById('bottomGridResizeHandle') as HTMLElement | null;
    if (!mainContent || !resizeHandle) return;

    // Right-panel collapse button lives on the vertical map↔panel resize handle
    const btn = document.createElement('button');
    btn.className = 'panels-collapse-btn';
    resizeHandle.appendChild(btn);
    resizeHandle.classList.add('has-collapse-btns');

    // Bottom-panel collapse button lives on the horizontal map↔bottom-grid resize handle
    const bottomBtn = document.createElement('button');
    bottomBtn.className = 'bottom-grid-collapse-btn';
    (bottomGridHandle ?? resizeHandle).appendChild(bottomBtn);
    if (bottomGridHandle) bottomGridHandle.classList.add('has-collapse-btns');

    try {
      this.panelsHidden = localStorage.getItem(this.panelsCollapsedStorageKey) === 'true';
      this.bottomGridHidden = localStorage.getItem(this.bottomGridCollapsedStorageKey) === 'true';
    } catch {
      this.panelsHidden = false;
      this.bottomGridHidden = false;
    }

    mainContent.classList.toggle('panels-hidden', this.panelsHidden);
    if (mapSection) mapSection.classList.toggle('bottom-grid-hidden', this.bottomGridHidden);
    mainContent.classList.toggle('bottom-grid-hidden', this.bottomGridHidden);

    const isSideLayout = () => window.innerWidth >= 1600 || mainContent.classList.contains('layout-side');

    const updateIcon = () => {
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      if (isSideLayout()) {
        // Vertical handle: right = collapse, left = expand
        btn.appendChild(this.buildChevronSvg(this.panelsHidden ? 'left' : 'right'));
      } else {
        // Horizontal handle: down = panels visible (collapse), up = panels hidden (expand)
        btn.appendChild(this.buildChevronSvg(this.panelsHidden ? 'up' : 'down'));
      }
      btn.title = this.panelsHidden ? 'Expand panels' : 'Collapse panels';
    };

    const updateBottomIcon = () => {
      while (bottomBtn.firstChild) bottomBtn.removeChild(bottomBtn.firstChild);
      bottomBtn.appendChild(this.buildChevronSvg(this.bottomGridHidden ? 'up' : 'down'));
      bottomBtn.title = this.bottomGridHidden ? 'Expand bottom panels' : 'Collapse bottom panels';
    };

    const origToggle = document.getElementById('layoutToggleBtn');
    origToggle?.addEventListener('click', () => setTimeout(updateIcon, 0));
    const onWindowResize = () => { updateIcon(); updateBottomIcon(); };
    window.addEventListener('resize', onWindowResize);
    this.panelDragCleanupHandlers.push(() => window.removeEventListener('resize', onWindowResize));

    let btnDownX = 0, btnDownY = 0;
    btn.addEventListener('mousedown', (e) => { btnDownX = e.clientX; btnDownY = e.clientY; });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Ignore click if it was actually a drag (mouse moved > 4px — that's a resize, not a tap)
      if (Math.abs(e.clientX - btnDownX) > 4 || Math.abs(e.clientY - btnDownY) > 4) return;
      this.panelsHidden = !this.panelsHidden;
      mainContent.classList.toggle('panels-hidden', this.panelsHidden);
      // Clear inline resize styles so CSS layout rules take effect
      if (mapSection) { mapSection.style.height = ''; mapSection.style.flex = ''; }
      const mc = document.getElementById('mapContainer') as HTMLElement | null;
      if (mc) { mc.style.height = ''; mc.style.flex = ''; }
      try { localStorage.removeItem('map-height'); } catch { /* noop */ }
      try { localStorage.setItem(this.panelsCollapsedStorageKey, String(this.panelsHidden)); } catch { /* noop */ }
      updateIcon();
      this.ctx.map?.resize();
      window.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      setTimeout(() => this.ctx.map?.setIsResizing(false), 320);
    });

    let bottomBtnDownX = 0, bottomBtnDownY = 0;
    bottomBtn.addEventListener('mousedown', (e) => { bottomBtnDownX = e.clientX; bottomBtnDownY = e.clientY; });
    bottomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Ignore click if it was actually a drag
      if (Math.abs(e.clientX - bottomBtnDownX) > 4 || Math.abs(e.clientY - bottomBtnDownY) > 4) return;
      this.bottomGridHidden = !this.bottomGridHidden;
      if (mapSection) mapSection.classList.toggle('bottom-grid-hidden', this.bottomGridHidden);
      if (mainContent) mainContent.classList.toggle('bottom-grid-hidden', this.bottomGridHidden);
      try { localStorage.setItem(this.bottomGridCollapsedStorageKey, String(this.bottomGridHidden)); } catch { /* noop */ }
      {
        // Clear inline resize styles so CSS layout rules take effect
        const mapContainer = document.getElementById('mapContainer') as HTMLElement | null;
        if (mapContainer) { mapContainer.style.height = ''; mapContainer.style.flex = ''; }
        if (mapSection) { mapSection.style.height = ''; mapSection.style.flex = ''; }
        try { localStorage.removeItem('map-height'); } catch { /* noop */ }
      }
      updateBottomIcon();
      // Force immediate resize dispatch for seamless expansion
      window.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });

    updateIcon();
    updateBottomIcon();
  }

  private setupNewsRefreshSweepEffect(): void {
    this.newsRefreshSweepCleanup?.();

    let resetTimer: number | null = null;

    const clearSweep = (): void => {
      const mainContent = document.querySelector('.main-content') as HTMLElement | null;
      if (!mainContent) return;
      mainContent.classList.remove('news-refresh-sweep');
      mainContent.style.removeProperty('--news-rail-duration');
    };

    const onSweep = (event: Event): void => {
      const mainContent = document.querySelector('.main-content') as HTMLElement | null;
      if (!mainContent) return;

      const detail = (event as CustomEvent<{ count?: number }>).detail;
      const count = Math.max(1, Math.min(6, Math.round(detail?.count ?? 1)));
      const durationMs = 1280 + Math.min(300, (count - 1) * 55);

      if (resetTimer !== null) {
        window.clearTimeout(resetTimer);
        resetTimer = null;
      }

      clearSweep();
      mainContent.style.setProperty('--news-rail-duration', `${durationMs}ms`);
      void mainContent.offsetWidth;
      mainContent.classList.add('news-refresh-sweep');

      resetTimer = window.setTimeout(() => {
        clearSweep();
        resetTimer = null;
      }, durationMs + 140);
    };

    window.addEventListener(NEWS_REFRESH_SWEEP_EVENT, onSweep as EventListener);
    this.newsRefreshSweepCleanup = () => {
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer);
        resetTimer = null;
      }
      clearSweep();
      window.removeEventListener(NEWS_REFRESH_SWEEP_EVENT, onSweep as EventListener);
    };
  }

  private addWidgetBtn: HTMLButtonElement | null = null;

  private removePanel(key: string): void {
    const config = this.ctx.panelSettings[key];
    if (!config) return;
    config.enabled = false;
    saveToStorage(getVariantStorageKey(STORAGE_KEYS.panels, SITE_VARIANT), this.ctx.panelSettings);
    this.ctx.panels[key]?.hide();
    this.refreshAddWidgetBtn();
    this.saveCurrentLayout();
  }

  private saveCurrentLayout(): void {
    const variantPanelsKey = getVariantStorageKey(STORAGE_KEYS.panels, SITE_VARIANT);
    const keys = [
      this.ctx.PANEL_ORDER_KEY,
      this.ctx.PANEL_ORDER_KEY + '-bottom-set',
      'worldmonitor-layout-mode',
      this.ctx.PANEL_SPANS_KEY,
      'worldmonitor-panel-col-spans',
      'map-height',
      'worldmonitor-sidebar-split',
      'worldmonitor-panels-collapsed',
      'worldmonitor-bottom-grid-collapsed',
    ];
    const snapshot: Record<string, string | null> = {};
    for (const key of keys) {
      snapshot[key] = localStorage.getItem(key);
    }
    snapshot[STORAGE_KEYS.panels] = localStorage.getItem(variantPanelsKey);
    localStorage.setItem('worldmonitor-saved-panel-layout', JSON.stringify(snapshot));
    localStorage.setItem('worldmonitor-saved-map-layout', window.location.search);
  }

  private mountAddWidgetBtn(panelsGrid: HTMLElement): void {
    const plus = document.createElement('span');
    plus.className = 'add-widget-plus';
    plus.textContent = '+';
    const label = document.createElement('span');
    label.textContent = 'Add Widget';
    this.addWidgetBtn = document.createElement('button');
    this.addWidgetBtn.className = 'add-widget-btn';
    this.addWidgetBtn.appendChild(plus);
    this.addWidgetBtn.appendChild(label);
    this.addWidgetBtn.addEventListener('click', () => {
      if (!checkFeatureAccess('add-widget')) return;
      this.showAddWidgetOverlay();
    });
    panelsGrid.appendChild(this.addWidgetBtn);
    this.refreshAddWidgetBtn();
  }

  private refreshAddWidgetBtn(): void {
    if (!this.addWidgetBtn) return;
    const hasHidden = Object.entries(this.ctx.panelSettings)
      .some(([k, c]) => k !== 'map' && !c.enabled);
    this.addWidgetBtn.style.display = hasHidden ? '' : 'none';
  }

  private showAddWidgetOverlay(): void {
    document.querySelector('.add-widget-overlay')?.remove();
    const hidden = Object.entries(this.ctx.panelSettings)
      .filter(([k, c]) => k !== 'map' && !c.enabled);
    if (!hidden.length) return;

    const overlay = document.createElement('div');
    overlay.className = 'add-widget-overlay';

    const header = document.createElement('div');
    header.className = 'add-widget-header';
    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'Add Widget';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'add-widget-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(headerTitle);
    header.appendChild(closeBtn);

    const list = document.createElement('div');
    list.className = 'add-widget-list';
    hidden.forEach(([key, cfg]) => {
      const item = document.createElement('button');
      item.className = 'add-widget-item';
      const nameEl = document.createElement('span');
      nameEl.textContent = cfg.name;
      const plusEl = document.createElement('span');
      plusEl.className = 'add-widget-item-plus';
      plusEl.textContent = '+';
      item.appendChild(nameEl);
      item.appendChild(plusEl);
      item.addEventListener('click', () => {
        const config = this.ctx.panelSettings[key];
        if (config) {
          config.enabled = true;
          saveToStorage(getVariantStorageKey(STORAGE_KEYS.panels, SITE_VARIANT), this.ctx.panelSettings);
          this.ctx.panels[key]?.show();
          item.remove();
          this.refreshAddWidgetBtn();
          if (!list.querySelector('.add-widget-item')) overlay.remove();
          this.saveCurrentLayout();
        }
      });
      list.appendChild(item);
    });

    overlay.appendChild(header);
    overlay.appendChild(list);
    document.body.appendChild(overlay);

    setTimeout(() => {
      document.addEventListener('click', function close(e) {
        if (!overlay.contains(e.target as Node)) {
          overlay.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 0);
  }

  private applyTimeRangeFilterToNewsPanels(): void {
    Object.entries(this.ctx.newsByCategory).forEach(([category, items]) => {
      const panel = this.ctx.newsPanels[category];
      if (!panel) return;
      const filtered = this.filterItemsByTimeRange(items);
      if (filtered.length === 0 && items.length > 0) {
        panel.renderFilteredEmpty(`No items in ${this.getTimeRangeLabel()}`);
        return;
      }
      panel.renderNews(filtered);
    });
  }

  private filterItemsByTimeRange(items: import('@/types').NewsItem[], range: import('@/components').TimeRange = this.ctx.currentTimeRange): import('@/types').NewsItem[] {
    if (range === 'all') return items;
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000, '48h': 48 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000, 'all': Infinity,
    };
    const cutoff = Date.now() - (ranges[range] ?? Infinity);
    return items.filter((item) => {
      const ts = item.pubDate instanceof Date ? item.pubDate.getTime() : new Date(item.pubDate).getTime();
      return Number.isFinite(ts) ? ts >= cutoff : true;
    });
  }

  private getTimeRangeLabel(): string {
    const labels: Record<string, string> = {
      '1h': 'the last hour', '6h': 'the last 6 hours',
      '24h': 'the last 24 hours', '48h': 'the last 48 hours',
      '7d': 'the last 7 days', 'all': 'all time',
    };
    return labels[this.ctx.currentTimeRange] ?? 'the last 7 days';
  }

  private applyInitialUrlState(): void {
    if (!this.ctx.initialUrlState || !this.ctx.map) return;

    const { view, zoom, lat, lon, timeRange, layers } = this.ctx.initialUrlState;

    if (view) {
      this.ctx.map.setView(view);
    }

    if (timeRange) {
      this.ctx.map.setTimeRange(timeRange);
    }

    if (layers) {
      this.ctx.mapLayers = layers;
      saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
      this.ctx.map.setLayers(layers);
    }

    if (lat !== undefined && lon !== undefined) {
      const effectiveZoom = zoom ?? this.ctx.map.getState().zoom;
      if (effectiveZoom > 2) this.ctx.map.setCenter(lat, lon, zoom);
    } else if (!view && zoom !== undefined) {
      this.ctx.map.setZoom(zoom);
    }

    const regionSelect = document.getElementById('regionSelect') as HTMLSelectElement;
    const currentView = this.ctx.map.getState().view;
    if (regionSelect && currentView) {
      regionSelect.value = currentView;
    }
  }

  private getSavedPanelOrder(): string[] {
    try {
      const saved = localStorage.getItem(this.ctx.PANEL_ORDER_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v: unknown) => typeof v === 'string') as string[];
    } catch {
      return [];
    }
  }

  savePanelOrder(): void {
    const grid = document.getElementById('panelsGrid');
    const bottomGrid = document.getElementById('mapBottomGrid');
    if (!grid || !bottomGrid) return;

    const sidebarIds = Array.from(grid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);

    const bottomIds = Array.from(bottomGrid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);

    const allOrder = this.buildUnifiedOrder(sidebarIds, bottomIds);
    this.resolvedPanelOrder = allOrder;
    localStorage.setItem(this.ctx.PANEL_ORDER_KEY, JSON.stringify(allOrder));
    localStorage.setItem(this.ctx.PANEL_ORDER_KEY + '-bottom-set', JSON.stringify(Array.from(this.bottomSetMemory)));
  }

  private buildUnifiedOrder(sidebarIds: string[], bottomIds: string[]): string[] {
    const presentIds = [...sidebarIds, ...bottomIds];
    const uniqueIds: string[] = [];
    const seen = new Set<string>();

    presentIds.forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      uniqueIds.push(id);
    });

    const previousOrder = new Map<string, number>();
    this.resolvedPanelOrder.forEach((id, index) => {
      if (seen.has(id) && !previousOrder.has(id)) {
        previousOrder.set(id, index);
      }
    });
    uniqueIds.forEach((id, index) => {
      if (!previousOrder.has(id)) {
        previousOrder.set(id, this.resolvedPanelOrder.length + index);
      }
    });

    const edges = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    uniqueIds.forEach((id) => {
      edges.set(id, new Set());
      indegree.set(id, 0);
    });

    const addConstraints = (ids: string[]) => {
      for (let i = 1; i < ids.length; i++) {
        const prev = ids[i - 1]!;
        const next = ids[i]!;
        if (prev === next || !seen.has(prev) || !seen.has(next)) continue;
        const nextIds = edges.get(prev);
        if (!nextIds || nextIds.has(next)) continue;
        nextIds.add(next);
        indegree.set(next, (indegree.get(next) ?? 0) + 1);
      }
    };

    addConstraints(sidebarIds);
    addConstraints(bottomIds);

    const compareIds = (a: string, b: string) =>
      (previousOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (previousOrder.get(b) ?? Number.MAX_SAFE_INTEGER);

    const available = uniqueIds
      .filter((id) => (indegree.get(id) ?? 0) === 0)
      .sort(compareIds);
    const merged: string[] = [];

    while (available.length > 0) {
      const current = available.shift()!;
      merged.push(current);

      edges.get(current)?.forEach((next) => {
        const nextIndegree = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, nextIndegree);
        if (nextIndegree === 0) {
          available.push(next);
        }
      });
      available.sort(compareIds);
    }

    return merged.length === uniqueIds.length
      ? merged
      : uniqueIds.sort(compareIds);
  }

  private getSavedBottomSet(): Set<string> {
    try {
      const saved = localStorage.getItem(this.ctx.PANEL_ORDER_KEY + '-bottom-set');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.filter((v: unknown) => typeof v === 'string'));
        }
      }
    } catch { /* ignore */ }
    try {
      const legacy = localStorage.getItem(this.ctx.PANEL_ORDER_KEY + '-bottom');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) {
          const bottomIds = parsed.filter((v: unknown) => typeof v === 'string') as string[];
          const set = new Set(bottomIds);
          // Merge old sidebar + bottom into unified PANEL_ORDER_KEY
          const sidebarOrder = this.getSavedPanelOrder();
          const seen = new Set(sidebarOrder);
          const unified = [...sidebarOrder];
          for (const id of bottomIds) {
            if (!seen.has(id)) { unified.push(id); seen.add(id); }
          }
          localStorage.setItem(this.ctx.PANEL_ORDER_KEY, JSON.stringify(unified));
          localStorage.setItem(this.ctx.PANEL_ORDER_KEY + '-bottom-set', JSON.stringify([...set]));
          localStorage.removeItem(this.ctx.PANEL_ORDER_KEY + '-bottom');
          return set;
        }
      }
    } catch { /* ignore */ }
    return new Set();
  }

  private getEffectiveUltraWide(): boolean {
    const mapSection = document.getElementById('mapSection');
    const mapEnabled = !mapSection?.classList.contains('hidden');
    return window.innerWidth >= 1600 && mapEnabled;
  }

  private insertByOrder(grid: HTMLElement, el: HTMLElement, key: string): void {
    const idx = this.resolvedPanelOrder.indexOf(key);
    if (idx === -1) { grid.appendChild(el); return; }
    for (let i = idx + 1; i < this.resolvedPanelOrder.length; i++) {
      const nextKey = this.resolvedPanelOrder[i]!;
      const nextEl = grid.querySelector(`[data-panel="${CSS.escape(nextKey)}"]`);
      if (nextEl) { grid.insertBefore(el, nextEl); return; }
    }
    grid.appendChild(el);
  }

  private wasUltraWide = false;

  public ensureCorrectZones(): void {
    const effectiveUltraWide = this.getEffectiveUltraWide();

    if (effectiveUltraWide === this.wasUltraWide) return;
    this.wasUltraWide = effectiveUltraWide;

    const grid = document.getElementById('panelsGrid');
    const bottomGrid = document.getElementById('mapBottomGrid');
    if (!grid || !bottomGrid) return;

    if (!effectiveUltraWide) {
      const panelsInBottom = Array.from(bottomGrid.querySelectorAll('.panel')) as HTMLElement[];
      panelsInBottom.forEach(panelEl => {
        const id = panelEl.dataset.panel;
        if (!id) return;
        this.insertByOrder(grid, panelEl, id);
      });
    } else {
      this.bottomSetMemory.forEach(id => {
        const el = grid.querySelector(`[data-panel="${CSS.escape(id)}"]`);
        if (el) {
          this.insertByOrder(bottomGrid, el as HTMLElement, id);
        }
      });
    }
  }

  private attachRelatedAssetHandlers(panel: NewsPanel): void {
    panel.setRelatedAssetHandlers({
      onRelatedAssetClick: (asset) => this.handleRelatedAssetClick(asset),
      onRelatedAssetsFocus: (assets) => this.ctx.map?.highlightAssets(assets),
      onRelatedAssetsClear: () => this.ctx.map?.highlightAssets(null),
    });
  }

  private handleRelatedAssetClick(asset: RelatedAsset): void {
    if (!this.ctx.map) return;

    switch (asset.type) {
      case 'pipeline':
        this.ctx.map.enableLayer('pipelines');
        this.ctx.mapLayers.pipelines = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerPipelineClick(asset.id);
        break;
      case 'cable':
        this.ctx.map.enableLayer('cables');
        this.ctx.mapLayers.cables = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerCableClick(asset.id);
        break;
      case 'datacenter':
        this.ctx.map.enableLayer('datacenters');
        this.ctx.mapLayers.datacenters = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerDatacenterClick(asset.id);
        break;
      case 'base':
        this.ctx.map.enableLayer('bases');
        this.ctx.mapLayers.bases = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerBaseClick(asset.id);
        break;
      case 'nuclear':
        this.ctx.map.enableLayer('nuclear');
        this.ctx.mapLayers.nuclear = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerNuclearClick(asset.id);
        break;
    }
  }

  private lazyPanel<T extends { getElement(): HTMLElement }>(
    key: string,
    loader: () => Promise<T>,
    setup?: (panel: T) => void,
    lockedFeatures?: string[],
  ): void {
    loader().then(async (panel) => {
      this.ctx.panels[key] = panel as unknown as import('@/components/Panel').Panel;
      if (lockedFeatures) {
        (panel as unknown as import('@/components/Panel').Panel).showLocked(lockedFeatures);
      } else {
        await replayPendingCalls(key, panel);
        if (setup) setup(panel);
      }
      const el = panel.getElement();
      this.makeDraggable(el, key);

      const bottomGrid = document.getElementById('mapBottomGrid');
      if (bottomGrid && this.getEffectiveUltraWide() && this.bottomSetMemory.has(key)) {
        this.insertByOrder(bottomGrid, el, key);
        return;
      }

      const grid = document.getElementById('panelsGrid');
      if (!grid) return;
      this.insertByOrder(grid, el, key);
    }).catch((err) => {
      console.error(`[panel] failed to lazy-load "${key}"`, err);
    });
  }

  private makeDraggable(el: HTMLElement, key: string): void {
    el.dataset.panel = key;
    let isDragging = false;
    let dragStarted = false;
    let startX = 0;
    let startY = 0;
    let rafId = 0;
    const DRAG_THRESHOLD = 8;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (el.dataset.resizing === 'true') return;
      if (
        target.classList?.contains('panel-resize-handle') ||
        target.closest?.('.panel-resize-handle') ||
        target.classList?.contains('panel-col-resize-handle') ||
        target.closest?.('.panel-col-resize-handle')
      ) return;
      if (target.closest('button, a, input, select, textarea, .panel-content')) return;

      isDragging = true;
      dragStarted = false;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      if (!dragStarted) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
        dragStarted = true;
        el.classList.add('dragging');
      }
      const cx = e.clientX;
      const cy = e.clientY;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        this.handlePanelDragMove(el, cx, cy);
        rafId = 0;
      });
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (dragStarted) {
        el.classList.remove('dragging');
        const isInBottom = !!el.closest('.map-bottom-grid');
        if (isInBottom) {
          this.bottomSetMemory.add(key);
        } else {
          this.bottomSetMemory.delete(key);
        }
        this.savePanelOrder();
      }
      dragStarted = false;
    };

    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this.panelDragCleanupHandlers.push(() => {
      el.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      isDragging = false;
      dragStarted = false;
      el.classList.remove('dragging');
    });
  }

  private handlePanelDragMove(dragging: HTMLElement, clientX: number, clientY: number): void {
    const grid = document.getElementById('panelsGrid');
    const bottomGrid = document.getElementById('mapBottomGrid');
    if (!grid || !bottomGrid) return;

    dragging.style.pointerEvents = 'none';
    const target = document.elementFromPoint(clientX, clientY);
    dragging.style.pointerEvents = '';

    if (!target) return;

    // Check if we are over a grid or a panel inside a grid
    const targetGrid = (target.closest('.panels-grid') || target.closest('.map-bottom-grid')) as HTMLElement | null;
    const targetPanel = target.closest('.panel') as HTMLElement | null;

    if (!targetGrid && !targetPanel) return;

    const currentTargetGrid = targetGrid || (targetPanel ? targetPanel.parentElement as HTMLElement : null);
    if (!currentTargetGrid || (currentTargetGrid !== grid && currentTargetGrid !== bottomGrid)) return;

    if (targetPanel && targetPanel !== dragging && !targetPanel.classList.contains('hidden')) {
      const targetRect = targetPanel.getBoundingClientRect();
      const draggingRect = dragging.getBoundingClientRect();

      const children = Array.from(currentTargetGrid.children);
      const dragIdx = children.indexOf(dragging);
      const targetIdx = children.indexOf(targetPanel);

      const sameRow = Math.abs(draggingRect.top - targetRect.top) < 30;
      const targetMid = sameRow
        ? targetRect.left + targetRect.width / 2
        : targetRect.top + targetRect.height / 2;
      const cursorPos = sameRow ? clientX : clientY;

      if (dragIdx === -1) {
        // Moving from one grid to another
        if (cursorPos < targetMid) {
          currentTargetGrid.insertBefore(dragging, targetPanel);
        } else {
          currentTargetGrid.insertBefore(dragging, targetPanel.nextSibling);
        }
      } else {
        // Reordering within same grid
        if (dragIdx < targetIdx) {
          if (cursorPos > targetMid) {
            currentTargetGrid.insertBefore(dragging, targetPanel.nextSibling);
          }
        } else {
          if (cursorPos < targetMid) {
            currentTargetGrid.insertBefore(dragging, targetPanel);
          }
        }
      }
    } else if (currentTargetGrid !== dragging.parentElement) {
      // Dragging over an empty or near-empty grid zone
      currentTargetGrid.appendChild(dragging);
    }
  }

  getLocalizedPanelName(panelKey: string, fallback: string): string {
    if (panelKey === 'runtime-config') {
      return t('modals.runtimeConfig.title');
    }
    const key = panelKey.replace(/-([a-z])/g, (_match, group: string) => group.toUpperCase());
    const lookup = `panels.${key}`;
    const localized = t(lookup);
    return localized === lookup ? fallback : localized;
  }

  getAllSourceNames(): string[] {
    const sources = new Set<string>();
    Object.values(FEEDS).forEach(feeds => {
      if (feeds) feeds.forEach(f => sources.add(f.name));
    });
    INTEL_SOURCES.forEach(f => sources.add(f.name));
    return Array.from(sources).sort((a, b) => a.localeCompare(b));
  }

  initShellGuidanceAfterRender(): void {
    const strip = document.getElementById('shellGuidanceStrip');
    if (strip) {
      const shouldHide = this.ctx.isMobile || localStorage.getItem('wm-ui-desktop-onboarding-dismissed') === 'true';
      strip.classList.toggle('hidden', shouldHide);
      document.getElementById('shellGuidanceDismiss')?.addEventListener('click', () => {
        localStorage.setItem('wm-ui-desktop-onboarding-dismissed', 'true');
        strip.classList.add('hidden');
      });
    }
  }
}
