import { Panel } from './Panel';
import { searchPredictions, type PredictionMarket } from '@/services/prediction';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';

type PredictionTimeframe = '1h' | '6h' | '24h' | '48h' | '7d' | 'all';

const TIMEFRAME_MS: Record<Exclude<PredictionTimeframe, 'all'>, number> = {
  '1h': 1 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const TIMEFRAME_STORAGE_KEY = 'wm:time-range';
const TIMEFRAME_EVENT = 'wm:time-range-changed';

function loadStoredTimeframe(): PredictionTimeframe {
  try {
    const stored = localStorage.getItem(TIMEFRAME_STORAGE_KEY);
    if (stored === '1h' || stored === '6h' || stored === '24h' || stored === '48h' || stored === '7d' || stored === 'all') return stored;
  } catch { /* ignore */ }
  return '7d';
}

function storeTimeframe(tf: PredictionTimeframe): void {
  try { localStorage.setItem(TIMEFRAME_STORAGE_KEY, tf); } catch { /* ignore */ }
}

export class PredictionPanel extends Panel {
  private onMarketClick?: (market: PredictionMarket) => void;
  private allPredictions: PredictionMarket[] = [];
  private timeframe: PredictionTimeframe = loadStoredTimeframe();
  private timeframeSelect: HTMLSelectElement | null = null;
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

    const tfSelect = document.createElement('select');
    tfSelect.className = 'prediction-timeframe';
    tfSelect.title = 'Filter by closing time';
    tfSelect.setAttribute('aria-label', 'Timeframe filter');
    const tfOptions: { value: PredictionTimeframe; label: string }[] = [
      { value: '1h', label: '1h' },
      { value: '6h', label: '6h' },
      { value: '24h', label: '24h' },
      { value: '48h', label: '48h' },
      { value: '7d', label: '7d' },
      { value: 'all', label: 'All' },
    ];
    for (const opt of tfOptions) {
      const el = document.createElement('option');
      el.value = opt.value;
      el.textContent = opt.label;
      if (opt.value === this.timeframe) el.selected = true;
      tfSelect.appendChild(el);
    }
    tfSelect.addEventListener('change', () => {
      this.timeframe = tfSelect.value as PredictionTimeframe;
      storeTimeframe(this.timeframe);
      window.dispatchEvent(new CustomEvent(TIMEFRAME_EVENT, { detail: { range: this.timeframe } }));
      this.renderFilteredMarkets();
    });
    this.timeframeSelect = tfSelect;

    window.addEventListener(TIMEFRAME_EVENT, ((event: Event) => {
      const range = (event as CustomEvent<{ range?: PredictionTimeframe }>).detail?.range;
      if (!range || range === this.timeframe) return;
      this.timeframe = range;
      if (this.timeframeSelect) this.timeframeSelect.value = range;
      this.renderFilteredMarkets();
    }) as EventListener);

    const headerAnchor = this.header.querySelector('.panel-copy-btn, .panel-remove-btn, .panel-data-badge, .panel-count');
    if (headerAnchor) {
      this.header.insertBefore(tfSelect, headerAnchor);
    } else {
      this.header.appendChild(tfSelect);
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
    this.renderFilteredMarkets();
  }

  private filterByTimeframe(markets: PredictionMarket[]): PredictionMarket[] {
    if (this.timeframe === 'all') return markets;
    const cutoff = Date.now() + TIMEFRAME_MS[this.timeframe];
    return markets.filter(m => {
      if (!m.endDate) return false;
      const ms = Date.parse(m.endDate);
      return Number.isFinite(ms) && ms <= cutoff;
    });
  }

  private renderFilteredMarkets(): void {
    const filtered = this.filterByTimeframe(this.allPredictions);
    const top15 = [...filtered]
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 15);
    this.renderMarketList(top15, top15.length === 0 && this.allPredictions.length > 0
      ? `No markets closing within ${this.timeframe === '1h' ? '1 hour' : this.timeframe === '6h' ? '6 hours' : this.timeframe === '24h' ? '24 hours' : this.timeframe === '48h' ? '48 hours' : this.timeframe === '7d' ? '7 days' : 'all time'}`
      : undefined);
  }

  private renderMarketList(data: PredictionMarket[], emptyMessage?: string): void {
    if (data.length === 0) {
      this.setContentNow(`<div class="panel-empty-state">${escapeHtml(emptyMessage || 'No matching markets')}</div>`);
      return;
    }

    const orderedMarkets = [...data].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    const marketLookup = new Map<string, PredictionMarket>();
    const grouped = new Map<string, PredictionMarket[]>();
    for (const market of orderedMarkets) {
      const key = market.slug || market.url || market.title;
      if (key) marketLookup.set(key, market);
      const theme = this.getTheme(market.title);
      const bucket = grouped.get(theme) ?? [];
      bucket.push(market);
      grouped.set(theme, bucket);
    }

    const html = [...grouped.entries()]
      .map(([theme, markets]) => {
        const items = markets.map((p) => {
        const yesPercent = Math.max(0, Math.min(100, Math.round(p.yesPrice)));
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

        const itemKey = p.slug || p.url || p.title;

        return `
      <div class="prediction-item" data-market-key="${escapeHtml(itemKey)}" style="cursor: pointer;">
        ${titleHtml}
        ${metaHtml}
        <div class="prediction-odds-row">
          <span class="prediction-odds prediction-odds-yes">${t('components.predictions.yes')} ${yesPercent}%</span>
          <span class="prediction-odds prediction-odds-no">${t('components.predictions.no')} ${noPercent}%</span>
        </div>
        <div class="prediction-bar">
          <div class="prediction-yes" style="width: ${yesPercent}%"></div>
          <div class="prediction-no" style="width: ${noPercent}%"></div>
        </div>
      </div>
    `;
      }).join('');

        const themeClass = theme.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return `<div class="prediction-group prediction-group-${themeClass}"><div class="prediction-group-title">${escapeHtml(theme)}</div>${items}</div>`;
      })
      .join('');

    this.setContentNow(html);

    // Attach click listeners
    const items = this.element.querySelectorAll('.prediction-item');
    items.forEach((item: Element) => {
      item.addEventListener('click', () => {
        const key = item.getAttribute('data-market-key') || '';
        const market = marketLookup.get(key);
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
      this.renderFilteredMarkets();
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
      this.renderFilteredMarkets();
      return;
    }

    const version = ++this.searchVersion;
    const localMatches = this.filterByTimeframe(this.filterLocalPredictions(normalized));
    this.renderMarketList(localMatches, `Searching Polymarket for "${normalized}"...`);

    if (normalized.length < 2) return;

    this.header.classList.add('prediction-searching');
    try {
      const liveMatches = await searchPredictions(normalized);
      if (version !== this.searchVersion) return;
      const merged = new Map<string, PredictionMarket>();
      for (const market of [...localMatches, ...this.filterByTimeframe(liveMatches)]) {
        const key = market.slug || market.url || market.title;
        const existing = merged.get(key);
        if (!existing || (market.volume ?? 0) > (existing.volume ?? 0)) {
          merged.set(key, market);
        }
      }
      const top15 = [...merged.values()].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 15);
      this.renderMarketList(top15, `No Polymarket markets found for "${normalized}"`);
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
