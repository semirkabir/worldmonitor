import type { CorrelationSignal } from '@/services/correlation';
import type { UnifiedAlert } from '@/services/cross-module-integration';
import type { NewsItem, MarketData } from '@/types';
import { escapeHtml } from '@/utils/sanitize';
import { getCSSColor } from '@/utils';
import { getSignalContext, type SignalType } from '@/utils/analysis-constants';

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  prediction_leads_news: `🔮`,
  news_leads_markets:    `📰`,
  silent_divergence:     `🔇`,
  velocity_spike:        `🔥`,
  keyword_spike:         `📊`,
  convergence:           `◉`,
  triangulation:         `△`,
  flow_drop:             `🛢️`,
  flow_price_divergence: `📈`,
  geo_convergence:       `🌐`,
  explained_market_move: `✓`,
  sector_cascade:        `📊`,
  military_surge:        `🛩️`,
  hotspot_escalation:    `⚠️`,
};

const ALERT_TYPE_ICONS: Record<string, string> = {
  cii_spike:   '📊',
  convergence: '🌍',
  cascade:     '⚡',
  composite:   '🔗',
};

// Intelligence icon: human head with gear (from Flaticon)
const INTELLIGENCE_ICON = `<img src="/intelligence-icon.png" width="16" height="16" alt="Intelligence" style="vertical-align:middle;filter:invert(1);margin-right:4px" />`;

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#6b7280',
};

// Maps signal topic keywords → relevant market symbol fragments
const TOPIC_MARKET_MAP: Array<[string[], string[]]> = [
  [['oil', 'crude', 'petroleum', 'opec', 'iran', 'iraq', 'saudi'],   ['CL', 'BZ', 'XOM', 'CVX']],
  [['gas', 'lng', 'natural gas', 'ukraine', 'russia', 'europe'],      ['NG', 'TTF']],
  [['gold', 'safe haven', 'crisis', 'war', 'conflict', 'recession'],  ['GC', 'GLD']],
  [['tech', 'nasdaq', 'ai', 'silicon', 'semiconductor', 'nvidia'],    ['QQQ', 'NVDA', 'MSFT', 'AAPL']],
  [['bitcoin', 'crypto', 'digital', 'defi', 'blockchain'],            ['BTC', 'ETH']],
  [['dollar', 'fed', 'rates', 'inflation', 'treasury', 'bond'],       ['DXY', 'TLT', '^TNX']],
  [['volatility', 'fear', 'risk', 'crash', 'panic'],                  ['^VIX']],
  [['china', 'asia', 'taiwan', 'beijing'],                            ['HSI', 'BABA', 'FXI']],
  [['wheat', 'grain', 'food', 'agriculture'],                         ['ZW', 'CORN']],
  [['defense', 'military', 'weapons', 'arms'],                        ['LMT', 'RTX', 'NOC']],
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  if (ms < 60_000)   return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function fmtPrice(price: number | null): string {
  if (price === null) return '—';
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (price >= 10)   return price.toFixed(2);
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
  const lower = terms.map(s => s.toLowerCase());
  const scored = news.map(n => {
    const title = n.title.toLowerCase();
    const hits = lower.filter(term => title.includes(term)).length;
    return { n, hits };
  }).filter(x => x.hits > 0);
  scored.sort((a, b) => b.hits - a.hits || b.n.pubDate.getTime() - a.n.pubDate.getTime());
  return scored.slice(0, 5).map(x => x.n);
}

function filterMarketsForTerms(markets: MarketData[], terms: string[]): MarketData[] {
  if (markets.length === 0) return [];
  if (terms.length === 0) return markets.slice(0, 6);

  const lower = terms.map(s => s.toLowerCase());
  const relevantSymbols = new Set<string>();

  for (const [keywords, symbols] of TOPIC_MARKET_MAP) {
    if (lower.some(term => keywords.some(kw => term.includes(kw) || kw.includes(term)))) {
      symbols.forEach(s => relevantSymbols.add(s));
    }
  }

  if (relevantSymbols.size === 0) return markets.slice(0, 6);

  const filtered = markets.filter(m =>
    [...relevantSymbols].some(sym =>
      m.symbol.toUpperCase().startsWith(sym) || m.symbol.toUpperCase() === sym
    )
  );
  return filtered.length >= 2 ? filtered.slice(0, 6) : markets.slice(0, 6);
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export class IntelligenceFindingPanel {
  private panel: HTMLElement;
  private headerEl: HTMLElement;
  private titleEl: HTMLElement;
  private content: HTMLElement;
  private onLocationClick?: (lat: number, lon: number) => void;
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

    // Delegate clicks: location buttons + news links
    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const locBtn = target.closest('.ifp-location-btn') as HTMLElement | null;
      if (locBtn) {
        const lat = parseFloat(locBtn.dataset.lat || '');
        const lon = parseFloat(locBtn.dataset.lon || '');
        if (this.onLocationClick && !isNaN(lat) && !isNaN(lon)) {
          this.onLocationClick(lat, lon);
          this.hide();
        }
        return;
      }
      const newsItem = target.closest('.ifp-news-item') as HTMLAnchorElement | null;
      if (newsItem?.href) {
        window.open(newsItem.href, '_blank', 'noopener');
      }
    });

    shell.append(this.headerEl, this.content);
    this.panel.appendChild(shell);
    document.body.appendChild(this.panel);
  }

  /* ---- public API ---- */

  setLocationClickHandler(handler: (lat: number, lon: number) => void): void {
    this.onLocationClick = handler;
  }

  setDataProviders(providers: { getNews: () => NewsItem[]; getMarkets: () => MarketData[] }): void {
    this.getNews = providers.getNews;
    this.getMarkets = providers.getMarkets;
  }

  showSignal(signal: CorrelationSignal): void {
    const icon = SIGNAL_TYPE_LABELS[signal.type] || '📌';
    const typeKey = signal.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    this.titleEl.textContent = `${icon} ${typeKey}`;

    const context = getSignalContext(signal.type as SignalType);
    const data = signal.data as Record<string, unknown>;

    const terms: string[] = [
      ...(signal.data.relatedTopics || []),
      ...(data.correlatedEntities as string[] || []),
      typeof data.term === 'string' ? data.term : '',
    ].filter(Boolean) as string[];

    const news    = filterNewsForTerms(this.getNews(), terms);
    const markets = filterMarketsForTerms(this.getMarkets(), terms);

    const confidencePct = Math.round(signal.confidence * 100);
    const confColor = confidencePct >= 70 ? '#f97316' : confidencePct >= 50 ? '#eab308' : '#6b7280';

    const lat = data.lat as number | undefined;
    const lon = data.lon as number | undefined;
    const regionName = data.regionName as string | undefined;
    const newsCorrelation = data.newsCorrelation as string | undefined;
    const focalPoints = data.focalPointContext as string[] | undefined;
    const correlatedNews = data.correlatedNews as string[] | undefined;

    this.content.innerHTML = `
      <!-- Main card -->
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

      <!-- Signal-specific metrics -->
      ${this.renderSignalStats(signal)}

      <!-- Location button -->
      ${lat && lon ? `
        <div class="ifp-section">
          <button class="ifp-location-btn" data-lat="${lat}" data-lon="${lon}">
            📍 ${regionName ? escapeHtml(regionName) : `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`} — view on map
          </button>
        </div>
      ` : ''}

      <!-- Why it matters / Actionable / Note -->
      <div class="ifp-section">
        <div class="ifp-section-title">Analysis</div>
        <div class="ifp-context-item">
          <span class="ifp-context-label">Why it matters</span>
          <span class="ifp-context-value">${escapeHtml(context.whyItMatters)}</span>
        </div>
        <div class="ifp-context-item">
          <span class="ifp-context-label">Actionable insight</span>
          <span class="ifp-context-value">${escapeHtml(context.actionableInsight)}</span>
        </div>
        <div class="ifp-context-item">
          <span class="ifp-context-label">Confidence note</span>
          <span class="ifp-context-value">${escapeHtml(context.confidenceNote)}</span>
        </div>
      </div>

      <!-- Explanation / focal points / news correlation -->
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
              ${focalPoints.map(fp => `<span class="ifp-context-value">📡 ${escapeHtml(fp)}</span>`).join('')}
            </div>
          ` : ''}
          ${newsCorrelation ? `
            <div class="ifp-context-item">
              <span class="ifp-context-label">News correlation</span>
              <span class="ifp-context-value" style="font-size:11px;font-family:monospace">${escapeHtml(newsCorrelation)}</span>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Correlated news headlines from signal data -->
      ${correlatedNews && correlatedNews.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Correlated headlines</div>
          ${correlatedNews.slice(0, 4).map(h => `
            <div style="font-size:11px;color:var(--text-dim);padding:4px 0;border-bottom:1px solid var(--border-dim,rgba(255,255,255,0.05))">
              📰 ${escapeHtml(h)}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Topics / entities chips -->
      ${terms.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Related topics</div>
          <div class="ifp-chips">
            ${[...new Set(terms)].slice(0, 12).map(t => `<span class="ifp-chip">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Live news matching signal topics -->
      ${this.renderNewsSection(news)}

      <!-- Market data -->
      ${this.renderMarketsSection(markets)}
    `;

    this.open();
  }

  showAlert(alert: UnifiedAlert): void {
    const icon = ALERT_TYPE_ICONS[alert.type] || '⚠️';
    const typeLabel = alert.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    this.titleEl.textContent = `${icon} ${typeLabel}`;

    const priorityColors: Record<string, string> = {
      critical: getCSSColor('--semantic-critical') || '#ef4444',
      high:     getCSSColor('--semantic-high') || '#f97316',
      medium:   getCSSColor('--semantic-low') || '#eab308',
      low:      getCSSColor('--text-dim') || '#6b7280',
    };
    const pc = priorityColors[alert.priority] || PRIORITY_COLORS[alert.priority] || '#ff9944';

    // Build search terms for news + market filtering
    const terms: string[] = [...alert.countries];
    if (alert.components.ciiChange) {
      terms.push(alert.components.ciiChange.countryName);
    }
    if (alert.components.cascade) {
      terms.push(alert.components.cascade.sourceName);
    }

    const news    = filterNewsForTerms(this.getNews(), terms);
    const markets = filterMarketsForTerms(this.getMarkets(), terms);

    this.content.innerHTML = `
      <!-- Main card -->
      <div class="ifp-main">
        <div class="ifp-type-row">
          <span class="ifp-type-label">${icon} ${escapeHtml(typeLabel)}</span>
          <span class="ifp-priority-badge" style="background:${pc}22;color:${pc}">${alert.priority.toUpperCase()}</span>
        </div>
        <div class="ifp-title">${escapeHtml(alert.title)}</div>
        <div class="ifp-description">${escapeHtml(alert.summary)}</div>
        <div class="ifp-meta"><span>${timeAgo(alert.timestamp)}</span></div>
      </div>

      <!-- Alert-specific details -->
      ${this.renderAlertDetails(alert, pc)}

      <!-- Location button for convergence -->
      ${alert.location ? `
        <div class="ifp-section">
          <button class="ifp-location-btn" data-lat="${alert.location.lat}" data-lon="${alert.location.lon}">
            📍 ${alert.location.lat.toFixed(2)}°, ${alert.location.lon.toFixed(2)}° — view on map
          </button>
        </div>
      ` : ''}

      <!-- Affected countries chips -->
      ${alert.countries.length ? `
        <div class="ifp-section">
          <div class="ifp-section-title">Affected countries</div>
          <div class="ifp-chips">
            ${alert.countries.map(c => `<span class="ifp-chip">${escapeHtml(c)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Live news -->
      ${this.renderNewsSection(news)}

      <!-- Market data -->
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

  /* ---- private renderers ---- */

  private renderSignalStats(signal: CorrelationSignal): string {
    const data = signal.data as Record<string, unknown>;
    const stats: Array<[string, string]> = [];

    if (typeof data.newsVelocity === 'number')
      stats.push(['News velocity', `${data.newsVelocity.toFixed(1)}/hr`]);
    if (typeof data.multiplier === 'number')
      stats.push(['Spike multiplier', `${data.multiplier.toFixed(1)}×`]);
    if (typeof data.baseline === 'number')
      stats.push(['Baseline', String(data.baseline.toFixed(1))]);
    if (typeof data.sourceCount === 'number')
      stats.push(['Sources', String(data.sourceCount)]);
    if (typeof data.marketChange === 'number')
      stats.push(['Market Δ', `${data.marketChange > 0 ? '+' : ''}${data.marketChange.toFixed(2)}%`]);
    if (typeof data.predictionShift === 'number')
      stats.push(['Prediction Δ', `${data.predictionShift > 0 ? '+' : ''}${data.predictionShift.toFixed(1)}pp`]);

    if (stats.length === 0) return '';

    const cells = stats.map(([label, val]) => `
      <div class="ifp-stat-cell">
        <div class="ifp-stat-label">${escapeHtml(label)}</div>
        <div class="ifp-stat-value">${escapeHtml(val)}</div>
      </div>
    `).join('');

    return `
      <div class="ifp-section">
        <div class="ifp-section-title">Signal metrics</div>
        <div class="ifp-stat-grid">${cells}</div>
      </div>
    `;
  }

  private renderAlertDetails(alert: UnifiedAlert, _color: string): string {
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
      const conv = alert.components.convergence;
      items.push(['Event types', conv.types.join(', ')]);
      items.push(['Event count', String(conv.totalEvents)]);
    }

    if (alert.components.cascade) {
      const casc = alert.components.cascade;
      items.push(['Source', `${casc.sourceName} (${casc.sourceType})`]);
      items.push(['Countries affected', String(casc.countriesAffected)]);
      items.push(['Highest impact', casc.highestImpact]);
    }

    if (items.length === 0) return '';

    return `
      <div class="ifp-section">
        <div class="ifp-section-title">Details</div>
        ${items.map(([label, val]) => `
          <div class="ifp-context-item">
            <span class="ifp-context-label">${escapeHtml(label)}</span>
            <span class="ifp-context-value">${escapeHtml(val)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderNewsSection(news: NewsItem[]): string {
    if (news.length === 0) return '';
    const rows = news.map(n => {
      const level = n.threat?.level ?? (n.isAlert ? 'high' : 'none');
      const ago = timeAgo(n.pubDate);
      return `
        <a class="ifp-news-item" href="${escapeHtml(n.link)}" target="_blank" rel="noopener">
          <span class="ifp-threat-dot ${escapeHtml(level)}"></span>
          <span class="ifp-news-body">
            <span class="ifp-news-headline">${escapeHtml(n.title)}</span>
            <span class="ifp-news-meta">
              <span class="ifp-news-source">${escapeHtml(n.source)}</span>
              <span>·</span>
              <span>${ago}</span>
            </span>
          </span>
        </a>
      `;
    }).join('');

    return `
      <div class="ifp-section">
        <div class="ifp-section-title">Related headlines</div>
        ${rows}
      </div>
    `;
  }

  private renderMarketsSection(markets: MarketData[]): string {
    if (markets.length === 0) return '';
    const rows = markets.map(m => {
      const { text, cls } = fmtChange(m.change);
      return `
        <div class="ifp-market-row">
          <div class="ifp-market-name-col">
            <div class="ifp-market-name">${escapeHtml(m.display || m.name)}</div>
            <div class="ifp-market-symbol">${escapeHtml(m.symbol)}</div>
          </div>
          <div class="ifp-market-price">${fmtPrice(m.price)}</div>
          <div class="ifp-market-change ${cls}">${text}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="ifp-section">
        <div class="ifp-section-title">Related markets</div>
        ${rows}
      </div>
    `;
  }

  private open(): void {
    this.panel.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', this.escHandler);
    requestAnimationFrame(() => this.panel.classList.add('active'));
  }
}
