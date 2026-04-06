import type { CorrelationSignal } from '@/services/correlation';
import type { UnifiedAlert } from '@/services/cross-module-integration';
import type { NewsItem, MarketData } from '@/types';
import { escapeHtml } from '@/utils/sanitize';
import { getCSSColor } from '@/utils';
import { getSignalContext, type SignalType } from '@/utils/analysis-constants';

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  prediction_leads_news: '🔮',
  news_leads_markets: '📰',
  silent_divergence: '🔇',
  velocity_spike: '🔥',
  keyword_spike: '📊',
  convergence: '◉',
  triangulation: '△',
  flow_drop: '🛢️',
  flow_price_divergence: '📈',
  geo_convergence: '🌐',
  explained_market_move: '✓',
  sector_cascade: '📊',
  military_surge: '🛩️',
  hotspot_escalation: '⚠️',
};

const ALERT_TYPE_ICONS: Record<string, string> = {
  cii_spike: '📊',
  convergence: '🌍',
  cascade: '⚡',
  composite: '🔗',
};

const INTELLIGENCE_ICON = '<img src="/intelligence-icon.png" width="16" height="16" alt="Intelligence" style="vertical-align:middle;filter:invert(1);margin-right:4px" />';

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
};

const TOPIC_MARKET_MAP: Array<[string[], string[]]> = [
  [['oil', 'crude', 'petroleum', 'opec', 'iran', 'iraq', 'saudi'], ['CL', 'BZ', 'XOM', 'CVX']],
  [['gas', 'lng', 'natural gas', 'ukraine', 'russia', 'europe'], ['NG', 'TTF']],
  [['gold', 'safe haven', 'crisis', 'war', 'conflict', 'recession'], ['GC', 'GLD']],
  [['tech', 'nasdaq', 'ai', 'silicon', 'semiconductor', 'nvidia'], ['QQQ', 'NVDA', 'MSFT', 'AAPL']],
  [['bitcoin', 'crypto', 'digital', 'defi', 'blockchain'], ['BTC', 'ETH']],
  [['dollar', 'fed', 'rates', 'inflation', 'treasury', 'bond'], ['DXY', 'TLT', '^TNX']],
  [['volatility', 'fear', 'risk', 'crash', 'panic'], ['^VIX']],
  [['china', 'asia', 'taiwan', 'beijing'], ['HSI', 'BABA', 'FXI']],
  [['wheat', 'grain', 'food', 'agriculture'], ['ZW', 'CORN']],
  [['defense', 'military', 'weapons', 'arms'], ['LMT', 'RTX', 'NOC']],
];

type RelatedArticle = {
  title: string;
  source: string;
  link: string;
  imageUrl?: string;
};

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function fmtPrice(price: number | null): string {
  if (price === null) return '—';
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (price >= 10) return price.toFixed(2);
  return price.toFixed(4);
}

function fmtChange(change: number | null): { text: string; cls: string } {
  if (change === null) return { text: '—', cls: 'flat' };
  const sign = change >= 0 ? '+' : '';
  return {
    text: `${sign}${change.toFixed(2)}%`,
    cls: change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat',
  };
}

function filterNewsForTerms(news: NewsItem[], terms: string[]): NewsItem[] {
  if (terms.length === 0) return news.slice(0, 5);
  const lower = terms.map((s) => s.toLowerCase());
  const scored = news.map((n) => {
    const title = n.title.toLowerCase();
    const hits = lower.filter((term) => title.includes(term)).length;
    return { n, hits };
  }).filter((item) => item.hits > 0);
  scored.sort((a, b) => b.hits - a.hits || b.n.pubDate.getTime() - a.n.pubDate.getTime());
  return scored.slice(0, 5).map((item) => item.n);
}

function filterMarketsForTerms(markets: MarketData[], terms: string[]): MarketData[] {
  if (markets.length === 0) return [];
  if (terms.length === 0) return markets.slice(0, 6);

  const lower = terms.map((s) => s.toLowerCase());
  const relevantSymbols = new Set<string>();

  for (const [keywords, symbols] of TOPIC_MARKET_MAP) {
    if (lower.some((term) => keywords.some((kw) => term.includes(kw) || kw.includes(term)))) {
      symbols.forEach((symbol) => relevantSymbols.add(symbol));
    }
  }

  if (relevantSymbols.size === 0) return markets.slice(0, 6);

  const filtered = markets.filter((market) =>
    [...relevantSymbols].some((symbol) =>
      market.symbol.toUpperCase().startsWith(symbol) || market.symbol.toUpperCase() === symbol,
    ));

  return filtered.length >= 2 ? filtered.slice(0, 6) : markets.slice(0, 6);
}

function dedupeTerms(terms: string[]): string[] {
  return [...new Set(terms.map((term) => term.trim()).filter((term) => term.length > 0))];
}

export class IntelligenceFindingPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private titleEl: HTMLElement;
  private content: HTMLElement;
  private onLocationClick?: (lat: number, lon: number) => void;
  private onSearchTopic?: (query: string) => void;
  private getNews: () => NewsItem[] = () => [];
  private getMarkets: () => MarketData[] = () => [];
  private escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.hide(); };

  constructor() {
    this.panel = document.createElement('aside');
    this.panel.className = 'findings-detail-panel';
    this.panel.setAttribute('aria-label', 'Intelligence Finding Detail');
    this.panel.setAttribute('aria-hidden', 'true');

    const shell = document.createElement('div');
    shell.className = 'findings-detail-shell';

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'findings-detail-header';

    this.titleEl = document.createElement('span');
    this.titleEl.className = 'findings-detail-title';
    this.titleEl.innerHTML = `${INTELLIGENCE_ICON} Intelligence Finding`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'findings-detail-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.hide());

    this.headerEl.append(this.titleEl, closeBtn);

    this.content = document.createElement('div');
    this.content.className = 'findings-detail-content';
    this.content.addEventListener('click', (e) => this.handleContentClick(e));

    shell.append(this.headerEl, this.content);
    this.panel.appendChild(shell);
    document.body.appendChild(this.panel);
  }

  setLocationClickHandler(handler: (lat: number, lon: number) => void): void {
    this.onLocationClick = handler;
  }

  setDataProviders(providers: { getNews: () => NewsItem[]; getMarkets: () => MarketData[] }): void {
    this.getNews = providers.getNews;
    this.getMarkets = providers.getMarkets;
  }

  setSearchHandler(handler: (query: string) => void): void {
    this.onSearchTopic = handler;
  }

  showSignal(signal: CorrelationSignal): void {
    const icon = SIGNAL_TYPE_LABELS[signal.type] || '📌';
    const typeKey = signal.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    this.titleEl.textContent = `${icon} ${typeKey}`;

    const context = getSignalContext(signal.type as SignalType);
    const data = signal.data as Record<string, unknown>;
    const terms = dedupeTerms([
      ...(signal.data.relatedTopics || []),
      ...((data.correlatedEntities as string[]) || []),
      typeof data.term === 'string' ? data.term : '',
    ]);

    const news = filterNewsForTerms(this.getNews(), terms);
    const markets = filterMarketsForTerms(this.getMarkets(), terms);

    const confidencePct = Math.round(signal.confidence * 100);
    const confColor = confidencePct >= 70 ? '#f97316' : confidencePct >= 50 ? '#eab308' : '#6b7280';

    const lat = data.lat as number | undefined;
    const lon = data.lon as number | undefined;
    const regionName = data.regionName as string | undefined;
    const focalPoints = data.focalPointContext as string[] | undefined;
    const correlatedNews = data.correlatedNews as string[] | undefined;
    const newsCorrelation = data.newsCorrelation as string | undefined;
    const relatedArticles = data.relatedArticles as RelatedArticle[] | undefined;

    const featuredImage = this.getFeaturedImage(relatedArticles)
      ?? news.find((item) => item.imageUrl && item.imageUrl.trim().length > 0)?.imageUrl
      ?? this.getNews().find((item) => item.imageUrl && item.imageUrl.trim().length > 0)?.imageUrl
      ?? null;

    this.content.innerHTML = `
      ${featuredImage ? `
        <div class="ifp-featured-image">
          <img src="${escapeHtml(featuredImage)}" alt="" loading="lazy" onerror="this.closest('.ifp-featured-image').remove()" />
        </div>
      ` : ''}
      <div class="ifp-main">
        <div class="ifp-type-row">
          <span class="ifp-type-label">${escapeHtml(signal.type.replace(/_/g, ' '))}</span>
          <span class="ifp-confidence" style="background:${confColor}22;color:${confColor}">${confidencePct}% confidence</span>
        </div>
        <div class="ifp-title">${escapeHtml(signal.title)}</div>
        <div class="ifp-description">${escapeHtml(signal.description)}</div>
        <div class="ifp-meta">
          <span>${timeAgo(signal.timestamp)}</span>
          ${signal.data.sourceCount ? `<span>· ${signal.data.sourceCount} sources</span>` : ''}
        </div>
      </div>
      ${this.renderSignalStats(signal)}
      ${lat && lon ? `
        <div class="ifp-section">
          <button class="ifp-location-btn" data-lat="${lat}" data-lon="${lon}">
            📍 ${regionName ? escapeHtml(regionName) : `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`} — view on map
          </button>
        </div>
      ` : ''}
      ${this.renderSignalNarrative(signal, context, focalPoints, newsCorrelation, correlatedNews, terms)}
      ${this.renderNewsSection(news)}
      ${this.renderMarketsSection(markets)}
    `;

    this.open();
  }

  showAlert(alert: UnifiedAlert): void {
    const icon = ALERT_TYPE_ICONS[alert.type] || '⚠️';
    const typeLabel = alert.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    this.titleEl.textContent = `${icon} ${typeLabel}`;

    const priorityColors: Record<string, string> = {
      critical: getCSSColor('--semantic-critical') || '#ef4444',
      high: getCSSColor('--semantic-high') || '#f97316',
      medium: getCSSColor('--semantic-low') || '#eab308',
      low: getCSSColor('--text-dim') || '#6b7280',
    };
    const color = priorityColors[alert.priority] || PRIORITY_COLORS[alert.priority] || '#ff9944';

    const terms: string[] = [...alert.countries];
    if (alert.components.ciiChange) terms.push(alert.components.ciiChange.countryName);
    if (alert.components.cascade) terms.push(alert.components.cascade.sourceName);

    const news = filterNewsForTerms(this.getNews(), terms);
    const markets = filterMarketsForTerms(this.getMarkets(), terms);
    const alertArticleImage =
      news.find((item) => item.imageUrl && item.imageUrl.trim().length > 0)?.imageUrl
      ?? this.getNews().find((item) => item.imageUrl && item.imageUrl.trim().length > 0)?.imageUrl
      ?? null;

    this.content.innerHTML = `
      ${alertArticleImage ? `
        <div class="ifp-featured-image">
          <img src="${escapeHtml(alertArticleImage)}" alt="" loading="lazy" onerror="this.closest('.ifp-featured-image').remove()" />
        </div>
      ` : ''}
      <div class="ifp-main">
        <div class="ifp-type-row">
          <span class="ifp-type-label">${icon} ${escapeHtml(typeLabel)}</span>
          <span class="ifp-priority-badge" style="background:${color}22;color:${color}">${alert.priority.toUpperCase()}</span>
        </div>
        <div class="ifp-title">${escapeHtml(alert.title)}</div>
        <div class="ifp-description">${escapeHtml(alert.summary)}</div>
        <div class="ifp-meta"><span>${timeAgo(alert.timestamp)}</span></div>
      </div>
      ${this.renderAlertDetails(alert)}
      ${alert.location ? `
        <div class="ifp-section">
          <button class="ifp-location-btn" data-lat="${alert.location.lat}" data-lon="${alert.location.lon}">
            📍 ${alert.location.lat.toFixed(2)}°, ${alert.location.lon.toFixed(2)}° — view on map
          </button>
        </div>
      ` : ''}
      ${alert.countries.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Affected countries</div>
          ${this.renderSearchTags(alert.countries)}
        </div>
      ` : ''}
      ${this.renderNewsSection(news)}
      ${this.renderMarketsSection(markets)}
    `;

    this.open();
  }

  isVisible(): boolean {
    return this.panel.classList.contains('active');
  }

  hide(): void {
    this.panel.classList.remove('active');
    this.panel.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', this.escHandler);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.escHandler);
    this.panel.remove();
  }

  private handleContentClick(e: Event): void {
    const target = e.target as HTMLElement;

    const searchBtn = target.closest('[data-search-query]') as HTMLElement | null;
    if (searchBtn) {
      const query = searchBtn.dataset.searchQuery?.trim();
      if (query && this.onSearchTopic) {
        this.onSearchTopic(query);
        this.hide();
      }
      return;
    }

    const locBtn = target.closest('.ifp-location-btn') as HTMLElement | null;
    if (locBtn) {
      const lat = parseFloat(locBtn.dataset.lat || '');
      const lon = parseFloat(locBtn.dataset.lon || '');
      if (this.onLocationClick && !Number.isNaN(lat) && !Number.isNaN(lon)) {
        this.onLocationClick(lat, lon);
        this.hide();
      }
      return;
    }

    const newsItem = target.closest('.ifp-news-item') as HTMLAnchorElement | null;
    if (newsItem?.href) {
      window.open(newsItem.href, '_blank', 'noopener');
    }
  }

  private renderSignalStats(signal: CorrelationSignal): string {
    const data = signal.data as Record<string, unknown>;
    const stats: Array<[string, string]> = [];

    if (typeof data.newsVelocity === 'number') stats.push(['News velocity', `${data.newsVelocity.toFixed(1)}/hr`]);
    if (typeof data.multiplier === 'number') stats.push(['Spike multiplier', `${data.multiplier.toFixed(1)}×`]);
    if (typeof data.baseline === 'number') stats.push(['Baseline', data.baseline.toFixed(1)]);
    if (typeof data.sourceCount === 'number') stats.push(['Sources', String(data.sourceCount)]);
    if (typeof data.marketChange === 'number') stats.push(['Market Δ', `${data.marketChange > 0 ? '+' : ''}${data.marketChange.toFixed(2)}%`]);
    if (typeof data.predictionShift === 'number') stats.push(['Prediction Δ', `${data.predictionShift > 0 ? '+' : ''}${data.predictionShift.toFixed(1)}pp`]);

    if (stats.length === 0) return '';

    return `
      <div class="ifp-section">
        <div class="ifp-section-title">Signal metrics</div>
        <div class="ifp-stat-grid">
          ${stats.map(([label, value]) => `
            <div class="ifp-stat-cell">
              <div class="ifp-stat-label">${escapeHtml(label)}</div>
              <div class="ifp-stat-value">${escapeHtml(value)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderSignalNarrative(
    signal: CorrelationSignal,
    context: ReturnType<typeof getSignalContext>,
    focalPoints?: string[],
    newsCorrelation?: string,
    correlatedNews?: string[],
    relatedTopics: string[] = [],
  ): string {
    if (signal.type === 'keyword_spike') {
      return this.renderKeywordSpikeNarrative(signal, focalPoints, newsCorrelation, correlatedNews, relatedTopics);
    }

    const contextRows = [
      ['Why it matters', context.whyItMatters],
      ['Actionable insight', context.actionableInsight],
      ['Confidence note', context.confidenceNote],
    ].filter(([, value]) => value && value.trim().length > 0);

    return `
      ${contextRows.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Analysis</div>
          ${contextRows.map(([label, value]) => `
            <div class="ifp-context-item">
              <span class="ifp-context-label">${escapeHtml(label)}</span>
              <span class="ifp-context-value">${escapeHtml(value)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${signal.data.explanation || (focalPoints && focalPoints.length) || newsCorrelation ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Detail</div>
          ${signal.data.explanation ? `
            <div class="ifp-context-item">
              <span class="ifp-context-label">Explanation</span>
              <span class="ifp-context-value">${escapeHtml(signal.data.explanation)}</span>
            </div>
          ` : ''}
          ${focalPoints && focalPoints.length ? `
            <div class="ifp-context-item">
              <span class="ifp-context-label">Focal points</span>
              ${focalPoints.map((point) => `<span class="ifp-context-value">📡 ${escapeHtml(point)}</span>`).join('')}
            </div>
          ` : ''}
          ${newsCorrelation ? `
            <div class="ifp-context-item">
              <span class="ifp-context-label">News correlation</span>
              <span class="ifp-context-value ifp-context-value-mono">${escapeHtml(newsCorrelation)}</span>
            </div>
          ` : ''}
        </div>
      ` : ''}
      ${correlatedNews && correlatedNews.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Correlated headlines</div>
          <div class="ifp-related-headlines">
            ${correlatedNews.slice(0, 4).map((headline) => `<div class="ifp-related-headline">📰 ${escapeHtml(headline)}</div>`).join('')}
          </div>
        </div>
      ` : ''}
      ${relatedTopics.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Related topics</div>
          ${this.renderSearchTags(relatedTopics)}
        </div>
      ` : ''}
    `;
  }

  private renderKeywordSpikeNarrative(
    signal: CorrelationSignal,
    focalPoints?: string[],
    newsCorrelation?: string,
    correlatedNews?: string[],
    relatedTopics: string[] = [],
  ): string {
    const data = signal.data as Record<string, unknown>;
    const cards: string[] = [];

    if (typeof signal.data.explanation === 'string' && signal.data.explanation.trim().length > 0) {
      cards.push(`
        <div class="ifp-brief-card">
          <div class="ifp-brief-label">Signal brief</div>
          <div class="ifp-brief-value">${escapeHtml(signal.data.explanation)}</div>
        </div>
      `);
    }
    if (typeof data.actionableInsight === 'string' && data.actionableInsight.trim().length > 0) {
      cards.push(`
        <div class="ifp-brief-card">
          <div class="ifp-brief-label">Action</div>
          <div class="ifp-brief-value">${escapeHtml(data.actionableInsight)}</div>
        </div>
      `);
    }
    if (typeof data.confidenceNote === 'string' && data.confidenceNote.trim().length > 0) {
      cards.push(`
        <div class="ifp-brief-card">
          <div class="ifp-brief-label">Confidence note</div>
          <div class="ifp-brief-value">${escapeHtml(data.confidenceNote)}</div>
        </div>
      `);
    }

    return `
      ${cards.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Signal brief</div>
          <div class="ifp-brief-grid">${cards.join('')}</div>
        </div>
      ` : ''}
      ${focalPoints && focalPoints.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Focal points</div>
          <div class="ifp-related-headlines">
            ${focalPoints.map((point) => `<div class="ifp-related-headline">${escapeHtml(point)}</div>`).join('')}
          </div>
        </div>
      ` : ''}
      ${newsCorrelation ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Source pattern</div>
          <div class="ifp-mono-card">${escapeHtml(newsCorrelation)}</div>
        </div>
      ` : ''}
      ${relatedTopics.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Related topics</div>
          ${this.renderSearchTags(relatedTopics)}
        </div>
      ` : ''}
      ${correlatedNews && correlatedNews.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Correlated headlines</div>
          <div class="ifp-related-headlines">
            ${correlatedNews.slice(0, 4).map((headline) => `<div class="ifp-related-headline">📰 ${escapeHtml(headline)}</div>`).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  private renderSearchTags(terms: string[]): string {
    return `
      <div class="ifp-chips">
        ${dedupeTerms(terms).slice(0, 12).map((term) => `
          <button type="button" class="ifp-chip ifp-chip-action" data-search-query="${escapeHtml(term)}">
            ${escapeHtml(term)}
          </button>
        `).join('')}
      </div>
    `;
  }

  private renderAlertDetails(alert: UnifiedAlert): string {
    const items: Array<[string, string]> = [];

    if (alert.components.ciiChange) {
      const cii = alert.components.ciiChange;
      const sign = cii.change > 0 ? '+' : '';
      items.push(['Country', cii.countryName]);
      items.push(['Instability score', `${cii.previousScore} → ${cii.currentScore} (${sign}${cii.change})`]);
      items.push(['Level', cii.level.toUpperCase()]);
      items.push(['Primary driver', cii.driver]);
    }

    if (alert.components.convergence) {
      items.push(['Event types', alert.components.convergence.types.join(', ')]);
      items.push(['Event count', String(alert.components.convergence.totalEvents)]);
    }

    if (alert.components.cascade) {
      items.push(['Source', `${alert.components.cascade.sourceName} (${alert.components.cascade.sourceType})`]);
      items.push(['Countries affected', String(alert.components.cascade.countriesAffected)]);
      items.push(['Highest impact', alert.components.cascade.highestImpact]);
    }

    if (items.length === 0) return '';

    return `
      <div class="ifp-section">
        <div class="ifp-section-title">Details</div>
        ${items.map(([label, value]) => `
          <div class="ifp-context-item">
            <span class="ifp-context-label">${escapeHtml(label)}</span>
            <span class="ifp-context-value">${escapeHtml(value)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderNewsSection(news: NewsItem[]): string {
    if (news.length === 0) return '';

    return `
      <div class="ifp-section">
        <div class="ifp-section-title">Related headlines</div>
        ${news.map((item) => {
          const level = item.threat?.level ?? (item.isAlert ? 'high' : 'none');
          return `
            <a class="ifp-news-item" href="${escapeHtml(item.link)}" target="_blank" rel="noopener">
              <span class="ifp-threat-dot ${escapeHtml(level)}"></span>
              <span class="ifp-news-body">
                <span class="ifp-news-headline">${escapeHtml(item.title)}</span>
                <span class="ifp-news-meta">
                  <span class="ifp-news-source">${escapeHtml(item.source)}</span>
                  <span>·</span>
                  <span>${timeAgo(item.pubDate)}</span>
                </span>
              </span>
            </a>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderMarketsSection(markets: MarketData[]): string {
    if (markets.length === 0) return '';

    return `
      <div class="ifp-section">
        <div class="ifp-section-title">Related markets</div>
        ${markets.map((market) => {
          const { text, cls } = fmtChange(market.change);
          return `
            <div class="ifp-market-row">
              <div class="ifp-market-name-col">
                <div class="ifp-market-name">${escapeHtml(market.display || market.name)}</div>
                <div class="ifp-market-symbol">${escapeHtml(market.symbol)}</div>
              </div>
              <div class="ifp-market-price">${fmtPrice(market.price)}</div>
              <div class="ifp-market-change ${cls}">${text}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private getFeaturedImage(relatedArticles?: RelatedArticle[]): string | null {
    if (!relatedArticles || relatedArticles.length === 0) return null;
    for (const article of relatedArticles) {
      if (article.imageUrl && article.imageUrl.trim().length > 0) return article.imageUrl;
    }
    return null;
  }

  private open(): void {
    this.panel.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', this.escHandler);
    requestAnimationFrame(() => this.panel.classList.add('active'));
  }
}
