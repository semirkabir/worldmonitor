import { Panel } from './Panel';
import { searchPredictions, type PredictionMarket } from '@/services/prediction';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';

export class PredictionPanel extends Panel {
  private onMarketClick?: (market: PredictionMarket) => void;
  private allPredictions: PredictionMarket[] = [];
  private searchInput: HTMLInputElement | null = null;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchVersion = 0;

  private getTheme(title: string): string {
    const lower = title.toLowerCase();
    if (/taiwan|china|beijing/.test(lower)) return 'China / Taiwan';
    if (/iran|israel|gaza|hamas|middle east|houthi/.test(lower)) return 'Middle East';
    if (/russia|ukraine|putin/.test(lower)) return 'Russia / Ukraine';
    if (/election|senate|president|congress|trump|biden/.test(lower)) return 'Elections';
    if (/oil|opec|inflation|fed|recession|tariff/.test(lower)) return 'Macro';
    return 'Other';
  }

  constructor() {
    super({
      id: 'polymarket',
      title: t('panels.polymarket'),
      infoTooltip: t('components.prediction.infoTooltip'),
    });

    const searchWrap = document.createElement('label');
    searchWrap.className = 'prediction-panel-search';
    searchWrap.title = 'Search Polymarket markets';
    searchWrap.innerHTML = '<span class="prediction-panel-search-icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></span>';

    const searchInput = document.createElement('input');
    searchInput.className = 'prediction-panel-search-input';
    searchInput.type = 'search';
    searchInput.placeholder = 'Search Polymarket';
    searchInput.setAttribute('aria-label', 'Search Polymarket markets');
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('spellcheck', 'false');
    searchInput.addEventListener('input', () => {
      void this.handlePanelSearchInput();
    });
    searchWrap.appendChild(searchInput);
    this.searchInput = searchInput;

    const anchor = this.header.querySelector('.panel-copy-btn, .panel-remove-btn, .panel-data-badge, .panel-count');
    if (anchor) {
      this.header.insertBefore(searchWrap, anchor);
    } else {
      this.header.appendChild(searchWrap);
    }
  }

  public setOnMarketClick(cb: (market: PredictionMarket) => void): void {
    this.onMarketClick = cb;
  }

  private formatVolume(volume?: number): string {
    if (!volume) return '';
    if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
    if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}K`;
    return `$${volume.toFixed(0)}`;
  }

  public renderPredictions(data: PredictionMarket[]): void {
    this.allPredictions = [...data];
    const activeQuery = this.searchInput?.value.trim() ?? '';
    if (activeQuery) {
      void this.runSearch(activeQuery);
      return;
    }
    this.renderMarketList(this.allPredictions, data.length === 0 ? t('common.failedPredictions') : undefined);
  }

  private renderMarketList(data: PredictionMarket[], emptyMessage?: string): void {
    if (data.length === 0) {
      this.setContentNow(`<div class="panel-empty-state">${escapeHtml(emptyMessage || 'No matching markets')}</div>`);
      return;
    }

    const orderedMarkets = [...data].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    const grouped = new Map<string, PredictionMarket[]>();
    for (const market of orderedMarkets) {
      const theme = this.getTheme(market.title);
      const bucket = grouped.get(theme) ?? [];
      bucket.push(market);
      grouped.set(theme, bucket);
    }

    const html = [...grouped.entries()]
      .map(([theme, markets]) => {
        const items = markets.map((p) => {
        const yesPercent = Math.round(p.yesPrice);
        const noPercent = 100 - yesPercent;
        const volumeStr = this.formatVolume(p.volume);

        const titleHtml = `<div class="prediction-question">${escapeHtml(p.title)}</div>`;

        let expiryHtml = '';
        if (p.endDate) {
          const d = new Date(p.endDate);
          if (Number.isFinite(d.getTime())) {
            const formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            expiryHtml = `<span class="prediction-expiry">${t('components.predictions.closes')}: ${formatted}</span>`;
          }
        }

        const metaHtml = (volumeStr || expiryHtml)
          ? `<div class="prediction-meta">${volumeStr ? `<span class="prediction-volume">${t('components.predictions.vol')}: ${volumeStr}</span>` : ''}${expiryHtml}</div>`
          : '';

        return `
      <div class="prediction-item" data-slug="${p.slug || ''}" style="cursor: pointer;">
        ${titleHtml}
        ${metaHtml}
        <div class="prediction-bar">
          <div class="prediction-yes" style="width: ${yesPercent}%">
            <span class="prediction-label">${t('components.predictions.yes')} ${yesPercent}%</span>
          </div>
          <div class="prediction-no" style="width: ${noPercent}%">
            <span class="prediction-label">${t('components.predictions.no')} ${noPercent}%</span>
          </div>
        </div>
      </div>
    `;
      }).join('');

        return `<div class="prediction-group"><div class="prediction-group-title">${escapeHtml(theme)}</div>${items}</div>`;
      })
      .join('');

    this.setContentNow(html);

    // Attach click listeners
    const items = this.element.querySelectorAll('.prediction-item');
    items.forEach((item: Element, index: number) => {
      item.addEventListener('click', () => {
        const market = orderedMarkets[index];
        if (market && this.onMarketClick) {
          this.onMarketClick(market);
        }
      });
    });
  }

  private filterLocalPredictions(query: string): PredictionMarket[] {
    const lower = query.toLowerCase();
    return this.allPredictions.filter((market) => market.title.toLowerCase().includes(lower));
  }

  private async handlePanelSearchInput(): Promise<void> {
    const query = this.searchInput?.value.trim() ?? '';
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    if (!query) {
      this.searchVersion++;
      this.header.classList.remove('prediction-searching');
      this.renderMarketList(this.allPredictions, this.allPredictions.length === 0 ? t('common.failedPredictions') : undefined);
      return;
    }
    this.searchDebounceTimer = setTimeout(() => {
      void this.runSearch(query);
    }, 80);
  }

  private async runSearch(query: string): Promise<void> {
    const normalized = query.trim();
    if (!normalized) {
      this.header.classList.remove('prediction-searching');
      this.renderMarketList(this.allPredictions, this.allPredictions.length === 0 ? t('common.failedPredictions') : undefined);
      return;
    }

    const version = ++this.searchVersion;
    const localMatches = this.filterLocalPredictions(normalized);
    this.renderMarketList(localMatches, `Searching Polymarket for "${normalized}"...`);

    if (normalized.length < 2) return;

    this.header.classList.add('prediction-searching');
    try {
      const liveMatches = await searchPredictions(normalized);
      if (version !== this.searchVersion) return;
      const merged = new Map<string, PredictionMarket>();
      for (const market of [...localMatches, ...liveMatches]) {
        const key = market.slug || market.url || market.title;
        const existing = merged.get(key);
        if (!existing || (market.volume ?? 0) > (existing.volume ?? 0)) {
          merged.set(key, market);
        }
      }
      this.renderMarketList([...merged.values()], `No Polymarket markets found for "${normalized}"`);
    } catch {
      if (version !== this.searchVersion) return;
      this.renderMarketList(localMatches, `Unable to search Polymarket for "${normalized}"`);
    } finally {
      if (version === this.searchVersion) {
        this.header.classList.remove('prediction-searching');
      }
    }
  }
}
