import { escapeHtml } from '@/utils/sanitize';
import { SITE_VARIANT } from '@/config';
import type { MarketplaceCatalogItem, MarketplaceManifest, MarketplacePreviewAsset, MarketplaceVariant, MarketplaceViewItem } from '@/types/marketplace';
import { MarketplaceService } from '@/services/marketplace';

type MarketplaceTab = 'browse' | 'installed' | 'import' | 'submit';

interface MarketplaceModalFilters {
  search: string;
  category: string;
  surface: string;
  variant: string;
  installState: string;
}

interface MarketplaceModalHandlers {
  onOpenPanel?: (itemId: string) => void;
  requireInstallAccess?: () => boolean;
  requireSubmitAccess?: () => boolean;
}

const TAB_KEY = 'wm-marketplace-modal-tab-v1';
const FILTER_KEY = 'wm-marketplace-modal-filters-v1';

function defaultFilters(): MarketplaceModalFilters {
  return {
    search: '',
    category: 'all',
    surface: 'all',
    variant: 'all',
    installState: 'all',
  };
}

function computeSchemaSummary(manifest: MarketplaceManifest): string {
  return manifest.datasets
    .map((dataset) => {
      const fields = Object.keys(dataset.fieldMap ?? {}).slice(0, 6);
      const fieldText = fields.length > 0 ? ` • ${fields.join(', ')}` : '';
      return `${dataset.name} (${dataset.format.toUpperCase()})${fieldText}`;
    })
    .join(' • ');
}

function previewMarkup(previews: MarketplacePreviewAsset[] | undefined): string {
  if (!previews || previews.length === 0) return '';
  return `
    <div class="marketplace-modal-previews">
      ${previews.map((preview) => preview.type === 'image'
        ? `
          <div class="marketplace-modal-preview image">
            ${preview.url ? `<img src="${escapeHtml(preview.url)}" alt="${escapeHtml(preview.title)}" />` : ''}
            <div class="marketplace-modal-preview-copy">
              <strong>${escapeHtml(preview.title)}</strong>
              ${preview.body ? `<span>${escapeHtml(preview.body)}</span>` : ''}
            </div>
          </div>
        `
        : `
          <div class="marketplace-modal-preview card">
            <strong>${escapeHtml(preview.title)}</strong>
            ${preview.body ? `<span>${escapeHtml(preview.body)}</span>` : ''}
          </div>
        `).join('')}
    </div>
  `;
}

export class MarketplaceModal {
  private service: MarketplaceService;
  private handlers: MarketplaceModalHandlers = {};
  private overlay: HTMLElement | null = null;
  private activeTab: MarketplaceTab = localStorage.getItem(TAB_KEY) as MarketplaceTab || 'browse';
  private filters: MarketplaceModalFilters = (() => {
    try {
      return JSON.parse(localStorage.getItem(FILTER_KEY) || '') as MarketplaceModalFilters;
    } catch {
      return defaultFilters();
    }
  })();
  private selectedItemId: string | null = null;
  private detailCache = new Map<string, MarketplaceManifest>();
  private pendingDetailItemId: string | null = null;
  private statusMessage = '';
  private statusTone: 'info' | 'error' = 'info';
  private unsubscribe: (() => void) | null = null;

  constructor(service: MarketplaceService) {
    this.service = service;
    this.filters = { ...defaultFilters(), ...this.filters };
  }

  public setHandlers(handlers: MarketplaceModalHandlers): void {
    this.handlers = handlers;
  }

  public async open(): Promise<void> {
    if (this.overlay) {
      this.render();
      return;
    }
    this.overlay = document.createElement('div');
    this.overlay.className = 'marketplace-modal-overlay';
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target === this.overlay || target.closest('[data-marketplace-close]')) {
        this.close();
        return;
      }

      const tabButton = target.closest<HTMLElement>('[data-marketplace-tab]');
      if (tabButton) {
        this.activeTab = tabButton.dataset.marketplaceTab as MarketplaceTab;
        localStorage.setItem(TAB_KEY, this.activeTab);
        this.render();
        return;
      }

      const cardButton = target.closest<HTMLElement>('[data-marketplace-card]');
      if (cardButton) {
        const itemId = cardButton.dataset.marketplaceCard;
        if (itemId) {
          this.selectedItemId = itemId;
          void this.loadDetail(itemId);
          this.render();
        }
        return;
      }

      const installButton = target.closest<HTMLElement>('[data-marketplace-install]');
      if (installButton) {
        const itemId = installButton.dataset.marketplaceInstall;
        if (itemId) void this.installCatalogItem(itemId);
        return;
      }

      const updateButton = target.closest<HTMLElement>('[data-marketplace-update]');
      if (updateButton) {
        const itemId = updateButton.dataset.marketplaceUpdate;
        if (itemId) void this.updateInstalledItem(itemId);
        return;
      }

      const removeButton = target.closest<HTMLElement>('[data-marketplace-remove]');
      if (removeButton) {
        const itemId = removeButton.dataset.marketplaceRemove;
        if (itemId) void this.removeInstalledItem(itemId);
        return;
      }

      const enableButton = target.closest<HTMLElement>('[data-marketplace-enable]');
      if (enableButton) {
        const itemId = enableButton.dataset.marketplaceEnable;
        if (itemId) {
          const enabled = enableButton.dataset.enabled !== 'true';
          if (this.requireInstallAccess()) {
            this.service.setItemEnabled(itemId, enabled);
            this.render();
          }
        }
        return;
      }

      const mapButton = target.closest<HTMLElement>('[data-marketplace-map-enable]');
      if (mapButton) {
        const itemId = mapButton.dataset.marketplaceMapEnable;
        if (itemId) {
          const enabled = mapButton.dataset.enabled !== 'true';
          if (this.requireInstallAccess()) {
            this.service.setMapLayerEnabled(itemId, enabled);
            this.render();
          }
        }
        return;
      }

      const openPanelButton = target.closest<HTMLElement>('[data-marketplace-open-panel]');
      if (openPanelButton) {
        const itemId = openPanelButton.dataset.marketplaceOpenPanel;
        if (itemId) this.handlers.onOpenPanel?.(itemId);
        return;
      }

      const importUrlButton = target.closest<HTMLElement>('[data-marketplace-import-url]');
      if (importUrlButton) {
        void this.importFromUrl();
        return;
      }

      const submitButton = target.closest<HTMLElement>('[data-marketplace-submit]');
      if (submitButton) {
        void this.submitManifest();
        return;
      }
    });

    this.overlay.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | null;
      if (!target) return;
      if (target.matches('[data-marketplace-filter]')) {
        const key = target.dataset.marketplaceFilter as keyof MarketplaceModalFilters;
        this.filters[key] = target.value;
        localStorage.setItem(FILTER_KEY, JSON.stringify(this.filters));
        this.render();
        return;
      }

      if (target.matches('[data-marketplace-import-file]')) {
        const file = target instanceof HTMLInputElement ? target.files?.[0] : undefined;
        if (file) void this.importFromFile(file);
      }
    });

    this.overlay.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!target) return;
      if (target.matches('[data-marketplace-filter="search"]')) {
        this.filters.search = target.value;
        localStorage.setItem(FILTER_KEY, JSON.stringify(this.filters));
        this.render();
      }
    });

    this.unsubscribe?.();
    this.unsubscribe = this.service.subscribe(() => {
      if (!this.overlay) {
        this.unsubscribe?.();
        this.unsubscribe = null;
        return;
      }
      this.render();
    });

    await Promise.allSettled([
      this.service.refreshCatalog(),
      this.service.refreshInstalledData(),
    ]);
    if (!this.selectedItemId) {
      this.selectedItemId = this.service.getCatalogItems()[0]?.id ?? this.service.getViewItems(SITE_VARIANT as MarketplaceVariant)[0]?.manifest.id ?? null;
    }
    if (this.selectedItemId) void this.loadDetail(this.selectedItemId);
    this.render();
  }

  public close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.overlay?.remove();
    this.overlay = null;
  }

  private requireInstallAccess(): boolean {
    return this.handlers.requireInstallAccess ? this.handlers.requireInstallAccess() : true;
  }

  private requireSubmitAccess(): boolean {
    return this.handlers.requireSubmitAccess ? this.handlers.requireSubmitAccess() : true;
  }

  private async installCatalogItem(itemId: string): Promise<void> {
    if (!this.requireInstallAccess()) return;
    try {
      this.setStatus('Installing marketplace item…');
      await this.service.installCatalogItem(itemId);
      this.selectedItemId = itemId;
      await this.loadDetail(itemId);
      this.setStatus('Marketplace item installed.');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Install failed', 'error');
    } finally {
      this.render();
    }
  }

  private async updateInstalledItem(itemId: string): Promise<void> {
    if (!this.requireInstallAccess()) return;
    try {
      this.setStatus('Updating dataset…');
      await this.service.updateInstalledItem(itemId);
      await this.loadDetail(itemId);
      this.setStatus('Marketplace item updated.');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Update failed', 'error');
    } finally {
      this.render();
    }
  }

  private async removeInstalledItem(itemId: string): Promise<void> {
    if (!this.requireInstallAccess()) return;
    try {
      await this.service.removeInstalledItem(itemId);
      this.setStatus('Marketplace item removed.');
      if (this.selectedItemId === itemId) {
        this.selectedItemId = this.service.getCatalogItems()[0]?.id ?? null;
      }
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Remove failed', 'error');
    } finally {
      this.render();
    }
  }

  private async importFromFile(file: File): Promise<void> {
    if (!this.requireInstallAccess()) return;
    try {
      const text = await file.text();
      await this.service.importManifestText(text, 'import-file');
      this.setStatus(`Imported ${file.name}.`);
      this.activeTab = 'installed';
      localStorage.setItem(TAB_KEY, this.activeTab);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Import failed', 'error');
    } finally {
      this.render();
    }
  }

  private async importFromUrl(): Promise<void> {
    if (!this.requireInstallAccess()) return;
    const input = this.overlay?.querySelector<HTMLInputElement>('[data-marketplace-import-url-input]');
    const url = input?.value.trim() || '';
    if (!url) {
      this.setStatus('Enter a manifest URL to import.', 'error');
      this.render();
      return;
    }
    try {
      await this.service.importManifestFromUrl(url);
      this.setStatus('Imported manifest from URL.');
      this.activeTab = 'installed';
      localStorage.setItem(TAB_KEY, this.activeTab);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Import failed', 'error');
    } finally {
      this.render();
    }
  }

  private async submitManifest(): Promise<void> {
    if (!this.requireSubmitAccess()) return;
    const textarea = this.overlay?.querySelector<HTMLTextAreaElement>('[data-marketplace-submit-json]');
    const noteInput = this.overlay?.querySelector<HTMLInputElement>('[data-marketplace-submit-note]');
    const text = textarea?.value.trim() || '';
    if (!text) {
      this.setStatus('Paste a manifest JSON package before submitting.', 'error');
      this.render();
      return;
    }
    try {
      await this.service.submitManifestText(text, noteInput?.value.trim() || undefined);
      this.setStatus('Submission queued for review.');
      if (textarea) textarea.value = '';
      if (noteInput) noteInput.value = '';
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Submission failed', 'error');
    } finally {
      this.render();
    }
  }

  private async loadDetail(itemId: string): Promise<void> {
    const installed = this.service.getInstalledItem(itemId)?.manifest;
    if (installed) {
      this.detailCache.set(itemId, installed);
      return;
    }
    if (this.detailCache.has(itemId) || this.pendingDetailItemId === itemId) return;
    this.pendingDetailItemId = itemId;
    try {
      const manifest = await this.service.fetchItemDetail(itemId);
      this.detailCache.set(itemId, manifest);
    } catch (error) {
      console.warn('[marketplace] Failed to load item detail', itemId, error);
    } finally {
      if (this.pendingDetailItemId === itemId) this.pendingDetailItemId = null;
      this.render();
    }
  }

  private setStatus(message: string, tone: 'info' | 'error' = 'info'): void {
    this.statusMessage = message;
    this.statusTone = tone;
  }

  private filteredCatalogItems(installedItems: MarketplaceViewItem[]): MarketplaceCatalogItem[] {
    const installedIds = new Set(installedItems.map((item) => item.manifest.id));
    const installedWithUpdates = new Set(installedItems.filter((item) => item.hasUpdate).map((item) => item.manifest.id));
    const query = this.filters.search.trim().toLowerCase();
    return this.service.getCatalogItems().filter((item) => {
      if (this.filters.category !== 'all' && item.category !== this.filters.category) return false;
      if (this.filters.surface !== 'all' && !item.surfaces.includes(this.filters.surface as any)) return false;
      if (this.filters.variant !== 'all' && !item.compatibility.variants.includes(this.filters.variant as MarketplaceVariant)) return false;
      if (this.filters.installState === 'installed' && !installedIds.has(item.id)) return false;
      if (this.filters.installState === 'updates' && !installedWithUpdates.has(item.id)) return false;
      if (!query) return true;
      const haystack = [item.name, item.description, item.author, item.category, ...item.tags].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  private renderBrowse(installedItems: MarketplaceViewItem[]): string {
    const items = this.filteredCatalogItems(installedItems);
    const categories = [...new Set(this.service.getCatalogItems().map((item) => item.category))].sort();
    const currentDetail = this.selectedItemId ? this.detailCache.get(this.selectedItemId) ?? null : null;
    const selectedCatalog = items.find((item) => item.id === this.selectedItemId) ?? items[0] ?? null;
    const selectedInstalled = installedItems.find((item) => item.manifest.id === selectedCatalog?.id);
    const detailManifest = currentDetail && selectedCatalog?.id === this.selectedItemId ? currentDetail : null;

    return `
      <div class="marketplace-modal-filters">
        <input type="search" data-marketplace-filter="search" placeholder="Search datasets, tags, and authors" value="${escapeHtml(this.filters.search)}" />
        <select data-marketplace-filter="category">
          <option value="all"${this.filters.category === 'all' ? ' selected' : ''}>All categories</option>
          ${categories.map((category) => `<option value="${escapeHtml(category)}"${this.filters.category === category ? ' selected' : ''}>${escapeHtml(category)}</option>`).join('')}
        </select>
        <select data-marketplace-filter="surface">
          <option value="all"${this.filters.surface === 'all' ? ' selected' : ''}>All surfaces</option>
          <option value="map"${this.filters.surface === 'map' ? ' selected' : ''}>Map</option>
          <option value="search"${this.filters.surface === 'search' ? ' selected' : ''}>Search</option>
          <option value="panel"${this.filters.surface === 'panel' ? ' selected' : ''}>Panel</option>
        </select>
        <select data-marketplace-filter="variant">
          <option value="all"${this.filters.variant === 'all' ? ' selected' : ''}>All variants</option>
          ${['full', 'tech', 'finance', 'conflicts', 'commodity', 'happy']
            .map((variant) => `<option value="${variant}"${this.filters.variant === variant ? ' selected' : ''}>${variant}</option>`)
            .join('')}
        </select>
        <select data-marketplace-filter="installState">
          <option value="all"${this.filters.installState === 'all' ? ' selected' : ''}>All items</option>
          <option value="installed"${this.filters.installState === 'installed' ? ' selected' : ''}>Installed</option>
          <option value="updates"${this.filters.installState === 'updates' ? ' selected' : ''}>Updates</option>
        </select>
      </div>

      <div class="marketplace-modal-browse">
        <div class="marketplace-modal-card-list">
          ${items.map((item) => {
            const installed = installedItems.find((entry) => entry.manifest.id === item.id);
            const compatible = item.compatibility.variants.includes(SITE_VARIANT as MarketplaceVariant);
            return `
              <button class="marketplace-modal-card${item.id === selectedCatalog?.id ? ' active' : ''}" type="button" data-marketplace-card="${escapeHtml(item.id)}">
                <div class="marketplace-modal-card-head">
                  <strong>${escapeHtml(item.name)}</strong>
                  ${installed ? `<span class="marketplace-modal-pill">${installed.hasUpdate ? 'Update' : 'Installed'}</span>` : ''}
                </div>
                <p>${escapeHtml(item.description)}</p>
                <div class="marketplace-modal-card-meta">
                  <span>${escapeHtml(item.author)}</span>
                  <span>${escapeHtml(item.category)}</span>
                  ${compatible ? '' : '<span class="warn">Unavailable in this variant</span>'}
                </div>
                <div class="marketplace-modal-chip-row">${item.surfaces.map((surface) => `<span class="marketplace-modal-chip">${escapeHtml(surface)}</span>`).join('')}</div>
              </button>
            `;
          }).join('') || '<div class="marketplace-modal-empty">No marketplace items match these filters.</div>'}
        </div>

        <div class="marketplace-modal-detail">
          ${selectedCatalog ? `
            <div class="marketplace-modal-detail-shell">
              <div class="marketplace-modal-detail-head">
                <span class="marketplace-modal-kicker">${escapeHtml(selectedCatalog.category)}</span>
                <h3>${escapeHtml(detailManifest?.name || selectedCatalog.name)}</h3>
                <p>${escapeHtml(detailManifest?.description || selectedCatalog.description)}</p>
                <div class="marketplace-modal-chip-row">
                  ${(detailManifest?.tags || selectedCatalog.tags).map((tag) => `<span class="marketplace-modal-chip">${escapeHtml(tag)}</span>`).join('')}
                </div>
              </div>

              <div class="marketplace-modal-stats">
                <div><span>Author</span><strong>${escapeHtml(detailManifest?.author || selectedCatalog.author)}</strong></div>
                <div><span>Version</span><strong>${escapeHtml(detailManifest?.version || selectedCatalog.version)}</strong></div>
                <div><span>Variants</span><strong>${escapeHtml((detailManifest?.compatibility.variants || selectedCatalog.compatibility.variants).join(', '))}</strong></div>
                <div><span>Refresh</span><strong>${detailManifest ? escapeHtml(detailManifest.datasets.map((dataset) => dataset.pollingIntervalMs ? `${Math.round(dataset.pollingIntervalMs / 60000)}m` : 'manual').join(' • ')) : 'Loading…'}</strong></div>
              </div>

              ${detailManifest ? `
                <div class="marketplace-modal-schema">${escapeHtml(computeSchemaSummary(detailManifest))}</div>
                ${previewMarkup(detailManifest.assets?.previews)}
              ` : '<div class="marketplace-modal-schema">Loading detail…</div>'}

              <div class="marketplace-modal-actions">
                ${selectedInstalled
                  ? `
                    <button class="marketplace-modal-primary" type="button" data-marketplace-open-panel="${escapeHtml(selectedInstalled.manifest.id)}">Open panel</button>
                    <button class="marketplace-modal-secondary" type="button" data-marketplace-enable="${escapeHtml(selectedInstalled.manifest.id)}" data-enabled="${selectedInstalled.enabled ? 'true' : 'false'}">${selectedInstalled.enabled ? 'Disable item' : 'Enable item'}</button>
                    ${selectedInstalled.hasUpdate ? `<button class="marketplace-modal-secondary" type="button" data-marketplace-update="${escapeHtml(selectedInstalled.manifest.id)}">Update</button>` : ''}
                  `
                  : `
                    <button class="marketplace-modal-primary" type="button" data-marketplace-install="${escapeHtml(selectedCatalog.id)}"${selectedCatalog.compatibility.variants.includes(SITE_VARIANT as MarketplaceVariant) ? '' : ' disabled'}>Install</button>
                  `
                }
              </div>
            </div>
          ` : '<div class="marketplace-modal-empty">Select a marketplace item to inspect its detail.</div>'}
        </div>
      </div>
    `;
  }

  private renderInstalled(installedItems: MarketplaceViewItem[]): string {
    return `
      <div class="marketplace-modal-installed">
        ${installedItems.map((item) => `
          <div class="marketplace-modal-installed-card">
            <div class="marketplace-modal-installed-copy">
              <div class="marketplace-modal-installed-head">
                <strong>${escapeHtml(item.manifest.name)}</strong>
                <span class="marketplace-modal-pill">${item.hasUpdate ? 'Update available' : item.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <p>${escapeHtml(item.manifest.description)}</p>
              <div class="marketplace-modal-installed-meta">
                <span>${escapeHtml(item.manifest.version)}</span>
                <span>${escapeHtml(item.manifest.category)}</span>
                <span>${item.variantCompatible ? 'Active in this variant' : 'Unavailable in this variant'}</span>
              </div>
            </div>
            <div class="marketplace-modal-installed-actions">
              <button class="marketplace-modal-secondary" type="button" data-marketplace-open-panel="${escapeHtml(item.manifest.id)}">Open panel</button>
              <button class="marketplace-modal-secondary" type="button" data-marketplace-enable="${escapeHtml(item.manifest.id)}" data-enabled="${item.enabled ? 'true' : 'false'}">${item.enabled ? 'Disable item' : 'Enable item'}</button>
              ${item.manifest.surfaces.map ? `<button class="marketplace-modal-secondary" type="button" data-marketplace-map-enable="${escapeHtml(item.manifest.id)}" data-enabled="${item.mapEnabled ? 'true' : 'false'}">${item.mapEnabled ? 'Hide layer' : 'Show layer'}</button>` : ''}
              ${item.hasUpdate ? `<button class="marketplace-modal-primary" type="button" data-marketplace-update="${escapeHtml(item.manifest.id)}">Update</button>` : ''}
              <button class="marketplace-modal-danger" type="button" data-marketplace-remove="${escapeHtml(item.manifest.id)}">Remove</button>
            </div>
          </div>
        `).join('') || '<div class="marketplace-modal-empty">No installed marketplace items yet.</div>'}
      </div>
    `;
  }

  private renderImport(): string {
    return `
      <div class="marketplace-modal-forms">
        <section class="marketplace-modal-form-card">
          <div class="marketplace-modal-form-head">
            <strong>Import local manifest bundle</strong>
            <span>Install a private declarative marketplace item from a JSON bundle.</span>
          </div>
          <label class="marketplace-modal-upload">
            <span>Select manifest file</span>
            <input type="file" accept="application/json,.json" data-marketplace-import-file />
          </label>
        </section>

        <section class="marketplace-modal-form-card">
          <div class="marketplace-modal-form-head">
            <strong>Import from remote URL</strong>
            <span>Install a manifest hosted at a trusted HTTPS or local URL.</span>
          </div>
          <div class="marketplace-modal-inline-form">
            <input type="url" placeholder="https://example.com/manifest.json" data-marketplace-import-url-input />
            <button class="marketplace-modal-primary" type="button" data-marketplace-import-url="true">Install</button>
          </div>
        </section>
      </div>
    `;
  }

  private renderSubmit(): string {
    const submissions = this.service.getSubmissions();
    return `
      <div class="marketplace-modal-forms submit">
        <section class="marketplace-modal-form-card">
          <div class="marketplace-modal-form-head">
            <strong>Submit to review queue</strong>
            <span>Public items are queued for review before they can appear in the curated catalog.</span>
          </div>
          <input type="text" placeholder="Optional note for reviewers" data-marketplace-submit-note />
          <textarea rows="14" placeholder="Paste marketplace manifest JSON here" data-marketplace-submit-json></textarea>
          <button class="marketplace-modal-primary" type="button" data-marketplace-submit="true">Submit package</button>
        </section>

        <section class="marketplace-modal-form-card submissions">
          <div class="marketplace-modal-form-head">
            <strong>Submission status</strong>
            <span>Your queued public submissions.</span>
          </div>
          <div class="marketplace-modal-submissions">
            ${submissions.map((submission) => `
              <div class="marketplace-modal-submission">
                <strong>${escapeHtml(submission.name)}</strong>
                <span>${new Date(submission.submittedAt).toLocaleString()}</span>
                <span class="marketplace-modal-pill">${escapeHtml(submission.status)}</span>
              </div>
            `).join('') || '<div class="marketplace-modal-empty-inline">No submissions yet.</div>'}
          </div>
        </section>
      </div>
    `;
  }

  private render(): void {
    if (!this.overlay) return;
    const installedItems = this.service.getViewItems(SITE_VARIANT as MarketplaceVariant);
    const tabContent = this.activeTab === 'browse'
      ? this.renderBrowse(installedItems)
      : this.activeTab === 'installed'
        ? this.renderInstalled(installedItems)
        : this.activeTab === 'import'
          ? this.renderImport()
          : this.renderSubmit();

    this.overlay.innerHTML = `
      <div class="marketplace-modal">
        <div class="marketplace-modal-header">
          <div class="marketplace-modal-heading">
            <span class="marketplace-modal-kicker">Data Marketplace</span>
            <h2>Curated live data, private imports, and reusable map/search/panel views.</h2>
          </div>
          <button class="marketplace-modal-close" type="button" data-marketplace-close="true">×</button>
        </div>

        <div class="marketplace-modal-tabs">
          ${(['browse', 'installed', 'import', 'submit'] as MarketplaceTab[]).map((tab) => `
            <button class="marketplace-modal-tab${this.activeTab === tab ? ' active' : ''}" type="button" data-marketplace-tab="${tab}">
              ${tab}
            </button>
          `).join('')}
        </div>

        ${this.statusMessage ? `<div class="marketplace-modal-status ${this.statusTone}">${escapeHtml(this.statusMessage)}</div>` : ''}

        <div class="marketplace-modal-body">
          ${tabContent}
        </div>
      </div>
    `;
  }
}
