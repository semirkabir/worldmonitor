import type { AppContext, AppModule } from '@/app/app-context';
import type { AirlineIntelPanel } from '@/components/AirlineIntelPanel';
import type { PanelConfig } from '@/types';
import type { MapView } from '@/components';
import type { ClusteredEvent } from '@/types';
import type { DashboardSnapshot } from '@/services/storage';
import {
  PlaybackControl,
  StatusPanel,
  CIIPanel,
  PredictionPanel,
} from '@/components';
import {
  buildMapUrl,
  debounce,
  saveToStorage,
  ExportPanel,
  getCurrentTheme,
  setTheme,
} from '@/utils';
import {
  IDLE_PAUSE_MS,
  STORAGE_KEYS,
  SITE_VARIANT,
  LAYER_TO_SOURCE,
  FEEDS,
  INTEL_SOURCES,
  DEFAULT_PANELS,
} from '@/config';
import {
  saveSnapshot,
  initAisStream,
  disconnectAisStream,
} from '@/services';
import {
  trackPanelView,
  trackVariantSwitch,
  trackThemeChanged,
  trackMapViewChange,
  trackMapLayerToggle,
  trackPanelToggled,
} from '@/services/analytics';
import { invokeTauri } from '@/services/tauri-bridge';
import { dataFreshness } from '@/services/data-freshness';
import { mlWorker } from '@/services/ml-worker';
import { UnifiedSettings } from '@/components/UnifiedSettings';
import { NotificationCenter } from '@/components/NotificationCenter';
import { t } from '@/services/i18n';
import { TvModeController } from '@/services/tv-mode';

export interface EventHandlerCallbacks {
  updateSearchIndex: () => void;
  loadAllData: () => Promise<void>;
  flushStaleRefreshes: () => void;
  setHiddenSince: (ts: number) => void;
  loadDataForLayer: (layer: string) => void;
  waitForAisData: () => void;
  syncDataFreshnessWithLayers: () => void;
  ensureCorrectZones: () => void;
  refreshOpenCountryBrief?: () => void;
}

export class EventHandlerManager implements AppModule {
  private ctx: AppContext;
  private callbacks: EventHandlerCallbacks;

  private boundFullscreenHandler: (() => void) | null = null;
  private boundResizeHandler: (() => void) | null = null;
  private boundVisibilityHandler: (() => void) | null = null;
  private boundDesktopExternalLinkHandler: ((e: MouseEvent) => void) | null = null;
  private boundIdleResetHandler: (() => void) | null = null;
  private boundStorageHandler: ((e: StorageEvent) => void) | null = null;
  private boundTvKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundFocalPointsReadyHandler: (() => void) | null = null;
  private boundThemeChangedHandler: (() => void) | null = null;
  private boundMapResizeMoveHandler: ((e: MouseEvent) => void) | null = null;
  private boundMapEndResizeHandler: (() => void) | null = null;
  private boundBloombergKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private kbShortcutsOverlay: HTMLElement | null = null;
  private statusDropdownEl: HTMLElement | null = null;
  private statusDropdownTimer: ReturnType<typeof setTimeout> | null = null;
  private boundMapResizeVisChangeHandler: (() => void) | null = null;
  private boundMapFullscreenEscHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundMobileMenuKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private snapshotIntervalId: ReturnType<typeof setInterval> | null = null;
  private clockIntervalId: ReturnType<typeof setInterval> | null = null;

  private readonly idlePauseMs = IDLE_PAUSE_MS;
  private readonly debouncedUrlSync = debounce(() => {
    const shareUrl = this.getShareUrl();
    if (!shareUrl) return;
    try { history.replaceState(null, '', shareUrl); } catch { }
  }, 250);

  constructor(ctx: AppContext, callbacks: EventHandlerCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
  }

  private switchVariant(variant: string): void {
    trackVariantSwitch(SITE_VARIANT, variant);
    localStorage.setItem('worldmonitor-variant', variant);

    // Clear persisted UI/map state so previous variant layers/panels cannot leak.
    localStorage.removeItem(STORAGE_KEYS.mapLayers);
    localStorage.removeItem(STORAGE_KEYS.panels);
    localStorage.removeItem('panel-order');
    localStorage.removeItem('panel-order-bottom');
    localStorage.removeItem('panel-order-bottom-set');
    localStorage.removeItem('worldmonitor-panel-spans');

    // Drop query params like ?layers=... that can override variant defaults.
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.location.assign(cleanUrl);
  }

  init(): void {
    this.setupEventListeners();
    this.setupIdleDetection();
    this.setupTvMode();
    this.setupBloombergShortcuts();
    this.setupStatusDropdown();
  }

  private setupTvMode(): void {
    if (SITE_VARIANT !== 'happy') return;

    const tvBtn = document.getElementById('tvModeBtn');
    const tvExitBtn = document.getElementById('tvExitBtn');
    if (tvBtn) {
      tvBtn.addEventListener('click', () => this.toggleTvMode());
    }
    if (tvExitBtn) {
      tvExitBtn.addEventListener('click', () => this.toggleTvMode());
    }
    // Keyboard shortcut: Shift+T
    this.boundTvKeydownHandler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'T' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const active = document.activeElement;
        if (active?.tagName !== 'INPUT' && active?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          this.toggleTvMode();
        }
      }
    };
    document.addEventListener('keydown', this.boundTvKeydownHandler);
  }

  private toggleTvMode(): void {
    const panelKeys = Object.keys(DEFAULT_PANELS).filter(
      key => this.ctx.panelSettings[key]?.enabled !== false
    );
    if (!this.ctx.tvMode) {
      this.ctx.tvMode = new TvModeController({
        panelKeys,
        onPanelChange: () => {
          document.getElementById('tvModeBtn')?.classList.toggle('active', this.ctx.tvMode?.active ?? false);
        }
      });
    } else {
      this.ctx.tvMode.updatePanelKeys(panelKeys);
    }
    this.ctx.tvMode.toggle();
    document.getElementById('tvModeBtn')?.classList.toggle('active', this.ctx.tvMode.active);
  }

  destroy(): void {
    this.debouncedUrlSync.cancel();
    if (this.boundFullscreenHandler) {
      document.removeEventListener('fullscreenchange', this.boundFullscreenHandler);
      this.boundFullscreenHandler = null;
    }
    if (this.boundResizeHandler) {
      window.removeEventListener('resize', this.boundResizeHandler);
      this.boundResizeHandler = null;
    }
    if (this.boundVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
      this.boundVisibilityHandler = null;
    }
    if (this.boundDesktopExternalLinkHandler) {
      document.removeEventListener('click', this.boundDesktopExternalLinkHandler, true);
      this.boundDesktopExternalLinkHandler = null;
    }
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
    if (this.boundIdleResetHandler) {
      ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
        document.removeEventListener(event, this.boundIdleResetHandler!);
      });
      this.boundIdleResetHandler = null;
    }
    if (this.snapshotIntervalId) {
      clearInterval(this.snapshotIntervalId);
      this.snapshotIntervalId = null;
    }
    if (this.clockIntervalId) {
      clearInterval(this.clockIntervalId);
      this.clockIntervalId = null;
    }
    if (this.boundStorageHandler) {
      window.removeEventListener('storage', this.boundStorageHandler);
      this.boundStorageHandler = null;
    }
    if (this.boundTvKeydownHandler) {
      document.removeEventListener('keydown', this.boundTvKeydownHandler);
      this.boundTvKeydownHandler = null;
    }
    if (this.boundFocalPointsReadyHandler) {
      window.removeEventListener('focal-points-ready', this.boundFocalPointsReadyHandler);
      this.boundFocalPointsReadyHandler = null;
    }
    if (this.boundThemeChangedHandler) {
      window.removeEventListener('theme-changed', this.boundThemeChangedHandler);
      this.boundThemeChangedHandler = null;
    }
    if (this.boundMapResizeMoveHandler) {
      document.removeEventListener('mousemove', this.boundMapResizeMoveHandler);
      this.boundMapResizeMoveHandler = null;
    }
    if (this.boundMapEndResizeHandler) {
      document.removeEventListener('mouseup', this.boundMapEndResizeHandler);
      window.removeEventListener('blur', this.boundMapEndResizeHandler);
      this.boundMapEndResizeHandler = null;
    }
    if (this.boundMapResizeVisChangeHandler) {
      document.removeEventListener('visibilitychange', this.boundMapResizeVisChangeHandler);
      this.boundMapResizeVisChangeHandler = null;
    }
    if (this.boundMapFullscreenEscHandler) {
      document.removeEventListener('keydown', this.boundMapFullscreenEscHandler);
      this.boundMapFullscreenEscHandler = null;
    }
    if (this.boundMobileMenuKeyHandler) {
      document.removeEventListener('keydown', this.boundMobileMenuKeyHandler);
      this.boundMobileMenuKeyHandler = null;
    }
    if (this.boundBloombergKeyHandler) {
      document.removeEventListener('keydown', this.boundBloombergKeyHandler);
      this.boundBloombergKeyHandler = null;
    }
    this.kbShortcutsOverlay?.remove();
    this.kbShortcutsOverlay = null;
    this.ctx.tvMode?.destroy();
    this.ctx.tvMode = null;
    this.ctx.unifiedSettings?.destroy();
    this.ctx.unifiedSettings = null;
  }

  private setupEventListeners(): void {
    const openSearch = () => {
      this.callbacks.updateSearchIndex();
      this.ctx.searchModal?.open();
    };
    document.getElementById('searchBtn')?.addEventListener('click', openSearch);
    document.getElementById('mobileSearchBtn')?.addEventListener('click', openSearch);
    document.getElementById('searchMobileFab')?.addEventListener('click', openSearch);

    document.getElementById('saveLayoutBtn')?.addEventListener('click', async () => {
      const shareUrl = this.getShareUrl();
      if (!shareUrl) return;
      const button = document.getElementById('saveLayoutBtn');
      try {
        const urlObj = new URL(shareUrl);
        localStorage.setItem('worldmonitor-saved-map-layout', urlObj.search);
        this.setCopyLinkFeedback(button, t('header.layoutSaved'));
      } catch (error) {
        console.warn('Failed to save layout:', error);
      }
    });

    this.boundStorageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.panels && e.newValue) {
        try {
          this.ctx.panelSettings = JSON.parse(e.newValue) as Record<string, PanelConfig>;
          this.applyPanelSettings();
          this.ctx.unifiedSettings?.refreshPanelToggles();
        } catch (_) { }
      }
      if (e.key === STORAGE_KEYS.liveChannels && e.newValue) {
        const panel = this.ctx.panels['live-news'];
        if (panel && typeof (panel as unknown as { refreshChannelsFromStorage?: () => void }).refreshChannelsFromStorage === 'function') {
          (panel as unknown as { refreshChannelsFromStorage: () => void }).refreshChannelsFromStorage();
        }
      }
    };
    window.addEventListener('storage', this.boundStorageHandler);

    document.getElementById('headerThemeToggle')?.addEventListener('click', () => {
      const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
      setTheme(next);
      this.updateHeaderThemeIcon();
      trackThemeChanged(next);
    });

    const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (this.ctx.isDesktopApp || isLocalDev) {
      this.ctx.container.querySelectorAll<HTMLAnchorElement>('.variant-option').forEach(link => {
        link.addEventListener('click', (e) => {
          const variant = link.dataset.variant;
          if (variant && variant !== SITE_VARIANT) {
            e.preventDefault();
            this.switchVariant(variant);
          }
        });
      });
    }

    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (!this.ctx.isDesktopApp && fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
      this.boundFullscreenHandler = () => {
        fullscreenBtn.textContent = document.fullscreenElement ? '\u26F6' : '\u26F6';
        fullscreenBtn.classList.toggle('active', !!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', this.boundFullscreenHandler);
    }

    const regionSelect = document.getElementById('regionSelect') as HTMLSelectElement;
    regionSelect?.addEventListener('change', () => {
      this.ctx.map?.setView(regionSelect.value as MapView);
      trackMapViewChange(regionSelect.value);
    });

    this.boundResizeHandler = debounce(() => {
      this.ctx.map?.setIsResizing(false);
      this.ctx.map?.render();
    }, 150);
    window.addEventListener('resize', this.boundResizeHandler);

    this.setupMapResize();
    this.setupMapPin();

    this.boundVisibilityHandler = () => {
      document.body?.classList.toggle('animations-paused', document.hidden);
      if (this.ctx.isDesktopApp) {
        this.ctx.map?.setRenderPaused(document.hidden);
      }
      if (document.hidden) {
        this.callbacks.setHiddenSince(Date.now());
        mlWorker.unloadOptionalModels();
      } else {
        this.resetIdleTimer();
        this.callbacks.flushStaleRefreshes();
      }
    };
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);

    this.boundFocalPointsReadyHandler = () => {
      (this.ctx.panels['cii'] as CIIPanel)?.refresh(true);
      this.callbacks.refreshOpenCountryBrief?.();
    };
    window.addEventListener('focal-points-ready', this.boundFocalPointsReadyHandler);

    this.boundThemeChangedHandler = () => {
      this.ctx.map?.render();
      this.updateHeaderThemeIcon();
      this.updateMobileMenuThemeItem();
    };
    window.addEventListener('theme-changed', this.boundThemeChangedHandler);

    this.setupMobileMenu();

    if (this.ctx.isDesktopApp) {
      if (this.boundDesktopExternalLinkHandler) {
        document.removeEventListener('click', this.boundDesktopExternalLinkHandler, true);
      }
      this.boundDesktopExternalLinkHandler = (e: MouseEvent) => {
        if (!(e.target instanceof Element)) return;
        const anchor = e.target.closest('a[href]') as HTMLAnchorElement | null;
        if (!anchor) return;
        const href = anchor.href;
        if (!href || href.startsWith('javascript:') || href === '#' || href.startsWith('#')) return;
        // Only handle valid http(s) URLs
        let url: URL;
        try {
          url = new URL(href, window.location.href);
        } catch {
          // Malformed URL, let browser handle
          return;
        }
        if (url.origin === window.location.origin) return;
        if (!/^https?:$/.test(url.protocol)) return; // Only allow http(s) links
        e.preventDefault();
        e.stopPropagation();
        void invokeTauri<void>('open_url', { url: url.toString() }).catch(() => {
          window.open(url.toString(), '_blank');
        });
      };
      document.addEventListener('click', this.boundDesktopExternalLinkHandler, true);
    }
  }

  private setupMobileMenu(): void {
    const hamburger = document.getElementById('hamburgerBtn');
    const overlay = document.getElementById('mobileMenuOverlay');
    const menu = document.getElementById('mobileMenu');
    const closeBtn = document.getElementById('mobileMenuClose');
    if (!hamburger || !overlay || !menu || !closeBtn) return;

    hamburger.addEventListener('click', () => this.openMobileMenu());
    overlay.addEventListener('click', () => this.closeMobileMenu());
    closeBtn.addEventListener('click', () => this.closeMobileMenu());

    const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    menu.querySelectorAll<HTMLButtonElement>('.mobile-menu-variant').forEach(btn => {
      btn.addEventListener('click', () => {
        const variant = btn.dataset.variant;
        if (variant && variant !== SITE_VARIANT) {
          if (this.ctx.isDesktopApp || isLocalDev) {
            this.switchVariant(variant);
          } else {
            const hosts: Record<string, string> = {
              full: 'https://worldmonitor.app',
              tech: 'https://tech.worldmonitor.app',
              finance: 'https://finance.worldmonitor.app',
              commodity: 'https://commodity.worldmonitor.app',
              happy: 'https://happy.worldmonitor.app',
              conflicts: 'https://conflicts.worldmonitor.app',
            };
            if (hosts[variant]) window.location.href = hosts[variant] ?? '';
          }
        }
      });
    });

    document.getElementById('mobileMenuRegion')?.addEventListener('click', () => {
      this.closeMobileMenu();
      this.openRegionSheet();
    });

    document.getElementById('mobileMenuSettings')?.addEventListener('click', () => {
      this.closeMobileMenu();
      this.ctx.unifiedSettings?.open();
    });

    document.getElementById('mobileMenuTheme')?.addEventListener('click', () => {
      this.closeMobileMenu();
      const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
      setTheme(next);
      this.updateHeaderThemeIcon();
      trackThemeChanged(next);
    });

    const sheetBackdrop = document.getElementById('regionSheetBackdrop');
    sheetBackdrop?.addEventListener('click', () => this.closeRegionSheet());

    const sheet = document.getElementById('regionBottomSheet');
    sheet?.querySelectorAll<HTMLButtonElement>('.region-sheet-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const region = opt.dataset.region;
        if (!region) return;
        this.ctx.map?.setView(region as MapView);
        trackMapViewChange(region);
        const regionSelect = document.getElementById('regionSelect') as HTMLSelectElement;
        if (regionSelect) regionSelect.value = region;
        sheet.querySelectorAll('.region-sheet-option').forEach(o => {
          o.classList.toggle('active', o === opt);
          const check = o.querySelector('.region-sheet-check');
          if (check) check.textContent = o === opt ? '✓' : '';
        });
        const menuRegionLabel = document.getElementById('mobileMenuRegion')?.querySelector('.mobile-menu-item-label');
        if (menuRegionLabel) menuRegionLabel.textContent = opt.querySelector('span')?.textContent ?? '';
        this.closeRegionSheet();
      });
    });

    this.boundMobileMenuKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sheet?.classList.contains('open')) {
          this.closeRegionSheet();
        } else if (menu.classList.contains('open')) {
          this.closeMobileMenu();
        }
      }
    };
    document.addEventListener('keydown', this.boundMobileMenuKeyHandler);
  }

  private openMobileMenu(): void {
    const overlay = document.getElementById('mobileMenuOverlay');
    const menu = document.getElementById('mobileMenu');
    if (!overlay || !menu) return;
    overlay.classList.add('open');
    requestAnimationFrame(() => menu.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }

  private closeMobileMenu(): void {
    const overlay = document.getElementById('mobileMenuOverlay');
    const menu = document.getElementById('mobileMenu');
    if (!overlay || !menu) return;
    menu.classList.remove('open');
    overlay.classList.remove('open');
    const sheetOpen = document.getElementById('regionBottomSheet')?.classList.contains('open');
    if (!sheetOpen) document.body.style.overflow = '';
  }

  private openRegionSheet(): void {
    const backdrop = document.getElementById('regionSheetBackdrop');
    const sheet = document.getElementById('regionBottomSheet');
    if (!backdrop || !sheet) return;
    backdrop.classList.add('open');
    requestAnimationFrame(() => sheet.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }

  private closeRegionSheet(): void {
    const backdrop = document.getElementById('regionSheetBackdrop');
    const sheet = document.getElementById('regionBottomSheet');
    if (!backdrop || !sheet) return;
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  private setupIdleDetection(): void {
    this.boundIdleResetHandler = () => {
      if (this.ctx.isIdle) {
        this.ctx.isIdle = false;
        document.body?.classList.remove('animations-paused');
      }
      this.resetIdleTimer();
    };

    ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
      document.addEventListener(event, this.boundIdleResetHandler!, { passive: true });
    });

    this.resetIdleTimer();
  }

  resetIdleTimer(): void {
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
    }
    this.idleTimeoutId = setTimeout(() => {
      if (!document.hidden) {
        this.ctx.isIdle = true;
        document.body?.classList.add('animations-paused');
        console.log('[App] User idle - pausing animations to save resources');
      }
    }, this.idlePauseMs);
  }

  setupUrlStateSync(): void {
    if (!this.ctx.map) return;

    this.ctx.map.onStateChanged(() => {
      this.debouncedUrlSync();
      const regionSelect = document.getElementById('regionSelect') as HTMLSelectElement;
      if (regionSelect && this.ctx.map) {
        const state = this.ctx.map.getState();
        if (regionSelect.value !== state.view) {
          regionSelect.value = state.view;
        }
      }
    });
    this.debouncedUrlSync();
  }

  syncUrlState(): void {
    this.debouncedUrlSync();
  }

  getShareUrl(): string | null {
    if (!this.ctx.map) return null;
    const state = this.ctx.map.getState();
    const center = this.ctx.map.getCenter();
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const briefPage = this.ctx.countryBriefPage;
    const isCountryVisible = briefPage?.isVisible() ?? false;
    return buildMapUrl(baseUrl, {
      view: state.view,
      zoom: state.zoom,
      center,
      timeRange: state.timeRange,
      layers: state.layers,
      country: isCountryVisible ? (briefPage?.getCode() ?? undefined) : undefined,
      expanded: isCountryVisible && briefPage?.getIsMaximized?.() ? true : undefined,
    });
  }



  private setCopyLinkFeedback(button: HTMLElement | null, message: string): void {
    if (!button) return;
    const originalText = button.textContent ?? '';
    button.textContent = message;
    button.classList.add('copied');
    window.setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 1500);
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      try { void document.exitFullscreen()?.catch(() => { }); } catch { }
    } else {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
      if (el.requestFullscreen) {
        try { void el.requestFullscreen()?.catch(() => { }); } catch { }
      } else if (el.webkitRequestFullscreen) {
        try { el.webkitRequestFullscreen(); } catch { }
      }
    }
  }

  updateHeaderThemeIcon(): void {
    const btn = document.getElementById('headerThemeToggle');
    if (!btn) return;
    const isDark = getCurrentTheme() === 'dark';
    btn.innerHTML = isDark
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
  }

  private updateMobileMenuThemeItem(): void {
    const btn = document.getElementById('mobileMenuTheme');
    if (!btn) return;
    const isDark = getCurrentTheme() === 'dark';
    const icon = btn.querySelector('.mobile-menu-item-icon');
    const label = btn.querySelector('.mobile-menu-item-label');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  }

  startHeaderClock(): void {
    const el = document.getElementById('headerClock');
    if (!el) return;
    const tick = () => {
      el.textContent = new Date().toUTCString().replace('GMT', 'UTC');
    };
    tick();
    this.clockIntervalId = setInterval(tick, 1000);
  }

  setupStatusPanel(): void {
    this.ctx.statusPanel = new StatusPanel();
  }

  setupPizzIntIndicator(): void {
    // PizzIntIndicator removed from header
  }

  setupExportPanel(): void {
    this.ctx.exportPanel = new ExportPanel(() => ({
      news: this.ctx.latestClusters.length > 0 ? this.ctx.latestClusters : this.ctx.allNews,
      markets: this.ctx.latestMarkets,
      predictions: this.ctx.latestPredictions,
      timestamp: Date.now(),
    }));

    const headerRight = this.ctx.container.querySelector('.header-right');
    if (headerRight) {
      headerRight.insertBefore(this.ctx.exportPanel.getElement(), headerRight.firstChild);
    }
  }

  setupUnifiedSettings(): void {
    this.ctx.unifiedSettings = new UnifiedSettings({
      getPanelSettings: () => this.ctx.panelSettings,
      togglePanel: (key: string) => {
        const config = this.ctx.panelSettings[key];
        if (config) {
          config.enabled = !config.enabled;
          trackPanelToggled(key, config.enabled);
          saveToStorage(STORAGE_KEYS.panels, this.ctx.panelSettings);
          this.applyPanelSettings();
        }
      },
      getDisabledSources: () => this.ctx.disabledSources,
      toggleSource: (name: string) => {
        if (this.ctx.disabledSources.has(name)) {
          this.ctx.disabledSources.delete(name);
        } else {
          this.ctx.disabledSources.add(name);
        }
        saveToStorage(STORAGE_KEYS.disabledFeeds, Array.from(this.ctx.disabledSources));
      },
      setSourcesEnabled: (names: string[], enabled: boolean) => {
        for (const name of names) {
          if (enabled) this.ctx.disabledSources.delete(name);
          else this.ctx.disabledSources.add(name);
        }
        saveToStorage(STORAGE_KEYS.disabledFeeds, Array.from(this.ctx.disabledSources));
      },
      getAllSourceNames: () => this.getAllSourceNames(),
      getLocalizedPanelName: (key: string, fallback: string) => this.getLocalizedPanelName(key, fallback),
      resetLayout: () => {
        localStorage.removeItem(this.ctx.PANEL_SPANS_KEY);
        localStorage.removeItem('worldmonitor-panel-col-spans');
        localStorage.removeItem(this.ctx.PANEL_ORDER_KEY);
        localStorage.removeItem(this.ctx.PANEL_ORDER_KEY + '-bottom');
        localStorage.removeItem(this.ctx.PANEL_ORDER_KEY + '-bottom-set');
        localStorage.removeItem('map-height');
        localStorage.removeItem('worldmonitor-sidebar-split');
        localStorage.removeItem('worldmonitor-panels-collapsed');
        localStorage.removeItem('worldmonitor-bottom-grid-collapsed');
        window.location.reload();
      },
      isDesktopApp: this.ctx.isDesktopApp,
      onMapProviderChange: () => {
        this.ctx.map?.reloadBasemap();
      },
    });

    const mount = document.getElementById('unifiedSettingsMount');
    if (mount) {
      mount.appendChild(this.ctx.unifiedSettings.getButton());
    }

    const mobileBtn = document.getElementById('mobileSettingsBtn');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => this.ctx.unifiedSettings?.open());
    }
  }

  setupNotificationCenter(): void {
    const nc = new NotificationCenter();
    nc.setLocationClickHandler((lat, lon) => {
      this.ctx.map?.setCenter(lat, lon, 6);
    });
    const settingsMount = document.getElementById('unifiedSettingsMount');
    if (settingsMount) {
      settingsMount.parentElement?.insertBefore(nc['el'], settingsMount);
    }
  }

  setupPlaybackControl(): void {
    this.ctx.playbackControl = new PlaybackControl();
    this.ctx.playbackControl.onSnapshot((snapshot) => {
      if (snapshot) {
        this.ctx.isPlaybackMode = true;
        this.restoreSnapshot(snapshot);
      } else {
        this.ctx.isPlaybackMode = false;
        this.callbacks.loadAllData();
      }
    });

    const headerRight = this.ctx.container.querySelector('.header-right');
    if (headerRight) {
      headerRight.insertBefore(this.ctx.playbackControl.getElement(), headerRight.firstChild);
    }
  }

  setupSnapshotSaving(): void {
    const saveCurrentSnapshot = async () => {
      if (this.ctx.isPlaybackMode || this.ctx.isDestroyed) return;

      const marketPrices: Record<string, number> = {};
      this.ctx.latestMarkets.forEach(m => {
        if (m.price !== null) marketPrices[m.symbol] = m.price;
      });

      await saveSnapshot({
        timestamp: Date.now(),
        events: this.ctx.latestClusters,
        marketPrices,
        predictions: this.ctx.latestPredictions.map(p => ({
          title: p.title,
          yesPrice: p.yesPrice
        })),
        hotspotLevels: this.ctx.map?.getHotspotLevels() ?? {}
      });
    };

    void saveCurrentSnapshot().catch((e) => console.warn('[Snapshot] save failed:', e));
    this.snapshotIntervalId = setInterval(() => void saveCurrentSnapshot().catch((e) => console.warn('[Snapshot] save failed:', e)), 15 * 60 * 1000);
  }

  restoreSnapshot(snapshot: DashboardSnapshot): void {
    for (const panel of Object.values(this.ctx.newsPanels)) {
      panel.showLoading();
    }

    const events = snapshot.events as ClusteredEvent[];
    this.ctx.latestClusters = events;

    const predictions = snapshot.predictions.map((p, i) => ({
      id: `snap-${i}`,
      title: p.title,
      yesPrice: p.yesPrice,
      noPrice: 100 - p.yesPrice,
      volume24h: 0,
      liquidity: 0,
    }));
    this.ctx.latestPredictions = predictions;
    (this.ctx.panels['polymarket'] as PredictionPanel).renderPredictions(predictions);

    this.ctx.map?.setHotspotLevels(snapshot.hotspotLevels);
  }

  setupMapLayerHandlers(): void {
    this.ctx.map?.setOnLayerChange((layer, enabled, source) => {
      console.log(`[App.onLayerChange] ${layer}: ${enabled} (${source})`);
      trackMapLayerToggle(layer, enabled, source);
      this.ctx.mapLayers[layer] = enabled;
      saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
      this.syncUrlState();

      const sourceIds = LAYER_TO_SOURCE[layer];
      if (sourceIds) {
        for (const sourceId of sourceIds) {
          dataFreshness.setEnabled(sourceId, enabled);
        }
      }

      if (layer === 'ais') {
        if (enabled) {
          this.ctx.map?.setLayerLoading('ais', true);
          initAisStream();
          this.callbacks.waitForAisData();
        } else {
          disconnectAisStream();
        }
        return;
      }

      if (layer === 'flights') {
        const airlineIntel = this.ctx.panels['airline-intel'] as AirlineIntelPanel | undefined;
        airlineIntel?.setLiveMode(enabled);
      }

      if (enabled) {
        this.callbacks.loadDataForLayer(layer);
      }
    });

    // Forward live aircraft positions from map to AirlineIntelPanel + cache
    this.ctx.map?.setOnAircraftPositionsUpdate((positions) => {
      this.ctx.intelligenceCache.aircraftPositions = positions;
      const airlineIntel = this.ctx.panels['airline-intel'] as AirlineIntelPanel | undefined;
      airlineIntel?.updateLivePositions(positions);
    });
  }

  setupPanelViewTracking(): void {
    const viewedPanels = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.3) {
          const id = (entry.target as HTMLElement).dataset.panel;
          if (id && !viewedPanels.has(id)) {
            viewedPanels.add(id);
            trackPanelView(id);
          }
        }
      }
    }, { threshold: 0.3 });

    const grid = document.getElementById('panelsGrid');
    if (grid) {
      for (const child of Array.from(grid.children)) {
        if ((child as HTMLElement).dataset.panel) {
          observer.observe(child);
        }
      }
    }
  }

  showToast(msg: string): void {
    document.querySelector('.toast-notification')?.remove();
    const el = document.createElement('div');
    el.className = 'toast-notification';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 300); }, 3000);
  }

  shouldShowIntelligenceNotifications(): boolean {
    return !this.ctx.isMobile && !!this.ctx.findingsBadge?.isPopupEnabled();
  }

  setupMapResize(): void {
    const mainContent = document.querySelector('.main-content') as HTMLElement | null;
    const mapSection = document.getElementById('mapSection') as HTMLElement | null;
    const mapContainer = document.getElementById('mapContainer') as HTMLElement | null;
    const rightHandle = document.getElementById('mapResizeHandle') as HTMLElement | null;
    const bottomHandle = document.getElementById('bottomGridResizeHandle') as HTMLElement | null;
    if (!mainContent || !mapSection || !mapContainer || (!rightHandle && !bottomHandle)) return;

    const MAP_HEIGHT_KEY = 'map-height';
    const SIDEBAR_SPLIT_KEY = 'worldmonitor-sidebar-split';
    const DEFAULT_SIDEBAR_SPLIT = 60;
    const MIN_RIGHT_COLUMN_PX = 320;
    const MIN_MAP_COLUMN_PX = 460;

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const isSideLikeLayout = () => window.innerWidth >= 1600 || mainContent.classList.contains('layout-side');

    const clampSidebarSplit = (percent: number) => {
      const totalWidth = mainContent.getBoundingClientRect().width;
      if (totalWidth <= 0) return DEFAULT_SIDEBAR_SPLIT;
      const minPercent = (MIN_MAP_COLUMN_PX / totalWidth) * 100;
      const maxPercent = ((totalWidth - MIN_RIGHT_COLUMN_PX) / totalWidth) * 100;
      if (maxPercent <= minPercent) return clamp(percent, 45, 70);
      return clamp(percent, minPercent, maxPercent);
    };

    const applySidebarSplit = (percent: number, persist: boolean) => {
      const clamped = clampSidebarSplit(percent);
      mainContent.style.setProperty('--map-sidebar-split', `${clamped}%`);
      if (persist) {
        localStorage.setItem(SIDEBAR_SPLIT_KEY, String(clamped));
      }
      return clamped;
    };

    const hydrateSidebarSplit = () => {
      if (!isSideLikeLayout()) return;
      const stored = localStorage.getItem(SIDEBAR_SPLIT_KEY);
      const parsed = stored ? Number.parseFloat(stored) : Number.NaN;
      if (Number.isFinite(parsed)) {
        applySidebarSplit(parsed, false);
      } else {
        applySidebarSplit(DEFAULT_SIDEBAR_SPLIT, false);
      }
    };

    const getMinHeight = () => (window.innerWidth >= 1600 ? 280 : 350);
    const getMaxHeight = () => {
      if (window.innerWidth < 1600) return Math.max(getMinHeight(), window.innerHeight - 150);

      const bottomGrid = document.getElementById('mapBottomGrid');
      const isEmpty = !bottomGrid || bottomGrid.children.length === 0;
      const headerHeight = 60;
      const totalAvailable = window.innerHeight - headerHeight;

      return isEmpty ? totalAvailable - 25 : totalAvailable - 300;
    };

    const getBottomResizeTarget = () => (window.innerWidth >= 1600 ? mapContainer : mapSection);

    const savedHeight = localStorage.getItem(MAP_HEIGHT_KEY);
    if (savedHeight) {
      const numeric = Number.parseInt(savedHeight, 10);
      if (Number.isFinite(numeric)) {
        const clamped = clamp(numeric, getMinHeight(), getMaxHeight());
        if (window.innerWidth >= 1600) {
          mapContainer.style.flex = 'none';
          mapContainer.style.height = `${clamped}px`;
        } else {
          mapSection.style.height = `${clamped}px`;
        }
        if (clamped !== numeric) {
          localStorage.setItem(MAP_HEIGHT_KEY, `${clamped}px`);
        }
      } else {
        localStorage.removeItem(MAP_HEIGHT_KEY);
      }
    }
    hydrateSidebarSplit();

    type ResizeMode = 'none' | 'bottom' | 'right';
    let resizeMode: ResizeMode = 'none';
    let startY = 0;
    let startX = 0;
    let startHeight = 0;
    let startMapWidth = 0;

    this.boundMapEndResizeHandler = () => {
      if (resizeMode === 'none') return;
      const endedMode = resizeMode;
      resizeMode = 'none';
      this.ctx.map?.setIsResizing(false);
      this.ctx.map?.resize();
      mapSection.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (endedMode === 'bottom') {
        const target = getBottomResizeTarget();
        if (target.style.height) {
          localStorage.setItem(MAP_HEIGHT_KEY, target.style.height);
        }
      } else if (endedMode === 'right') {
        const current = Number.parseFloat(
          mainContent.style.getPropertyValue('--map-sidebar-split')
        );
        if (Number.isFinite(current)) {
          localStorage.setItem(SIDEBAR_SPLIT_KEY, String(current));
        }
      }
    };
    const endResize = this.boundMapEndResizeHandler;

    if (bottomHandle) {
      bottomHandle.addEventListener('mousedown', (e) => {
        resizeMode = 'bottom';
        startY = e.clientY;
        const target = getBottomResizeTarget();
        startHeight = target.offsetHeight;
        this.ctx.map?.setIsResizing(true);
        mapSection.classList.add('resizing');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
      });

      bottomHandle.addEventListener('dblclick', () => {
        const isWide = window.innerWidth >= 1600;
        const target = isWide ? mapContainer : mapSection;
        const targetHeight = window.innerHeight * 0.5;
        const finalHeight = clamp(targetHeight, getMinHeight(), getMaxHeight());

        this.ctx.map?.setIsResizing(true);
        target.classList.add('map-section-smooth');

        if (isWide) target.style.flex = 'none';
        target.style.height = `${finalHeight}px`;

        let fired = false;
        const onEnd = () => {
          if (fired) return;
          fired = true;
          target.classList.remove('map-section-smooth');
          target.removeEventListener('transitionend', onEnd);
          localStorage.setItem(MAP_HEIGHT_KEY, `${finalHeight}px`);
          this.ctx.map?.setIsResizing(false);
          this.ctx.map?.resize();
        };

        target.addEventListener('transitionend', onEnd);
        this.ctx.map?.resize();
        setTimeout(onEnd, 500);
      });
    }

    if (rightHandle) {
      rightHandle.addEventListener('mousedown', (e) => {
        if (!isSideLikeLayout()) return;
        resizeMode = 'right';
        startX = e.clientX;
        startMapWidth = mapSection.getBoundingClientRect().width;
        this.ctx.map?.setIsResizing(true);
        mapSection.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
      });

      rightHandle.addEventListener('dblclick', () => {
        if (!isSideLikeLayout()) return;
        applySidebarSplit(DEFAULT_SIDEBAR_SPLIT, true);
        this.ctx.map?.resize();
      });
    }

    this.boundMapResizeMoveHandler = (e: MouseEvent) => {
      if (resizeMode === 'none') return;

      if (resizeMode === 'bottom') {
        const isWide = window.innerWidth >= 1600;
        const target = isWide ? mapContainer : mapSection;
        const deltaY = e.clientY - startY;
        const newHeight = clamp(startHeight + deltaY, getMinHeight(), getMaxHeight());

        if (isWide) target.style.flex = 'none';
        target.style.height = `${newHeight}px`;
        this.ctx.map?.resize();
        return;
      }

      if (resizeMode === 'right') {
        if (!isSideLikeLayout()) return;
        const totalWidth = mainContent.getBoundingClientRect().width;
        if (totalWidth <= 0) return;
        const deltaX = e.clientX - startX;
        const desiredPercent = ((startMapWidth + deltaX) / totalWidth) * 100;
        applySidebarSplit(desiredPercent, false);
        this.ctx.map?.resize();
      }
    };
    document.addEventListener('mousemove', this.boundMapResizeMoveHandler);

    document.addEventListener('mouseup', endResize);
    window.addEventListener('blur', endResize);
    this.boundMapResizeVisChangeHandler = () => {
      if (document.hidden) endResize();
    };
    document.addEventListener('visibilitychange', this.boundMapResizeVisChangeHandler);
  }

  setupMapPin(): void {
    const mapSection = document.getElementById('mapSection');
    const pinBtn = document.getElementById('mapPinBtn');
    if (!mapSection || !pinBtn) return;

    const isPinned = localStorage.getItem('map-pinned') === 'true';
    if (isPinned) {
      mapSection.classList.add('pinned');
      pinBtn.classList.add('active');
    }

    pinBtn.addEventListener('click', () => {
      const nowPinned = mapSection.classList.toggle('pinned');
      pinBtn.classList.toggle('active', nowPinned);
      localStorage.setItem('map-pinned', String(nowPinned));
    });

    this.setupMapFullscreen(mapSection);
    this.setupMapDimensionToggle();
  }

  // ─── Bloomberg Terminal-inspired keyboard shortcuts ───────────────────────

  private setupBloombergShortcuts(): void {
    this.boundBloombergKeyHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        e.ctrlKey || e.metaKey || e.altKey
      ) return;

      switch (e.key) {
        case '?':
          e.preventDefault();
          this.toggleKbShortcutsOverlay();
          break;
        case 'Escape':
          if (this.kbShortcutsOverlay) {
            this.kbShortcutsOverlay.remove();
            this.kbShortcutsOverlay = null;
          }
          break;
        case '/':
          e.preventDefault();
          this.callbacks.updateSearchIndex();
          this.ctx.searchModal?.open();
          break;
        case 'g':
        case 'G':
          if (!e.shiftKey) {
            e.preventDefault();
            if (!(this.ctx.map?.isGlobeMode() ?? false)) {
              document.querySelector<HTMLButtonElement>('[data-mode="globe"]')?.click();
            }
          }
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          if (this.ctx.map?.isGlobeMode() ?? true) {
            document.querySelector<HTMLButtonElement>('[data-mode="flat"]')?.click();
          }
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          this.ctx.map?.setView('global');
          break;
        case '+':
        case '=':
          e.preventDefault();
          (document.querySelector('.zoom-in') as HTMLButtonElement | null)?.click();
          break;
        case '-':
          e.preventDefault();
          (document.querySelector('.zoom-out') as HTMLButtonElement | null)?.click();
          break;
        case '0':
          e.preventDefault();
          (document.querySelector('.zoom-reset') as HTMLButtonElement | null)?.click();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          (document.getElementById('mapFullscreenBtn') as HTMLButtonElement | null)?.click();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          (document.getElementById('layerToggleBtn') as HTMLButtonElement | null)?.click();
          break;

        // Shift+S — share current view URL
        case 'S':
          if (e.shiftKey) {
            e.preventDefault();
            this.shareCurrentView();
          }
          break;
      }
    };
    document.addEventListener('keydown', this.boundBloombergKeyHandler);
  }

  private shareCurrentView(): void {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      this.showWmToast('\u2713  Link copied to clipboard');
    }).catch(() => {
      this.showToast('Copy failed \u2014 use Ctrl+C on the address bar');
    });
  }

  private showWmToast(message: string): void {
    document.querySelector('.wm-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'wm-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.classList.add('wm-toast-visible'); });
    setTimeout(() => {
      toast.classList.remove('wm-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  private toggleKbShortcutsOverlay(): void {
    if (this.kbShortcutsOverlay) {
      this.kbShortcutsOverlay.remove();
      this.kbShortcutsOverlay = null;
      return;
    }

    const shortcuts: [string, string][] = [
      ['/', 'Open search'],
      ['G', 'Switch to 3D globe'],
      ['M', 'Switch to 2D map'],
      ['R', 'Reset map view'],
      ['L', 'Toggle layers panel'],
      ['F', 'Fullscreen map'],
      ['+ / -', 'Zoom in / out'],
      ['0', 'Reset zoom'],
      ['Shift+S', 'Copy share link'],
      ['Cmd+K', 'Command search'],
      ['Shift+T', 'TV mode'],
      ['?', 'Toggle this panel'],
      ['Esc', 'Close'],
    ];

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '99999',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#0a0c10', border: '1px solid #ffaa00', borderRadius: '4px',
      padding: '28px 36px', minWidth: '460px', maxWidth: '90vw', fontFamily: 'monospace',
      boxShadow: '0 0 40px rgba(255,170,0,0.2)',
    });

    const title = document.createElement('div');
    title.textContent = '\u2328  KEYBOARD SHORTCUTS';
    Object.assign(title.style, {
      color: '#ffaa00', fontSize: '13px', fontWeight: 'bold', letterSpacing: '2px',
      marginBottom: '20px', borderBottom: '1px solid rgba(255,170,0,0.26)', paddingBottom: '10px',
    });
    box.appendChild(title);

    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px 24px',
    });

    shortcuts.forEach(([key, desc]) => {
      const keyEl = document.createElement('span');
      keyEl.textContent = key;
      Object.assign(keyEl.style, {
        color: '#ffaa00', fontSize: '11px', padding: '4px 8px',
        background: 'rgba(255,170,0,0.08)', borderRadius: '2px', letterSpacing: '0.5px',
      });

      const descEl = document.createElement('span');
      descEl.textContent = desc;
      Object.assign(descEl.style, {
        color: '#aaaaaa', fontSize: '11px', padding: '4px 0', alignSelf: 'center',
      });

      grid.appendChild(keyEl);
      grid.appendChild(descEl);
    });
    box.appendChild(grid);

    const footer = document.createElement('div');
    footer.textContent = 'PRESS ? OR ESC TO CLOSE';
    Object.assign(footer.style, {
      marginTop: '20px', color: '#555', fontSize: '10px',
      textAlign: 'center', letterSpacing: '1px',
    });
    box.appendChild(footer);
    overlay.appendChild(box);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        this.kbShortcutsOverlay = null;
      }
    });

    document.body.appendChild(overlay);
    this.kbShortcutsOverlay = overlay;
  }

  // ─── Live status hover dropdown ───────────────────────────────────────────

  // Sources that use a persistent WebSocket connection (true "live")
  private static readonly WS_SOURCES = new Set(['ais']);

  private setupStatusDropdown(): void {
    const indicator = document.querySelector<HTMLElement>('.status-indicator');
    if (!indicator) return;

    indicator.style.cursor = 'pointer';
    indicator.style.position = 'relative';

    indicator.addEventListener('mouseenter', () => {
      if (this.statusDropdownTimer) clearTimeout(this.statusDropdownTimer);
      this.showStatusDropdown(indicator);
    });
    indicator.addEventListener('mouseleave', () => {
      this.statusDropdownTimer = setTimeout(() => this.hideStatusDropdown(), 200);
    });
  }

  private showStatusDropdown(anchor: HTMLElement): void {
    this.hideStatusDropdown();

    const sources = dataFreshness.getAllSources().filter(s => s.enabled);
    const dropdown = document.createElement('div');
    dropdown.className = 'status-dropdown';

    // Header
    const header = document.createElement('div');
    header.className = 'status-dropdown-header';
    header.textContent = 'DATA SOURCES';
    dropdown.appendChild(header);

    // Sort: errors first, then by name
    const sorted = [...sources].sort((a, b) => {
      const order = { error: 0, no_data: 1, very_stale: 2, stale: 3, fresh: 4, disabled: 5 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

    sorted.forEach(source => {
      const isWs = EventHandlerManager.WS_SOURCES.has(source.id);
      const row = document.createElement('div');
      row.className = 'status-dropdown-row';

      const dot = document.createElement('span');
      dot.className = `status-dropdown-dot status-dropdown-dot-${this.getSourceDotClass(source.status, isWs)}`;
      row.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'status-dropdown-name';
      name.textContent = source.name;
      row.appendChild(name);

      const badge = document.createElement('span');
      badge.className = `status-dropdown-badge status-dropdown-badge-${this.getSourceDotClass(source.status, isWs)}`;
      badge.textContent = this.getSourceLabel(source, isWs);
      row.appendChild(badge);

      dropdown.appendChild(row);
    });

    // Keep open when hovering the dropdown itself
    dropdown.addEventListener('mouseenter', () => {
      if (this.statusDropdownTimer) clearTimeout(this.statusDropdownTimer);
    });
    dropdown.addEventListener('mouseleave', () => {
      this.statusDropdownTimer = setTimeout(() => this.hideStatusDropdown(), 200);
    });

    anchor.appendChild(dropdown);
    this.statusDropdownEl = dropdown;
  }

  private hideStatusDropdown(): void {
    this.statusDropdownEl?.remove();
    this.statusDropdownEl = null;
  }

  private getSourceDotClass(status: string, isWs: boolean): string {
    if (isWs) return 'live';
    if (status === 'error' || status === 'no_data') return 'error';
    if (status === 'very_stale') return 'error';
    if (status === 'stale') return 'stale';
    if (status === 'fresh') return 'fresh';
    return 'stale';
  }

  private getSourceLabel(source: { status: string; lastUpdate: Date | null; lastError: string | null }, isWs: boolean): string {
    if (isWs) return 'LIVE';
    if (source.status === 'error') return 'ERROR';
    if (source.status === 'no_data' || !source.lastUpdate) return 'NO DATA';
    return this.timeAgo(source.lastUpdate);
  }

  private timeAgo(date: Date): string {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  private setupMapDimensionToggle(): void {
    const toggle = document.getElementById('mapDimensionToggle');
    if (!toggle) return;
    toggle.querySelectorAll<HTMLButtonElement>('.map-dim-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (!mode) return;
        const isGlobe = mode === 'globe';
        const alreadyGlobe = this.ctx.map?.isGlobeMode() ?? false;
        if (isGlobe === alreadyGlobe) return;
        toggle.querySelectorAll('.map-dim-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        saveToStorage(STORAGE_KEYS.mapMode, isGlobe ? 'globe' : 'flat');
        if (isGlobe) {
          this.ctx.map?.switchToGlobe();
        } else {
          this.ctx.map?.switchToFlat();
        }
      });
    });
  }

  private setupMapFullscreen(mapSection: HTMLElement): void {
    const btn = document.getElementById('mapFullscreenBtn');
    if (!btn) return;
    const expandSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
    const shrinkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>';
    let isFullscreen = false;

    const toggle = () => {
      isFullscreen = !isFullscreen;
      mapSection.classList.toggle('live-news-fullscreen', isFullscreen);
      document.body.classList.toggle('live-news-fullscreen-active', isFullscreen);
      btn.innerHTML = isFullscreen ? shrinkSvg : expandSvg;
      btn.title = isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
      // Notify map so globe (and deck.gl) can resize after CSS transition completes
      setTimeout(() => this.ctx.map?.setIsResizing(false), 320);
    };

    btn.addEventListener('click', toggle);
    this.boundMapFullscreenEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) toggle();
    };
    document.addEventListener('keydown', this.boundMapFullscreenEscHandler);
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
          this.callbacks.ensureCorrectZones();
        }
        return;
      }
      const panel = this.ctx.panels[key];
      panel?.toggle(config.enabled);
    });
  }
}
