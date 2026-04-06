import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import type { MarketplaceNormalizedRecord, MarketplacePanelSurfaceConfig, MarketplaceViewItem } from '@/types/marketplace';

interface MarketplacePanelState {
  items: MarketplaceViewItem[];
  activeItem: MarketplaceViewItem | null;
  panelSurface: MarketplacePanelSurfaceConfig | null;
  records: MarketplaceNormalizedRecord[];
  selectedRecord: MarketplaceNormalizedRecord | null;
}

interface MarketplacePanelHandlers {
  onOpenMarketplace?: () => void;
  onSelectItem?: (itemId: string) => void;
  onSelectRecord?: (itemId: string, datasetId: string, recordId: string) => void;
  onFocusRecord?: (itemId: string, datasetId: string, recordId: string) => void;
}

function renderMetricValue(record: MarketplaceNormalizedRecord | null, field: string): string {
  if (!record) return '—';
  const raw = record.raw[field];
  if (raw == null || raw === '') return '—';
  if (Array.isArray(raw)) return escapeHtml(raw.map((entry) => String(entry)).join(', '));
  return escapeHtml(String(raw));
}

function renderSurfaceChips(item: MarketplaceViewItem): string {
  const chips = [
    item.manifest.surfaces.map ? 'Map' : '',
    item.manifest.surfaces.search ? 'Search' : '',
    item.manifest.surfaces.panel ? item.manifest.surfaces.panel.template.replace('-', ' ') : '',
  ].filter(Boolean);
  return chips.map((label) => `<span class="marketplace-panel-chip">${escapeHtml(label)}</span>`).join('');
}

function renderRecordMeta(record: MarketplaceNormalizedRecord | null): string {
  if (!record) return '';
  const parts = [
    record.locationLabel,
    ...(record.tags ?? []).slice(0, 4),
  ].filter(Boolean);
  if (parts.length === 0) return '';
  return `<div class="marketplace-panel-meta">${parts.map((entry) => `<span>${escapeHtml(String(entry))}</span>`).join('')}</div>`;
}

export class MarketplacePanel extends Panel {
  private handlers: MarketplacePanelHandlers = {};

  constructor() {
    super({
      id: 'marketplace',
      title: 'Marketplace Data',
      className: 'marketplace-data-panel',
      showCount: true,
    });

    this.content.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const openBtn = target.closest<HTMLElement>('[data-marketplace-open]');
      if (openBtn) {
        this.handlers.onOpenMarketplace?.();
        return;
      }

      const itemBtn = target.closest<HTMLElement>('[data-marketplace-item]');
      if (itemBtn) {
        const itemId = itemBtn.dataset.marketplaceItem;
        if (itemId) this.handlers.onSelectItem?.(itemId);
        return;
      }

      const recordBtn = target.closest<HTMLElement>('[data-marketplace-record]');
      if (recordBtn) {
        const itemId = recordBtn.dataset.itemId;
        const datasetId = recordBtn.dataset.datasetId;
        const recordId = recordBtn.dataset.marketplaceRecord;
        if (itemId && datasetId && recordId) {
          this.handlers.onSelectRecord?.(itemId, datasetId, recordId);
        }
        return;
      }

      const focusBtn = target.closest<HTMLElement>('[data-marketplace-focus]');
      if (focusBtn) {
        const itemId = focusBtn.dataset.itemId;
        const datasetId = focusBtn.dataset.datasetId;
        const recordId = focusBtn.dataset.recordId;
        if (itemId && datasetId && recordId) {
          this.handlers.onFocusRecord?.(itemId, datasetId, recordId);
        }
      }
    });
  }

  public setHandlers(handlers: MarketplacePanelHandlers): void {
    this.handlers = handlers;
  }

  public renderMarketplace(state: MarketplacePanelState): void {
    this.setCount(state.items.length);

    if (state.items.length === 0) {
      this.setContent(`
        <div class="marketplace-panel-empty">
          <div class="marketplace-panel-empty-title">No marketplace datasets installed</div>
          <div class="marketplace-panel-empty-copy">Install curated datasets or import a private manifest bundle to light up map layers, search, and a panel view.</div>
          <button class="marketplace-panel-primary" type="button" data-marketplace-open="true">Open Marketplace</button>
        </div>
      `);
      return;
    }

    const activeItem = state.activeItem;
    const panelSurface = state.panelSurface;
    const datasetId = panelSurface?.datasetId || activeItem?.manifest.datasets[0]?.id || '';
    const selectedRecord = state.selectedRecord;

    const itemRail = state.items.map((item) => `
      <button
        class="marketplace-panel-item${item.manifest.id === activeItem?.manifest.id ? ' active' : ''}"
        type="button"
        data-marketplace-item="${escapeHtml(item.manifest.id)}">
        <span class="marketplace-panel-item-name">${escapeHtml(item.manifest.name)}</span>
        <span class="marketplace-panel-item-meta">${escapeHtml(item.manifest.category)} • ${escapeHtml(item.manifest.version)}</span>
      </button>
    `).join('');

    const metrics = panelSurface?.metrics?.map((metric) => `
      <div class="marketplace-panel-metric">
        <span class="marketplace-panel-metric-label">${escapeHtml(metric.label)}</span>
        <strong class="marketplace-panel-metric-value">${renderMetricValue(selectedRecord, metric.field)}</strong>
      </div>
    `).join('') ?? '';

    const detailCard = activeItem && selectedRecord ? `
      <section class="marketplace-panel-hero">
        <div class="marketplace-panel-hero-copy">
          <span class="marketplace-panel-kicker">${escapeHtml(activeItem.manifest.category)}</span>
          <h3>${escapeHtml(selectedRecord.title || activeItem.manifest.name)}</h3>
          ${selectedRecord.subtitle ? `<p class="marketplace-panel-subtitle">${escapeHtml(selectedRecord.subtitle)}</p>` : ''}
          ${selectedRecord.description ? `<p class="marketplace-panel-description">${escapeHtml(selectedRecord.description)}</p>` : ''}
          ${renderRecordMeta(selectedRecord)}
        </div>
        <div class="marketplace-panel-hero-side">
          <div class="marketplace-panel-surface-row">${renderSurfaceChips(activeItem)}</div>
          <button
            class="marketplace-panel-secondary"
            type="button"
            data-marketplace-focus="true"
            data-item-id="${escapeHtml(activeItem.manifest.id)}"
            data-dataset-id="${escapeHtml(datasetId)}"
            data-record-id="${escapeHtml(selectedRecord.id)}">
            Focus on map
          </button>
        </div>
      </section>
    ` : '';

    const recordCards = state.records.map((record) => `
      <button
        class="marketplace-panel-record${record.id === selectedRecord?.id ? ' active' : ''}"
        type="button"
        data-marketplace-record="${escapeHtml(record.id)}"
        data-item-id="${escapeHtml(activeItem?.manifest.id || '')}"
        data-dataset-id="${escapeHtml(datasetId)}">
        <span class="marketplace-panel-record-title">${escapeHtml(record.title || record.id)}</span>
        ${record.subtitle ? `<span class="marketplace-panel-record-subtitle">${escapeHtml(record.subtitle)}</span>` : ''}
        ${record.locationLabel ? `<span class="marketplace-panel-record-location">${escapeHtml(record.locationLabel)}</span>` : ''}
      </button>
    `).join('');

    const listLabel = panelSurface?.template === 'quote-board'
      ? 'Tracked quotes'
      : panelSurface?.template === 'record-list'
        ? 'Live records'
        : 'Available records';

    const html = `
      <div class="marketplace-panel-shell">
        <div class="marketplace-panel-toolbar">
          <div class="marketplace-panel-toolbar-copy">
            <span class="marketplace-panel-toolbar-title">Installed views</span>
            <span class="marketplace-panel-toolbar-subtitle">${state.items.length} active marketplace items</span>
          </div>
          <button class="marketplace-panel-primary ghost" type="button" data-marketplace-open="true">Manage</button>
        </div>

        <div class="marketplace-panel-item-rail">${itemRail}</div>

        ${detailCard}

        ${metrics ? `<section class="marketplace-panel-metrics">${metrics}</section>` : ''}

        <section class="marketplace-panel-records-shell">
          <div class="marketplace-panel-section-head">
            <span>${listLabel}</span>
            <span>${state.records.length}</span>
          </div>
          <div class="marketplace-panel-records ${panelSurface?.template === 'quote-board' ? 'quote-board' : ''}">
            ${recordCards || '<div class="marketplace-panel-empty-inline">No records available in this dataset.</div>'}
          </div>
        </section>
      </div>
    `;

    this.setContent(html);
  }
}
