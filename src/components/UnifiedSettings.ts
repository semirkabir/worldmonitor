import { FEEDS, INTEL_SOURCES, SOURCE_REGION_MAP } from '@/config/feeds';
import { PANEL_CATEGORY_MAP } from '@/config/panels';
import { SITE_VARIANT } from '@/config/variant';
import { t } from '@/services/i18n';
import { escapeHtml } from '@/utils/sanitize';
import type { PanelConfig } from '@/types';
import { FEATURES } from '@/services/feature-flags';
import { subscribeToAuth } from '@/services/user-auth';
import { loginWithGoogle, logoutUser } from '@/services/firebase-auth';
import { User } from 'firebase/auth';
import { renderPreferences } from '@/services/preferences-content';

const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

export interface UnifiedSettingsConfig {
  getPanelSettings: () => Record<string, PanelConfig>;
  togglePanel: (key: string) => void;
  getDisabledSources: () => Set<string>;
  toggleSource: (name: string) => void;
  setSourcesEnabled: (names: string[], enabled: boolean) => void;
  getAllSourceNames: () => string[];
  getLocalizedPanelName: (key: string, fallback: string) => string;
  resetLayout: () => void;
  saveLayout: () => void;
  isDesktopApp: boolean;
}

type TabId = 'settings' | 'panels' | 'sources' | 'profile';

export class UnifiedSettings {
  private overlay: HTMLElement;
  private config: UnifiedSettingsConfig;
  private activeTab: TabId = 'settings';
  private activeSourceRegion = 'all';
  private sourceFilter = '';
  private activePanelCategory = 'all';
  private panelFilter = '';
  private escapeHandler: (e: KeyboardEvent) => void;
  private prefsCleanup: (() => void) | null = null;
  private authUnsubscribe: (() => void) | null = null;
  private currentUser: User | null = null;
  private authLoading = true;

  constructor(config: UnifiedSettingsConfig) {
    this.config = config;

    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'unifiedSettingsModal';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', t('header.settings'));

    this.escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.close();
    };

    this.overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (target === this.overlay) {
        this.close();
        return;
      }

      if (target.closest('.unified-settings-close')) {
        this.close();
        return;
      }

      const tab = target.closest<HTMLElement>('.unified-settings-tab');
      if (tab?.dataset.tab) {
        this.switchTab(tab.dataset.tab as TabId);
        return;
      }

      const panelCatPill = target.closest<HTMLElement>('[data-panel-cat]');
      if (panelCatPill?.dataset.panelCat) {
        this.activePanelCategory = panelCatPill.dataset.panelCat;
        this.panelFilter = '';
        const searchInput = this.overlay.querySelector<HTMLInputElement>('.panels-search input');
        if (searchInput) searchInput.value = '';
        this.renderPanelCategoryPills();
        this.renderPanelsTab();
        return;
      }

      if (target.closest('.panels-save-layout')) {
        this.config.saveLayout();
        return;
      }

      if (target.closest('.panels-reset-layout')) {
        this.config.resetLayout();
        return;
      }

      const panelItem = target.closest<HTMLElement>('.panel-toggle-item');
      if (panelItem?.dataset.panel) {
        this.config.togglePanel(panelItem.dataset.panel);
        this.renderPanelsTab();
        return;
      }

      const sourceItem = target.closest<HTMLElement>('.source-toggle-item');
      if (sourceItem?.dataset.source) {
        this.config.toggleSource(sourceItem.dataset.source);
        this.renderSourcesGrid();
        this.updateSourcesCounter();
        return;
      }

      const pill = target.closest<HTMLElement>('.unified-settings-region-pill');
      if (pill?.dataset.region) {
        this.activeSourceRegion = pill.dataset.region;
        this.sourceFilter = '';
        const searchInput = this.overlay.querySelector<HTMLInputElement>('.sources-search input');
        if (searchInput) searchInput.value = '';
        this.renderRegionPills();
        this.renderSourcesGrid();
        this.updateSourcesCounter();
        return;
      }

      if (target.closest('.sources-select-all')) {
        const visible = this.getVisibleSourceNames();
        this.config.setSourcesEnabled(visible, true);
        this.renderSourcesGrid();
        this.updateSourcesCounter();
        return;
      }

      if (target.closest('.sources-select-none')) {
        const visible = this.getVisibleSourceNames();
        this.config.setSourcesEnabled(visible, false);
        this.renderSourcesGrid();
        this.updateSourcesCounter();
        return;
      }
    });

    this.overlay.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.closest('.panels-search')) {
        this.panelFilter = target.value;
        this.renderPanelsTab();
      } else if (target.closest('.sources-search')) {
        this.sourceFilter = target.value;
        this.renderSourcesGrid();
        this.updateSourcesCounter();
      }
    });

    this.render();
    document.body.appendChild(this.overlay);

    console.log('[Settings] Subscribing to auth state');
    this.authUnsubscribe = subscribeToAuth((state) => {
      console.log('[Settings] Auth state received:', { user: state.user?.email, loading: state.loading, configured: state.isConfigured });
      this.currentUser = state.user as User | null;
      this.authLoading = state.loading;
      if (this.activeTab === 'profile') {
        console.log('[Settings] Rendering profile tab');
        this.render();
      }
    });
  }

  public open(tab?: TabId): void {
    if (tab) this.activeTab = tab;
    this.render();
    this.overlay.classList.add('active');
    localStorage.setItem('wm-settings-open', '1');
    document.addEventListener('keydown', this.escapeHandler);
    
    // Ensure profile tab renders if it's the profile tab
    if (this.activeTab === 'profile') {
      this.renderProfileTab();
    }
  }

  public close(): void {
    this.overlay.classList.remove('active');
    localStorage.removeItem('wm-settings-open');
    document.removeEventListener('keydown', this.escapeHandler);
  }

  public refreshPanelToggles(): void {
    if (this.activeTab === 'panels') this.renderPanelsTab();
  }

  public getButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'unified-settings-btn';
    btn.id = 'unifiedSettingsBtn';
    btn.setAttribute('aria-label', t('header.settings'));
    btn.innerHTML = GEAR_SVG;
    btn.addEventListener('click', () => this.open());
    return btn;
  }

  public destroy(): void {
    this.prefsCleanup?.();
    this.prefsCleanup = null;
    this.authUnsubscribe?.();
    this.authUnsubscribe = null;
    document.removeEventListener('keydown', this.escapeHandler);
    this.overlay.remove();
  }

  private render(): void {
    this.prefsCleanup?.();
    this.prefsCleanup = null;

    const tabClass = (id: TabId) => `unified-settings-tab${this.activeTab === id ? ' active' : ''}`;
    const prefs = renderPreferences({
      isDesktopApp: this.config.isDesktopApp,
    });

    this.overlay.innerHTML = `
      <div class="modal unified-settings-modal">
        <div class="modal-header">
          <span class="modal-title">${t('header.settings')}</span>
          <button class="modal-close unified-settings-close" aria-label="Close">\u00d7</button>
        </div>
        <div class="unified-settings-tabs" role="tablist" aria-label="Settings">
          <button class="${tabClass('settings')}" data-tab="settings" role="tab" aria-selected="${this.activeTab === 'settings'}" id="us-tab-settings" aria-controls="us-tab-panel-settings">${t('header.tabSettings')}</button>
          <button class="${tabClass('panels')}" data-tab="panels" role="tab" aria-selected="${this.activeTab === 'panels'}" id="us-tab-panels" aria-controls="us-tab-panel-panels">${t('header.tabPanels')}</button>
          <button class="${tabClass('sources')}" data-tab="sources" role="tab" aria-selected="${this.activeTab === 'sources'}" id="us-tab-sources" aria-controls="us-tab-panel-sources">${t('header.tabSources')}</button>
          <button class="${tabClass('profile')}" data-tab="profile" role="tab" aria-selected="${this.activeTab === 'profile'}" id="us-tab-profile" aria-controls="us-tab-panel-profile">Profile</button>
        </div>
        <div class="unified-settings-tab-panel${this.activeTab === 'settings' ? ' active' : ''}" data-panel-id="settings" id="us-tab-panel-settings" role="tabpanel" aria-labelledby="us-tab-settings">
          ${prefs.html}
        </div>
        <div class="unified-settings-tab-panel${this.activeTab === 'panels' ? ' active' : ''}" data-panel-id="panels" id="us-tab-panel-panels" role="tabpanel" aria-labelledby="us-tab-panels">
          <div class="unified-settings-region-wrapper">
            <div class="unified-settings-region-bar" id="usPanelCatBar"></div>
          </div>
          <div class="panels-search">
            <input type="text" placeholder="${t('header.filterPanels')}" value="${escapeHtml(this.panelFilter)}" />
          </div>
          <div class="panel-toggle-grid" id="usPanelToggles"></div>
          <div class="panels-footer">
            <div class="panels-layout-dropdown">
              <button class="panels-layout-trigger">${t('header.saveResetLayout')}</button>
              <div class="panels-layout-menu">
                <button class="panels-save-layout">${t('header.saveLayout')}</button>
                <button class="panels-reset-layout">${t('header.resetLayout')}</button>
              </div>
            </div>
          </div>
        </div>
        <div class="unified-settings-tab-panel${this.activeTab === 'sources' ? ' active' : ''}" data-panel-id="sources" id="us-tab-panel-sources" role="tabpanel" aria-labelledby="us-tab-sources">
          <div class="unified-settings-region-wrapper">
            <div class="unified-settings-region-bar" id="usRegionBar"></div>
          </div>
          <div class="sources-search">
            <input type="text" placeholder="${t('header.filterSources')}" value="${escapeHtml(this.sourceFilter)}" />
          </div>
          <div class="sources-toggle-grid" id="usSourceToggles"></div>
          <div class="sources-footer">
            <span class="sources-counter" id="usSourcesCounter"></span>
            <button class="sources-select-all">${t('common.selectAll')}</button>
            <button class="sources-select-none">${t('common.selectNone')}</button>
          </div>
        </div>
        <div class="unified-settings-tab-panel${this.activeTab === 'profile' ? ' active' : ''}" data-panel-id="profile" id="us-tab-panel-profile" role="tabpanel" aria-labelledby="us-tab-profile">
          <div class="profile-tab" id="usProfileTab"></div>
        </div>
      </div>
    `;

    const settingsPanel = this.overlay.querySelector('#us-tab-panel-settings');
    if (settingsPanel) {
      this.prefsCleanup = prefs.attach(settingsPanel as HTMLElement);
    }

    this.renderPanelCategoryPills();
    this.renderPanelsTab();
    this.renderRegionPills();
    this.renderSourcesGrid();
    this.updateSourcesCounter();
    if (this.activeTab === 'profile') {
      this.renderProfileTab();
    }
  }

  private switchTab(tab: TabId): void {
    this.activeTab = tab;

    this.overlay.querySelectorAll('.unified-settings-tab').forEach(el => {
      const isActive = (el as HTMLElement).dataset.tab === tab;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-selected', String(isActive));
    });

    this.overlay.querySelectorAll('.unified-settings-tab-panel').forEach(el => {
      el.classList.toggle('active', (el as HTMLElement).dataset.panelId === tab);
    });

    if (tab === 'profile') {
      this.renderProfileTab();
    }
  }

  private getAvailablePanelCategories(): Array<{ key: string; label: string }> {
    const panelKeys = new Set(Object.keys(this.config.getPanelSettings()));
    const variant = SITE_VARIANT || 'full';
    const categories: Array<{ key: string; label: string }> = [
      { key: 'all', label: t('header.sourceRegionAll') }
    ];

    for (const [catKey, catDef] of Object.entries(PANEL_CATEGORY_MAP)) {
      if (catDef.variants && !catDef.variants.includes(variant)) continue;
      const hasPanel = catDef.panelKeys.some(pk => panelKeys.has(pk));
      if (hasPanel) {
        categories.push({ key: catKey, label: t(catDef.labelKey) });
      }
    }

    return categories;
  }

  private getVisiblePanelEntries(): Array<[string, PanelConfig]> {
    const panelSettings = this.config.getPanelSettings();
    const variant = SITE_VARIANT || 'full';
    let entries = Object.entries(panelSettings)
      .filter(([key]) => key !== 'runtime-config' || this.config.isDesktopApp);

    if (this.activePanelCategory !== 'all') {
      const catDef = PANEL_CATEGORY_MAP[this.activePanelCategory];
      if (catDef && (!catDef.variants || catDef.variants.includes(variant))) {
        const allowed = new Set(catDef.panelKeys);
        entries = entries.filter(([key]) => allowed.has(key));
      }
    }

    if (this.panelFilter) {
      const lower = this.panelFilter.toLowerCase();
      entries = entries.filter(([key, panel]) =>
        key.toLowerCase().includes(lower) ||
        panel.name.toLowerCase().includes(lower) ||
        this.config.getLocalizedPanelName(key, panel.name).toLowerCase().includes(lower)
      );
    }

    return entries;
  }

  private renderPanelCategoryPills(): void {
    const bar = this.overlay.querySelector('#usPanelCatBar');
    if (!bar) return;

    const categories = this.getAvailablePanelCategories();
    bar.innerHTML = categories.map(c =>
      `<button class="unified-settings-region-pill${this.activePanelCategory === c.key ? ' active' : ''}" data-panel-cat="${c.key}">${escapeHtml(c.label)}</button>`
    ).join('');
  }

  private renderPanelsTab(): void {
    const container = this.overlay.querySelector('#usPanelToggles');
    if (!container) return;

    const entries = this.getVisiblePanelEntries();
    container.innerHTML = entries.map(([key, panel]) => `
      <div class="panel-toggle-item ${panel.enabled ? 'active' : ''}" data-panel="${escapeHtml(key)}">
        <div class="panel-toggle-checkbox">${panel.enabled ? '\u2713' : ''}</div>
        <span class="panel-toggle-label">${escapeHtml(this.config.getLocalizedPanelName(key, panel.name))}</span>
      </div>
    `).join('');
  }

  private getAvailableRegions(): Array<{ key: string; label: string }> {
    const feedKeys = new Set(Object.keys(FEEDS));
    const regions: Array<{ key: string; label: string }> = [
      { key: 'all', label: t('header.sourceRegionAll') }
    ];

    for (const [regionKey, regionDef] of Object.entries(SOURCE_REGION_MAP)) {
      if (regionKey === 'intel') {
        if (INTEL_SOURCES.length > 0) {
          regions.push({ key: regionKey, label: t(regionDef.labelKey) });
        }
        continue;
      }
      const hasFeeds = regionDef.feedKeys.some(fk => feedKeys.has(fk));
      if (hasFeeds) {
        regions.push({ key: regionKey, label: t(regionDef.labelKey) });
      }
    }

    return regions;
  }

  private getSourcesByRegion(): Map<string, string[]> {
    const map = new Map<string, string[]>();
    const feedKeys = new Set(Object.keys(FEEDS));

    for (const [regionKey, regionDef] of Object.entries(SOURCE_REGION_MAP)) {
      const sources: string[] = [];
      if (regionKey === 'intel') {
        INTEL_SOURCES.forEach(f => sources.push(f.name));
      } else {
        for (const fk of regionDef.feedKeys) {
          if (feedKeys.has(fk)) {
            FEEDS[fk]!.forEach(f => sources.push(f.name));
          }
        }
      }
      if (sources.length > 0) {
        map.set(regionKey, sources.sort((a, b) => a.localeCompare(b)));
      }
    }

    return map;
  }

  private getVisibleSourceNames(): string[] {
    let sources: string[];
    if (this.activeSourceRegion === 'all') {
      sources = this.config.getAllSourceNames();
    } else {
      const byRegion = this.getSourcesByRegion();
      sources = byRegion.get(this.activeSourceRegion) || [];
    }

    if (this.sourceFilter) {
      const lower = this.sourceFilter.toLowerCase();
      sources = sources.filter(s => s.toLowerCase().includes(lower));
    }

    return sources;
  }

  private renderRegionPills(): void {
    const bar = this.overlay.querySelector('#usRegionBar');
    if (!bar) return;

    const regions = this.getAvailableRegions();
    bar.innerHTML = regions.map(r =>
      `<button class="unified-settings-region-pill${this.activeSourceRegion === r.key ? ' active' : ''}" data-region="${r.key}">${escapeHtml(r.label)}</button>`
    ).join('');
  }

  private renderSourcesGrid(): void {
    const container = this.overlay.querySelector('#usSourceToggles');
    if (!container) return;

    const sources = this.getVisibleSourceNames();
    const disabled = this.config.getDisabledSources();

    container.innerHTML = sources.map(source => {
      const isEnabled = !disabled.has(source);
      const escaped = escapeHtml(source);
      return `
        <div class="source-toggle-item ${isEnabled ? 'active' : ''}" data-source="${escaped}">
          <div class="source-toggle-checkbox">${isEnabled ? '\u2713' : ''}</div>
          <span class="source-toggle-label">${escaped}</span>
        </div>
      `;
    }).join('');
  }

  private updateSourcesCounter(): void {
    const counter = this.overlay.querySelector('#usSourcesCounter');
    if (!counter) return;

    const disabled = this.config.getDisabledSources();
    const allSources = this.config.getAllSourceNames();
    const enabledTotal = allSources.length - disabled.size;

    counter.textContent = t('header.sourcesEnabled', { enabled: String(enabledTotal), total: String(allSources.length) });
  }

  private async handleLogin(): Promise<void> {
    const user = await loginWithGoogle();
    if (user) {
      this.renderProfileTab();
    }
  }

  private async handleLogout(): Promise<void> {
    await logoutUser();
    this.renderProfileTab();
  }

  private renderProfileTab(): void {
    const container = this.overlay.querySelector('#usProfileTab');
    console.log('[Settings] Profile container:', container);
    if (!container) {
      console.log('[Settings] Container not found, checking DOM...');
      console.log('[Settings] All elements with usProfileTab:', this.overlay.querySelectorAll('[id*="Profile"]'));
      return;
    }

    const user = this.currentUser;

    // If still loading after timeout, show guest view
    if (this.authLoading) {
      container.innerHTML = `
        <div class="profile-guest">
          <div class="profile-icon">👤</div>
          <h3>Sign in to access more features</h3>
          <p>Login to unlock AI summaries, historical playback, and more.</p>
          <button class="profile-login-btn" id="profileLoginBtn">Sign in with Google</button>
        </div>
        <div class="profile-features">
          <h4>Free Features</h4>
          <ul>
            ${FEATURES.filter(f => f.tier === 'free').map(f => `<li>✓ ${f.name}</li>`).join('')}
          </ul>
          <h4>Login Required</h4>
          <ul>
            ${FEATURES.filter(f => f.tier === 'logged_in').map(f => `<li>🔒 ${f.name}</li>`).join('')}
          </ul>
        </div>
      `;
      container.querySelector('#profileLoginBtn')?.addEventListener('click', () => this.handleLogin());
      return;
    }

    if (!user) {
      container.innerHTML = `
        <div class="profile-guest">
          <div class="profile-icon">👤</div>
          <h3>Sign in to access more features</h3>
          <p>Login to unlock AI summaries, historical playback, and more.</p>
          <button class="profile-login-btn" id="profileLoginBtn">Sign in with Google</button>
        </div>
        <div class="profile-features">
          <h4>Free Features</h4>
          <ul>
            ${FEATURES.filter(f => f.tier === 'free').map(f => `<li>✓ ${f.name}</li>`).join('')}
          </ul>
          <h4>Login Required</h4>
          <ul>
            ${FEATURES.filter(f => f.tier === 'logged_in').map(f => `<li>🔒 ${f.name}</li>`).join('')}
          </ul>
        </div>
      `;
      container.querySelector('#profileLoginBtn')?.addEventListener('click', () => this.handleLogin());
      return;
    }

    container.innerHTML = `
      <div class="profile-logged-in">
        <img src="${user.photoURL || ''}" alt="${user.displayName}" class="profile-avatar" />
        <div class="profile-info">
          <h3>${user.displayName || 'User'}</h3>
          <p>${user.email || ''}</p>
        </div>
        <button class="profile-logout-btn" id="profileLogoutBtn">Sign Out</button>
      </div>
      
      <div class="profile-section">
        <h4>Your Features</h4>
        <ul class="profile-feature-list">
          ${FEATURES.filter(f => f.tier !== 'premium').map(f => `<li>✓ ${f.name}</li>`).join('')}
        </ul>
      </div>
      
      <div class="profile-section">
        <h4>Account Preferences</h4>
        <div class="profile-preference">
          <label class="profile-toggle-label">
            <input type="checkbox" id="prefEmailAlerts" checked />
            <span>Email Alerts</span>
          </label>
          <p class="profile-preference-desc">Receive breaking news via email</p>
        </div>
        <div class="profile-preference">
          <label class="profile-toggle-label">
            <input type="checkbox" id="prefDarkMode" checked />
            <span>Dark Mode</span>
          </label>
          <p class="profile-preference-desc">Use dark theme (follows system)</p>
        </div>
      </div>
      
      <div class="profile-section">
        <h4>Linked Accounts</h4>
        <p class="profile-section-desc">Connect your other accounts for easier login</p>
        <div class="profile-linked-accounts">
          <div class="profile-linked-account">
            <span class="profile-linked-icon">🔗</span>
            <div class="profile-linked-info">
              <span class="profile-linked-name">Google</span>
              <span class="profile-linked-status connected">Connected</span>
            </div>
            <span class="profile-linked-check">✓</span>
          </div>
        </div>
        <button class="profile-add-account-btn" id="profileLinkAccountBtn">+ Link Another Account</button>
      </div>
      
      <div class="profile-section">
        <h4>Two-Factor Authentication</h4>
        <p class="profile-section-desc">Add extra security to your account</p>
        <div class="profile-2fa">
          <div class="profile-2fa-status">
            <span class="profile-2fa-icon">🔐</span>
            <div class="profile-2fa-info">
              <span class="profile-2fa-label">Authenticator App</span>
              <span class="profile-2fa-desc">Use an app like Google Authenticator</span>
            </div>
          </div>
          <button class="profile-2fa-btn" id="profileEnable2FABtn">Enable 2FA</button>
        </div>
        <div class="profile-2fa">
          <div class="profile-2fa-status">
            <span class="profile-2fa-icon">📱</span>
            <div class="profile-2fa-info">
              <span class="profile-2fa-label">SMS Verification</span>
              <span class="profile-2fa-desc">Receive codes via text message</span>
            </div>
          </div>
          <button class="profile-2fa-btn" id="profileEnableSMSBtn">Enable</button>
        </div>
      </div>
      
      <div class="profile-section">
        <h4>Data Management</h4>
        <div class="profile-actions">
          <button class="profile-action-btn" id="profileExportBtn">Export My Data</button>
          <button class="profile-action-btn danger" id="profileDeleteBtn">Delete Account</button>
        </div>
      </div>
      
      <div class="profile-section">
        <h4>Account Info</h4>
        <div class="profile-info-row">
          <span class="profile-info-label">User ID:</span>
          <span class="profile-info-value">${user.uid.slice(0, 12)}...</span>
        </div>
        <div class="profile-info-row">
          <span class="profile-info-label">Joined:</span>
          <span class="profile-info-value">${user.metadata?.creationTime || 'Recently'}</span>
        </div>
        <div class="profile-info-row">
          <span class="profile-info-label">Last Login:</span>
          <span class="profile-info-value">${user.metadata?.lastSignInTime || 'Recently'}</span>
        </div>
      </div>
    `;
    container.querySelector('#profileLogoutBtn')?.addEventListener('click', () => this.handleLogout());
    container.querySelector('#profileExportBtn')?.addEventListener('click', () => this.handleExportData());
    container.querySelector('#profileDeleteBtn')?.addEventListener('click', () => this.handleDeleteAccount());
  }

  private async handleExportData(): Promise<void> {
    alert('Export feature coming soon! This will download your preferences and settings.');
  }

  private async handleDeleteAccount(): Promise<void> {
    const confirmed = confirm('Are you sure you want to delete your account? This action cannot be undone.');
    if (confirmed) {
      alert('Account deletion coming soon! Contact support for now.');
    }
  }
}
