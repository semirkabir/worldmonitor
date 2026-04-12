import { MarketServiceClient } from '@/generated/client/worldmonitor/market/v1/service_client';
import type { MarketQuote, SecFiling } from '@/generated/client/worldmonitor/market/v1/service_client';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';
import { sanitizeUrl } from '@/utils/sanitize';
import { applyArticleLinkDataset } from '@/services/article-open';
import {
  fetchCompanyProfile,
  fetchCompanyMetrics,
  fetchCompanyPeers,
  fetchCompanyNews,
  fetchPriceTarget,
  fetchRecommendationTrends,
  fetchInsiderTransactions,
  fetchOptionChain,
  fetchInstitutionalOwnership,
  fetchEarningsSurprises,
  type CompanyProfile,
  type CompanyMetrics,
  type CompanyNewsItem,
  type PriceTarget,
  type RecommendationTrend,
  type InsiderTransaction,
  type OptionChainExpiry,
  type InstitutionalHolder,
  type EarningsSurprise,
} from '@/services/market/finnhub-extra';

interface CompanyData {
  ticker: string;
  name: string;
}

interface CompanyEnriched {
  ticker: string;
  name: string;
  quote: MarketQuote | null;
  filings: SecFiling[];
  companyName: string;
  profile: CompanyProfile | null;
  metrics: CompanyMetrics | null;
  peers: string[];
  news: CompanyNewsItem[];
  priceTarget: PriceTarget | null;
  recommendations: RecommendationTrend[];
  insiderTxns: InsiderTransaction[];
  optionChain: OptionChainExpiry[];
  ownership: InstitutionalHolder[];
  earningsSurprises: EarningsSurprise[];
}

const client = new MarketServiceClient('', { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) });

const TABS = ['overview', 'financials', 'forecasts', 'news', 'options', 'holders', 'filings'] as const;
type TabId = typeof TABS[number];

const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview',
  financials: 'Financials',
  forecasts: 'Forecasts',
  news: 'News',
  options: 'Options',
  holders: 'Holders',
  filings: 'Filings',
};

const FILING_TYPE_CLASS: Record<string, string> = {
  '10-K': 'edp-sec-type-badge edp-sec-type-annual',
  '10-Q': 'edp-sec-type-badge edp-sec-type-quarterly',
  '8-K': 'edp-sec-type-badge edp-sec-type-current',
};

function fmtChange(change: number): string {
  return (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
}

function fmtPrice(price: number): string {
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return isoDate;
  }
}

function fmtLargeNumber(value: number): string {
  if (value >= 1e12) return '$' + (value / 1e12).toFixed(2) + 'T';
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return '$' + (value / 1e3).toFixed(1) + 'K';
  return '$' + value.toFixed(0);
}

function fmtShares(value: number): string {
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toFixed(0);
}

function fmtMetric(value: number | undefined, suffix = ''): string {
  if (value === undefined || value === null || isNaN(value)) return '—';
  return value.toFixed(2) + suffix;
}

function fmtPercent(value: number | undefined): string {
  return fmtMetric(value, '%');
}

function injectTradingViewWidget(container: HTMLElement, ticker: string): void {
  const wrap = container.querySelector('.edp-tradingview-widget');
  if (!wrap) return;
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
  script.async = true;
  script.textContent = JSON.stringify({
    symbol: ticker,
    width: '100%',
    height: 220,
    colorTheme: 'dark',
    isTransparent: true,
    dateRange: '1M',
    locale: 'en',
  });
  wrap.appendChild(script);
}

export class CompanyRenderer implements EntityRenderer {
  private activeTab: TabId = 'overview';
  private activeOptionExpiry = 0;
  private newsCategory = 'all';

  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const { ticker, name } = data as CompanyData;
    const container = ctx.el('div', 'edp-generic edp-company-profile');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', name || ticker));
    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge('$' + ticker, 'edp-badge edp-badge-tier'));
    header.append(badgeRow);
    container.append(header);

    // TradingView widget placeholder
    const tvWrap = ctx.el('div', 'edp-tradingview-widget');
    container.append(tvWrap);

    // Quote summary bar (always visible)
    const quoteBar = ctx.el('div', 'cp-quote-bar');
    quoteBar.dataset.slot = 'quote-bar';
    quoteBar.append(ctx.makeLoading('Loading quote…'));
    container.append(quoteBar);

    // Tabs
    const tabBar = ctx.el('div', 'cp-tab-bar');
    for (const tab of TABS) {
      const btn = ctx.el('button', `cp-tab${tab === 'overview' ? ' cp-tab-active' : ''}`);
      btn.textContent = TAB_LABELS[tab];
      btn.dataset.tab = tab;
      tabBar.append(btn);
    }
    container.append(tabBar);

    // Tab content area
    const tabContent = ctx.el('div', 'cp-tab-content');
    tabContent.dataset.slot = 'tab-content';
    tabContent.append(ctx.makeLoading('Loading company data…'));
    container.append(tabContent);

    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<CompanyEnriched> {
    const { ticker, name } = data as CompanyData;

    const [
      quotesResp, filingsResp, profile, metrics, peers, news,
      priceTarget, recommendations, insiderTxns, optionChain, ownership, earningsSurprises,
    ] = await Promise.allSettled([
      client.listMarketQuotes({ symbols: [ticker] }, { signal }),
      client.listSecFilings({ ticker, limit: 30 }, { signal }),
      fetchCompanyProfile(ticker),
      fetchCompanyMetrics(ticker),
      fetchCompanyPeers(ticker),
      fetchCompanyNews(ticker),
      fetchPriceTarget(ticker),
      fetchRecommendationTrends(ticker),
      fetchInsiderTransactions(ticker),
      fetchOptionChain(ticker),
      fetchInstitutionalOwnership(ticker),
      fetchEarningsSurprises(ticker),
    ]);

    const quote = quotesResp.status === 'fulfilled'
      ? (quotesResp.value.quotes.find(q => q.symbol === ticker) ?? quotesResp.value.quotes[0] ?? null)
      : null;
    const filings = filingsResp.status === 'fulfilled' ? filingsResp.value.filings : [];
    const companyName = filingsResp.status === 'fulfilled' ? (filingsResp.value.companyName ?? name) : name;

    return {
      ticker,
      name,
      quote,
      filings,
      companyName,
      profile: profile.status === 'fulfilled' ? profile.value : null,
      metrics: metrics.status === 'fulfilled' ? metrics.value : null,
      peers: peers.status === 'fulfilled' ? peers.value : [],
      news: news.status === 'fulfilled' ? news.value : [],
      priceTarget: priceTarget.status === 'fulfilled' ? priceTarget.value : null,
      recommendations: recommendations.status === 'fulfilled' ? recommendations.value : [],
      insiderTxns: insiderTxns.status === 'fulfilled' ? insiderTxns.value : [],
      optionChain: optionChain.status === 'fulfilled' ? optionChain.value : [],
      ownership: ownership.status === 'fulfilled' ? ownership.value : [],
      earningsSurprises: earningsSurprises.status === 'fulfilled' ? earningsSurprises.value : [],
    };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const data = enrichedData as CompanyEnriched;

    // Inject TradingView widget
    injectTradingViewWidget(container, data.ticker);

    // Update header with company name from profile
    const displayName = data.profile?.name || data.companyName || data.name;
    const titleEl = container.querySelector('.edp-title');
    if (titleEl) titleEl.textContent = displayName;

    // Add logo if available
    if (data.profile?.logo) {
      const header = container.querySelector('.edp-header');
      if (header && !header.querySelector('.cp-logo')) {
        const logo = ctx.el('img', 'cp-logo') as HTMLImageElement;
        logo.src = sanitizeUrl(data.profile.logo);
        logo.alt = displayName;
        logo.onerror = () => logo.remove();
        header.prepend(logo);
      }
    }

    // Render quote bar
    this.renderQuoteBar(container, data, ctx);

    // Render initial tab
    this.activeTab = 'overview';
    this.activeOptionExpiry = 0;
    this.newsCategory = 'all';
    this.renderTabContent(container, data, ctx);

    // Tab click handlers
    const tabBar = container.querySelector('.cp-tab-bar');
    tabBar?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.cp-tab') as HTMLElement | null;
      if (!btn || !btn.dataset.tab) return;
      this.activeTab = btn.dataset.tab as TabId;
      tabBar.querySelectorAll('.cp-tab').forEach(t => t.classList.remove('cp-tab-active'));
      btn.classList.add('cp-tab-active');
      this.renderTabContent(container, data, ctx);
    });
  }

  private renderQuoteBar(container: HTMLElement, data: CompanyEnriched, ctx: EntityRenderContext): void {
    const bar = container.querySelector('[data-slot="quote-bar"]');
    if (!bar) return;
    bar.replaceChildren();

    if (!data.quote) {
      bar.append(ctx.makeEmpty('Quote unavailable'));
      return;
    }

    bar.append(ctx.el('span', 'cp-qb-price', fmtPrice(data.quote.price)));

    const changeClass = data.quote.change >= 0 ? 'cp-qb-change cp-positive' : 'cp-qb-change cp-negative';
    bar.append(ctx.el('span', changeClass, fmtChange(data.quote.change)));

    if (data.profile?.marketCapitalization) {
      bar.append(ctx.el('span', 'cp-qb-meta', 'MCap ' + fmtLargeNumber(data.profile.marketCapitalization * 1e6)));
    }
    if (data.profile?.exchange) {
      bar.append(ctx.el('span', 'cp-qb-meta', data.profile.exchange));
    }
    if (data.quote.sparkline && data.quote.sparkline.length > 1) {
      bar.append(buildSparkline(ctx, data.quote.sparkline, data.quote.change >= 0));
    }
  }

  private renderTabContent(container: HTMLElement, data: CompanyEnriched, ctx: EntityRenderContext): void {
    const content = container.querySelector('[data-slot="tab-content"]');
    if (!content) return;
    content.replaceChildren();

    switch (this.activeTab) {
      case 'overview':   this.renderOverviewTab(content as HTMLElement, data, ctx); break;
      case 'financials': this.renderFinancialsTab(content as HTMLElement, data, ctx); break;
      case 'forecasts':  this.renderForecastsTab(content as HTMLElement, data, ctx); break;
      case 'news':       this.renderNewsTab(content as HTMLElement, data, ctx); break;
      case 'options':    this.renderOptionsTab(content as HTMLElement, data, ctx); break;
      case 'holders':    this.renderHoldersTab(content as HTMLElement, data, ctx); break;
      case 'filings':    this.renderFilingsTab(content as HTMLElement, data, ctx); break;
    }
  }

  // ─── Overview Tab ────────────────────────────────────────────────────────

  private renderOverviewTab(content: HTMLElement, data: CompanyEnriched, ctx: EntityRenderContext): void {
    // About section
    if (data.profile?.description) {
      const [card, body] = ctx.sectionCard('About');
      const about = ctx.el('p', 'cp-about-text', data.profile.description);
      body.append(about);
      content.append(card);
    }

    // Company vitals
    if (data.profile) {
      const [card, body] = ctx.sectionCard('Company Info');
      const stats = ctx.el('div', 'cp-stat-row');

      if (data.profile.ceo) {
        const stat = ctx.el('div', 'cp-stat-item');
        stat.append(ctx.el('span', 'cp-stat-label', 'CEO'));
        stat.append(ctx.el('span', 'cp-stat-value', data.profile.ceo));
        stats.append(stat);
      }
      if (data.profile.employeeTotal) {
        const stat = ctx.el('div', 'cp-stat-item');
        stat.append(ctx.el('span', 'cp-stat-label', 'Employees'));
        stat.append(ctx.el('span', 'cp-stat-value', data.profile.employeeTotal.toLocaleString()));
        stats.append(stat);
      }
      if (stats.children.length > 0) body.append(stats);

      if (data.profile.finnhubIndustry) body.append(row(ctx, 'Industry', data.profile.finnhubIndustry));
      if (data.profile.gicsSector)      body.append(row(ctx, 'Sector', data.profile.gicsSector));
      if (data.profile.country)          body.append(row(ctx, 'Country', data.profile.country));
      if (data.profile.ipo)              body.append(row(ctx, 'IPO Date', fmtDate(data.profile.ipo)));
      if (data.profile.shareOutstanding) body.append(row(ctx, 'Shares Out', data.profile.shareOutstanding.toFixed(2) + 'M'));
      if (data.profile.currency)         body.append(row(ctx, 'Currency', data.profile.currency));

      if (data.profile.weburl) {
        const urlRow = ctx.el('div', 'edp-detail-row');
        urlRow.append(ctx.el('span', 'edp-detail-label', 'Website'));
        const link = ctx.el('a', 'edp-detail-value cp-link') as HTMLAnchorElement;
        link.href = sanitizeUrl(data.profile.weburl);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = data.profile.weburl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        urlRow.append(link);
        body.append(urlRow);
      }

      content.append(card);
    }

    // Key metrics grid
    if (data.metrics) {
      const [card, body] = ctx.sectionCard('Key Metrics');
      const m = data.metrics;
      const grid = ctx.el('div', 'cp-metrics-grid');

      const metrics: [string, string][] = [
        ['P/E',        fmtMetric(m.peBasicExclExtraTTM || m.peAnnual, 'x')],
        ['P/B',        fmtMetric(m.pbAnnual, 'x')],
        ['P/S',        fmtMetric(m.psAnnual, 'x')],
        ['EPS',        fmtMetric(m.epsAnnual)],
        ['ROE',        fmtPercent(m.roeRfy)],
        ['ROA',        fmtPercent(m.roaRfy)],
        ['Div Yield',  fmtPercent(m.dividendYieldIndicatedAnnual)],
        ['Beta',       fmtMetric(m.beta)],
        ['52W High',   m['52WeekHigh'] ? fmtPrice(m['52WeekHigh']) : '—'],
        ['52W Low',    m['52WeekLow'] ? fmtPrice(m['52WeekLow']) : '—'],
        ['D/E',        fmtMetric(m.totalDebtToEquityAnnual)],
        ['Current R.', fmtMetric(m.currentRatioAnnual)],
      ];

      for (const [label, value] of metrics) {
        const cell = ctx.el('div', 'cp-metric-cell');
        cell.append(ctx.el('span', 'cp-metric-label', label));
        cell.append(ctx.el('span', 'cp-metric-value', value));
        grid.append(cell);
      }

      body.append(grid);
      content.append(card);
    }

    // Margins card
    if (data.metrics) {
      const m = data.metrics;
      const hasMargins = m.grossMarginAnnual || m.operatingMarginAnnual || m.netProfitMarginAnnual;
      if (hasMargins) {
        const [card, body] = ctx.sectionCard('Margins & Growth');
        const items: [string, number | undefined][] = [
          ['Gross Margin',        m.grossMarginAnnual],
          ['Operating Margin',    m.operatingMarginAnnual],
          ['Net Margin',          m.netProfitMarginAnnual],
          ['Revenue Growth (YoY)', m.revenueGrowthTTMYoy],
          ['EPS Growth (YoY)',     m.epsGrowthTTMYoy],
        ];
        for (const [label, val] of items) {
          if (val === undefined || val === null) continue;
          const barRow = ctx.el('div', 'cp-margin-row');
          barRow.append(ctx.el('span', 'cp-margin-label', label));
          const barWrap = ctx.el('div', 'cp-margin-bar-wrap');
          const bar = ctx.el('div', val >= 0 ? 'cp-margin-bar cp-positive' : 'cp-margin-bar cp-negative');
          bar.style.width = Math.min(Math.abs(val), 100) + '%';
          barWrap.append(bar);
          barRow.append(barWrap);
          barRow.append(ctx.el('span', 'cp-margin-value', fmtPercent(val)));
          body.append(barRow);
        }
        content.append(card);
      }
    }

    // Peers
    if (data.peers.length > 0) {
      const [card, body] = ctx.sectionCard('Peers');
      const peersWrap = ctx.el('div', 'cp-peers');
      for (const peer of data.peers.slice(0, 12)) {
        const chip = ctx.el('button', 'cp-peer-chip');
        chip.textContent = peer;
        chip.addEventListener('click', () => {
          document.dispatchEvent(new CustomEvent('wm:open-entity-detail', {
            detail: { type: 'company', data: { ticker: peer, name: peer } },
          }));
        });
        peersWrap.append(chip);
      }
      body.append(peersWrap);
      content.append(card);
    }
  }

  // ─── Financials Tab ──────────────────────────────────────────────────────

  private renderFinancialsTab(content: HTMLElement, data: CompanyEnriched, ctx: EntityRenderContext): void {
    if (!data.metrics) {
      content.append(ctx.makeEmpty('Financial data unavailable'));
      return;
    }
    const m = data.metrics;

    const [valCard, valBody] = ctx.sectionCard('Valuation');
    const valMetrics: [string, string][] = [
      ['P/E (TTM)',       fmtMetric(m.peBasicExclExtraTTM, 'x')],
      ['P/E (Annual)',    fmtMetric(m.peAnnual, 'x')],
      ['P/B',            fmtMetric(m.pbAnnual, 'x')],
      ['P/S',            fmtMetric(m.psAnnual, 'x')],
      ['EV/FCF',         fmtMetric(m['currentEv/freeCashFlowAnnual'])],
      ['Book Value/Shr', m.bookValuePerShareAnnual ? fmtPrice(m.bookValuePerShareAnnual) : '—'],
    ];
    for (const [label, value] of valMetrics) valBody.append(row(ctx, label, value));
    content.append(valCard);

    const [profCard, profBody] = ctx.sectionCard('Profitability');
    const profMetrics: [string, string][] = [
      ['EPS (Annual)',     fmtMetric(m.epsAnnual)],
      ['Revenue/Share',   m.revenuePerShareAnnual ? fmtPrice(m.revenuePerShareAnnual) : '—'],
      ['ROE',             fmtPercent(m.roeRfy)],
      ['ROA',             fmtPercent(m.roaRfy)],
      ['ROI',             fmtPercent(m.roiAnnual)],
      ['Gross Margin',    fmtPercent(m.grossMarginAnnual)],
      ['Op. Margin',      fmtPercent(m.operatingMarginAnnual)],
      ['Net Margin',      fmtPercent(m.netProfitMarginAnnual)],
    ];
    for (const [label, value] of profMetrics) profBody.append(row(ctx, label, value));
    content.append(profCard);

    const [bsCard, bsBody] = ctx.sectionCard('Balance Sheet');
    const bsMetrics: [string, string][] = [
      ['Debt/Equity',   fmtMetric(m.totalDebtToEquityAnnual)],
      ['Current Ratio', fmtMetric(m.currentRatioAnnual)],
      ['FCF/Share',     m.freeCashFlowPerShareAnnual ? fmtPrice(m.freeCashFlowPerShareAnnual) : '—'],
    ];
    for (const [label, value] of bsMetrics) bsBody.append(row(ctx, label, value));
    content.append(bsCard);

    const [growCard, growBody] = ctx.sectionCard('Growth');
    growBody.append(row(ctx, 'Revenue Growth (YoY)', fmtPercent(m.revenueGrowthTTMYoy)));
    growBody.append(row(ctx, 'EPS Growth (YoY)', fmtPercent(m.epsGrowthTTMYoy)));
    content.append(growCard);

    // Earnings surprises
    if (data.earningsSurprises.length > 0) {
      const [esCard, esBody] = ctx.sectionCard('Earnings Surprises');
      const table = ctx.el('div', 'cp-earnings-table');
      const hdr = ctx.el('div', 'cp-earnings-row cp-earnings-hdr');
      hdr.append(ctx.el('span', '', 'Period'));
      hdr.append(ctx.el('span', '', 'Actual'));
      hdr.append(ctx.el('span', '', 'Est.'));
      hdr.append(ctx.el('span', '', 'Surprise'));
      table.append(hdr);
      for (const es of data.earningsSurprises.slice(0, 6)) {
        const r2 = ctx.el('div', 'cp-earnings-row');
        r2.append(ctx.el('span', 'cp-earnings-period', es.period));
        r2.append(ctx.el('span', 'cp-earnings-val', fmtMetric(es.actual)));
        r2.append(ctx.el('span', 'cp-earnings-val', fmtMetric(es.estimate)));
        const surpriseClass = (es.surprisePercent ?? 0) >= 0 ? 'cp-earnings-surprise cp-positive' : 'cp-earnings-surprise cp-negative';
        r2.append(ctx.el('span', surpriseClass, fmtChange(es.surprisePercent ?? 0)));
        table.append(r2);
      }
      esBody.append(table);
      content.append(esCard);
    }

    if (m.dividendYieldIndicatedAnnual) {
      const [divCard, divBody] = ctx.sectionCard('Dividends');
      divBody.append(row(ctx, 'Dividend Yield', fmtPercent(m.dividendYieldIndicatedAnnual)));
      content.append(divCard);
    }
  }

  // ─── Forecasts Tab ───────────────────────────────────────────────────────

  private renderForecastsTab(content: HTMLElement, data: CompanyEnriched, ctx: EntityRenderContext): void {
    // Price target visualization
    if (data.priceTarget && data.quote?.price) {
      const [card, body] = ctx.sectionCard('Price Target');
      const pt = data.priceTarget;
      const currentPrice = data.quote.price;

      // Build visual gauge
      const gauge = buildPriceTargetGauge(ctx, currentPrice, pt.targetLow, pt.targetMean, pt.targetHigh);
      body.append(gauge);

      // Stats row below gauge
      const statsRow = ctx.el('div', 'cp-forecast-stats');
      const items: [string, string, string][] = [
        ['Low',    fmtPrice(pt.targetLow),    'cp-negative'],
        ['Mean',   fmtPrice(pt.targetMean),   ''],
        ['Median', fmtPrice(pt.targetMedian), ''],
        ['High',   fmtPrice(pt.targetHigh),   'cp-positive'],
      ];
      for (const [label, value, cls] of items) {
        const item = ctx.el('div', 'cp-forecast-stat-item');
        item.append(ctx.el('span', 'cp-forecast-stat-label', label));
        item.append(ctx.el('span', `cp-forecast-stat-value ${cls}`.trim(), value));
        statsRow.append(item);
      }
      body.append(statsRow);

      // Upside from current
      const upside = ((pt.targetMean - currentPrice) / currentPrice) * 100;
      const upsideRow = ctx.el('div', 'edp-detail-row');
      upsideRow.append(ctx.el('span', 'edp-detail-label', 'Implied Upside (Mean)'));
      upsideRow.append(ctx.el('span',
        upside >= 0 ? 'edp-detail-value cp-positive' : 'edp-detail-value cp-negative',
        fmtChange(upside)));
      body.append(upsideRow);

      if (pt.lastUpdated) {
        body.append(ctx.el('div', 'cp-forecast-updated', 'Updated ' + fmtDate(pt.lastUpdated)));
      }

      content.append(card);
    } else if (data.priceTarget) {
      const [card, body] = ctx.sectionCard('Price Target');
      body.append(row(ctx, 'Mean Target', fmtPrice(data.priceTarget.targetMean)));
      body.append(row(ctx, 'High', fmtPrice(data.priceTarget.targetHigh)));
      body.append(row(ctx, 'Low', fmtPrice(data.priceTarget.targetLow)));
      content.append(card);
    }

    // Analyst consensus
    if (data.recommendations.length > 0) {
      const [card, body] = ctx.sectionCard('Analyst Consensus');
      const latest = data.recommendations[0]!;
      const total = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;

      if (total > 0) {
        // Summary counts
        const buys = latest.strongBuy + latest.buy;
        const sells = latest.sell + latest.strongSell;
        const summaryRow = ctx.el('div', 'cp-consensus-summary');
        summaryRow.append(buildConsensusCount(ctx, buys, 'Buy', 'cp-positive'));
        summaryRow.append(buildConsensusCount(ctx, latest.hold, 'Hold', 'cp-neutral'));
        summaryRow.append(buildConsensusCount(ctx, sells, 'Sell', 'cp-negative'));
        body.append(summaryRow);

        // Rating bar
        const ratingBar = ctx.el('div', 'cp-rating-bar');
        const segments: [number, string, string][] = [
          [latest.strongBuy,  '#16a34a', 'Strong Buy'],
          [latest.buy,        '#22c55e', 'Buy'],
          [latest.hold,       '#eab308', 'Hold'],
          [latest.sell,       '#f97316', 'Sell'],
          [latest.strongSell, '#ef4444', 'Strong Sell'],
        ];
        for (const [count, color, label] of segments) {
          if (count === 0) continue;
          const seg = ctx.el('div', 'cp-rating-segment');
          seg.style.width = ((count / total) * 100) + '%';
          seg.style.backgroundColor = color;
          seg.title = `${label}: ${count}`;
          seg.textContent = String(count);
          ratingBar.append(seg);
        }
        body.append(ratingBar);

        // Legend
        const legend = ctx.el('div', 'cp-rating-legend');
        const entries: [string, number, string][] = [
          ['Strong Buy',  latest.strongBuy,  '#16a34a'],
          ['Buy',         latest.buy,         '#22c55e'],
          ['Hold',        latest.hold,        '#eab308'],
          ['Sell',        latest.sell,        '#f97316'],
          ['Strong Sell', latest.strongSell,  '#ef4444'],
        ];
        for (const [label, count, color] of entries) {
          const item = ctx.el('div', 'cp-rating-legend-item');
          const dot = ctx.el('span', 'cp-rating-dot');
          dot.style.backgroundColor = color;
          item.append(dot);
          item.append(ctx.el('span', '', `${label} (${count})`));
          legend.append(item);
        }
        body.append(legend);
      }

      // Historical trend
      if (data.recommendations.length > 1) {
        body.append(ctx.el('div', 'cp-trend-title', 'Historical Consensus'));
        for (const rec of data.recommendations.slice(0, 6)) {
          const tTotal = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
          if (tTotal === 0) continue;
          const tRow = ctx.el('div', 'cp-trend-row');
          tRow.append(ctx.el('span', 'cp-trend-period', rec.period));
          const miniBar = ctx.el('div', 'cp-rating-bar cp-rating-bar-mini');
          const segs: [number, string][] = [
            [rec.strongBuy,  '#16a34a'],
            [rec.buy,        '#22c55e'],
            [rec.hold,       '#eab308'],
            [rec.sell,       '#f97316'],
            [rec.strongSell, '#ef4444'],
          ];
          for (const [c, col] of segs) {
            if (c === 0) continue;
            const s = ctx.el('div', 'cp-rating-segment');
            s.style.width = ((c / tTotal) * 100) + '%';
            s.style.backgroundColor = col;
            miniBar.append(s);
          }
          tRow.append(miniBar);
          body.append(tRow);
        }
      }

      content.append(card);
    }

    // Insider transactions
    if (data.insiderTxns.length > 0) {
      const [card, body] = ctx.sectionCard('Recent Insider Activity');
      for (const tx of data.insiderTxns.slice(0, 8)) {
        const txRow = ctx.el('div', 'cp-insider-row');
        const isPurchase = tx.transactionCode === 'P';
        const isSale = tx.transactionCode === 'S';
        txRow.append(ctx.el('div', 'cp-insider-name', tx.name));
        const details = ctx.el('div', 'cp-insider-details');
        const typeLabel = isPurchase ? 'Buy' : isSale ? 'Sale' : tx.transactionCode;
        details.append(ctx.el('span',
          isPurchase ? 'cp-insider-badge cp-positive' : isSale ? 'cp-insider-badge cp-negative' : 'cp-insider-badge',
          typeLabel));
        if (tx.transactionValue) {
          details.append(ctx.el('span', 'cp-insider-val', fmtLargeNumber(Math.abs(tx.transactionValue))));
        }
        details.append(ctx.el('span', 'cp-insider-date', tx.transactionDate));
        txRow.append(details);
        body.append(txRow);
      }
      content.append(card);
    }

    if (!data.priceTarget && data.recommendations.length === 0 && data.insiderTxns.length === 0) {
      content.append(ctx.makeEmpty('No forecast data available'));
    }
  }

  // ─── News Tab ────────────────────────────────────────────────────────────

  private renderNewsTab(content: HTMLElement, data: CompanyEnriched, ctx: EntityRenderContext): void {
    if (data.news.length === 0) {
      content.append(ctx.makeEmpty('No recent news'));
      return;
    }

    // Collect unique categories
    const categories = ['all', ...Array.from(new Set(data.news.map(n => n.category).filter(Boolean)))];

    // Category filter bar
    const filterBar = ctx.el('div', 'cp-news-cats');
    for (const cat of categories.slice(0, 8)) {
      const chip = ctx.el('button', `cp-news-cat-chip${cat === this.newsCategory ? ' cp-news-cat-active' : ''}`);
      chip.textContent = cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1);
      chip.dataset.cat = cat;
      filterBar.append(chip);
    }
    content.append(filterBar);

    // News list container
    const listWrap = ctx.el('div', '');
    listWrap.dataset.slot = 'news-list';
    content.append(listWrap);

    const renderList = (category: string) => {
      listWrap.replaceChildren();
      const filtered = category === 'all' ? data.news : data.news.filter(n => n.category === category);
      if (filtered.length === 0) {
        listWrap.append(ctx.makeEmpty('No news in this category'));
        return;
      }
      const [card, body] = ctx.sectionCard('');
      (card.querySelector('.edp-section-card-title') as HTMLElement | null)?.remove();
      for (const item of filtered.slice(0, 25)) {
        const newsRow = ctx.el('div', 'cp-news-row');
        if (item.image) {
          const img = ctx.el('img', 'cp-news-img') as HTMLImageElement;
          img.src = sanitizeUrl(item.image);
          img.alt = '';
          img.loading = 'lazy';
          img.onerror = () => img.remove();
          newsRow.append(img);
        }
        const info = ctx.el('div', 'cp-news-info');
        const headline = ctx.el('a', 'cp-news-headline') as HTMLAnchorElement;
        headline.textContent = item.headline;
        if (item.url) {
          headline.href = sanitizeUrl(item.url);
          headline.target = '_blank';
          headline.rel = 'noopener noreferrer';
          applyArticleLinkDataset(headline, {
            url: item.url,
            title: item.headline,
            source: item.source,
            publishedAt: new Date(item.datetime * 1000),
          });
        }
        info.append(headline);
        const meta = ctx.el('div', 'cp-news-meta');
        meta.append(ctx.el('span', 'cp-news-source', item.source));
        meta.append(ctx.el('span', 'cp-news-date', fmtDate(new Date(item.datetime * 1000).toISOString())));
        info.append(meta);
        if (item.summary) {
          info.append(ctx.el('p', 'cp-news-summary', item.summary.slice(0, 150) + (item.summary.length > 150 ? '…' : '')));
        }
        newsRow.append(info);
        body.append(newsRow);
      }
      listWrap.append(card);
    };

    renderList(this.newsCategory);

    filterBar.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest('.cp-news-cat-chip') as HTMLElement | null;
      if (!chip || !chip.dataset.cat) return;
      this.newsCategory = chip.dataset.cat;
      filterBar.querySelectorAll('.cp-news-cat-chip').forEach(c => c.classList.remove('cp-news-cat-active'));
      chip.classList.add('cp-news-cat-active');
      renderList(this.newsCategory);
    });
  }

  // ─── Options Tab ─────────────────────────────────────────────────────────

  private renderOptionsTab(content: HTMLElement, data: CompanyEnriched, ctx: EntityRenderContext): void {
    if (data.optionChain.length === 0) {
      content.append(ctx.makeEmpty('Options data unavailable'));
      return;
    }

    const currentPrice = data.quote?.price ?? 0;

    // Expiry selector
    const expiryBar = ctx.el('div', 'cp-options-expiry-bar');
    for (let i = 0; i < Math.min(data.optionChain.length, 8); i++) {
      const expiry = data.optionChain[i]!;
      const btn = ctx.el('button', `cp-options-expiry-btn${i === this.activeOptionExpiry ? ' cp-options-expiry-active' : ''}`);
      btn.textContent = formatExpiry(expiry.expirationDate);
      btn.dataset.idx = String(i);
      expiryBar.append(btn);
    }
    content.append(expiryBar);

    // Chain container
    const chainWrap = ctx.el('div', '');
    chainWrap.dataset.slot = 'options-chain';
    content.append(chainWrap);

    const renderChain = (idx: number) => {
      chainWrap.replaceChildren();
      const expiry = data.optionChain[idx];
      if (!expiry) return;

      // Build strike map: merge calls and puts by strike
      const strikeMap = new Map<number, { call?: typeof expiry.calls[0]; put?: typeof expiry.puts[0] }>();
      for (const c of expiry.calls) {
        strikeMap.set(c.strike, { call: c });
      }
      for (const p of expiry.puts) {
        const existing = strikeMap.get(p.strike) ?? {};
        strikeMap.set(p.strike, { ...existing, put: p });
      }

      // Sort strikes, filter to 10 nearest the current price
      const allStrikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);
      const nearStrikes = currentPrice > 0
        ? allStrikes.sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice)).slice(0, 16).sort((a, b) => a - b)
        : allStrikes.slice(0, 16);

      const table = ctx.el('div', 'cp-options-table');

      // Header
      const hdr = ctx.el('div', 'cp-options-row cp-options-hdr');
      for (const h of ['Bid', 'Ask', 'IV%', 'Vol', 'CALLS']) hdr.append(ctx.el('span', 'cp-options-hdr-call', h));
      hdr.append(ctx.el('span', 'cp-options-strike-hdr', 'Strike'));
      for (const h of ['PUTS', 'Bid', 'Ask', 'IV%', 'Vol']) hdr.append(ctx.el('span', 'cp-options-hdr-put', h));
      table.append(hdr);

      for (const strike of nearStrikes) {
        const entry = strikeMap.get(strike)!;
        const isAtm = currentPrice > 0 && Math.abs(strike - currentPrice) / currentPrice < 0.02;
        const r2 = ctx.el('div', `cp-options-row${isAtm ? ' cp-options-atm' : ''}`);

        // Call side
        if (entry.call) {
          r2.append(ctx.el('span', 'cp-options-cell cp-options-call', fmtMetric(entry.call.bid)));
          r2.append(ctx.el('span', 'cp-options-cell cp-options-call', fmtMetric(entry.call.ask)));
          r2.append(ctx.el('span', 'cp-options-cell cp-options-call', fmtPercent(entry.call.impliedVolatility * 100)));
          r2.append(ctx.el('span', 'cp-options-cell cp-options-call cp-options-vol', entry.call.volume ? String(entry.call.volume) : '—'));
        } else {
          for (let j = 0; j < 4; j++) r2.append(ctx.el('span', 'cp-options-cell cp-options-call', '—'));
        }

        // Strike
        const strikeEl = ctx.el('span', 'cp-options-strike', fmtPrice(strike));
        if (entry.call?.inTheMoney) strikeEl.classList.add('cp-options-itm-call');
        if (entry.put?.inTheMoney) strikeEl.classList.add('cp-options-itm-put');
        r2.append(strikeEl);

        // Put side
        if (entry.put) {
          r2.append(ctx.el('span', 'cp-options-cell cp-options-put', fmtMetric(entry.put.bid)));
          r2.append(ctx.el('span', 'cp-options-cell cp-options-put', fmtMetric(entry.put.ask)));
          r2.append(ctx.el('span', 'cp-options-cell cp-options-put', fmtPercent(entry.put.impliedVolatility * 100)));
          r2.append(ctx.el('span', 'cp-options-cell cp-options-put cp-options-vol', entry.put.volume ? String(entry.put.volume) : '—'));
        } else {
          for (let j = 0; j < 4; j++) r2.append(ctx.el('span', 'cp-options-cell cp-options-put', '—'));
        }

        table.append(r2);
      }

      chainWrap.append(table);
    };

    renderChain(this.activeOptionExpiry);

    expiryBar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.cp-options-expiry-btn') as HTMLElement | null;
      if (!btn || !btn.dataset.idx) return;
      this.activeOptionExpiry = parseInt(btn.dataset.idx, 10);
      expiryBar.querySelectorAll('.cp-options-expiry-btn').forEach(b => b.classList.remove('cp-options-expiry-active'));
      btn.classList.add('cp-options-expiry-active');
      renderChain(this.activeOptionExpiry);
    });
  }

  // ─── Holders Tab ─────────────────────────────────────────────────────────

  private renderHoldersTab(content: HTMLElement, data: CompanyEnriched, ctx: EntityRenderContext): void {
    if (data.ownership.length === 0) {
      content.append(ctx.makeEmpty('Institutional ownership data unavailable'));
      return;
    }

    const [card, body] = ctx.sectionCard('Top Institutional Holders');

    // Header
    const hdr = ctx.el('div', 'cp-holders-row cp-holders-hdr');
    hdr.append(ctx.el('span', 'cp-holders-name', 'Institution'));
    hdr.append(ctx.el('span', 'cp-holders-shares', 'Shares'));
    hdr.append(ctx.el('span', 'cp-holders-pct', '%'));
    hdr.append(ctx.el('span', 'cp-holders-change', 'Change'));
    body.append(hdr);

    const maxShares = Math.max(...data.ownership.map(h => h.share));

    for (const holder of data.ownership) {
      const r2 = ctx.el('div', 'cp-holders-row');

      const nameWrap = ctx.el('div', 'cp-holders-name-wrap');
      nameWrap.append(ctx.el('div', 'cp-holders-name', holder.name));

      // Mini bar showing relative size
      const barWrap = ctx.el('div', 'cp-holders-bar-wrap');
      const bar = ctx.el('div', 'cp-holders-bar');
      bar.style.width = ((holder.share / maxShares) * 100) + '%';
      barWrap.append(bar);
      nameWrap.append(barWrap);

      r2.append(nameWrap);
      r2.append(ctx.el('span', 'cp-holders-shares', fmtShares(holder.share)));
      r2.append(ctx.el('span', 'cp-holders-pct', fmtMetric(holder.percent, '%')));

      const changeClass = holder.change >= 0 ? 'cp-holders-change cp-positive' : 'cp-holders-change cp-negative';
      r2.append(ctx.el('span', changeClass, (holder.change >= 0 ? '+' : '') + fmtShares(Math.abs(holder.change))));

      body.append(r2);
    }

    const dateNote = data.ownership[0]?.filingDate
      ? ctx.el('div', 'cp-holders-note', 'Based on 13F filings as of ' + fmtDate(data.ownership[0].filingDate))
      : null;
    if (dateNote) body.append(dateNote);

    content.append(card);
  }

  // ─── Filings Tab ─────────────────────────────────────────────────────────

  private renderFilingsTab(content: HTMLElement, data: CompanyEnriched, ctx: EntityRenderContext): void {
    if (data.filings.length === 0) {
      content.append(ctx.makeEmpty('No filings found'));
      return;
    }

    // Group filings by year
    const byYear = new Map<string, SecFiling[]>();
    for (const filing of data.filings) {
      const year = filing.filedAt ? filing.filedAt.slice(0, 4) : 'Unknown';
      const arr = byYear.get(year) ?? [];
      arr.push(filing);
      byYear.set(year, arr);
    }

    // Sort years descending
    const years = Array.from(byYear.keys()).sort((a, b) => b.localeCompare(a));

    for (const year of years) {
      const [card, body] = ctx.sectionCard(year);
      for (const filing of byYear.get(year)!) {
        body.append(buildFilingRow(ctx, filing));
      }
      content.append(card);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPriceTargetGauge(
  ctx: EntityRenderContext,
  current: number,
  low: number,
  mean: number,
  high: number,
): HTMLElement {
  const wrap = ctx.el('div', 'cp-forecast-gauge');
  const rangeMin = Math.min(current, low) * 0.97;
  const rangeMax = Math.max(current, high) * 1.03;
  const span = rangeMax - rangeMin;

  const toPos = (v: number) => ((v - rangeMin) / span * 100).toFixed(1) + '%';

  // Track
  const track = ctx.el('div', 'cp-forecast-track');

  // Analyst range fill (low → high)
  const fill = ctx.el('div', 'cp-forecast-fill');
  const fillLeft = ((low - rangeMin) / span * 100);
  const fillWidth = ((high - low) / span * 100);
  fill.style.left = fillLeft.toFixed(1) + '%';
  fill.style.width = fillWidth.toFixed(1) + '%';
  track.append(fill);

  // Mean marker
  const meanMarker = ctx.el('div', 'cp-forecast-marker cp-forecast-mean');
  meanMarker.style.left = toPos(mean);
  meanMarker.title = 'Mean: ' + fmtPrice(mean);
  track.append(meanMarker);

  // Current price marker
  const currMarker = ctx.el('div', 'cp-forecast-marker cp-forecast-current');
  currMarker.style.left = toPos(current);
  currMarker.title = 'Current: ' + fmtPrice(current);
  track.append(currMarker);

  wrap.append(track);

  // Labels
  const labels = ctx.el('div', 'cp-forecast-labels');
  const lLow = ctx.el('div', 'cp-forecast-lbl');
  lLow.style.left = toPos(low);
  lLow.append(ctx.el('span', 'cp-forecast-lbl-val cp-negative', fmtPrice(low)));
  lLow.append(ctx.el('span', 'cp-forecast-lbl-name', 'Low'));
  labels.append(lLow);

  const lMean = ctx.el('div', 'cp-forecast-lbl');
  lMean.style.left = toPos(mean);
  lMean.append(ctx.el('span', 'cp-forecast-lbl-val', fmtPrice(mean)));
  lMean.append(ctx.el('span', 'cp-forecast-lbl-name', 'Mean'));
  labels.append(lMean);

  const lHigh = ctx.el('div', 'cp-forecast-lbl');
  lHigh.style.left = toPos(high);
  lHigh.append(ctx.el('span', 'cp-forecast-lbl-val cp-positive', fmtPrice(high)));
  lHigh.append(ctx.el('span', 'cp-forecast-lbl-name', 'High'));
  labels.append(lHigh);

  const lCurr = ctx.el('div', 'cp-forecast-lbl cp-forecast-lbl-current');
  lCurr.style.left = toPos(current);
  lCurr.append(ctx.el('span', 'cp-forecast-lbl-val', fmtPrice(current)));
  lCurr.append(ctx.el('span', 'cp-forecast-lbl-name', 'Price'));
  labels.append(lCurr);

  wrap.append(labels);
  return wrap;
}

function buildConsensusCount(ctx: EntityRenderContext, count: number, label: string, cls: string): HTMLElement {
  const el = ctx.el('div', 'cp-consensus-count');
  el.append(ctx.el('span', `cp-consensus-num ${cls}`, String(count)));
  el.append(ctx.el('span', 'cp-consensus-lbl', label));
  return el;
}

function formatExpiry(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return dateStr;
  }
}

function buildSparkline(ctx: EntityRenderContext, data: number[], positive: boolean): HTMLElement {
  const wrap = ctx.el('div', 'edp-sparkline-wrap cp-qb-sparkline');
  const W = 120, H = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '120');
  svg.setAttribute('height', String(H));
  svg.style.display = 'block';
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', pts);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', positive ? '#22c55e' : '#ef4444');
  polyline.setAttribute('stroke-width', '1.5');
  svg.appendChild(polyline);
  wrap.appendChild(svg);
  return wrap;
}

function buildFilingRow(ctx: EntityRenderContext, filing: SecFiling): HTMLElement {
  const r = ctx.el('div', 'edp-sec-filing');

  const typeClass = FILING_TYPE_CLASS[filing.filingType ?? ''] ?? 'edp-sec-type-badge';
  r.append(ctx.el('span', typeClass, filing.filingType ?? ''));

  const info = ctx.el('div', 'edp-sec-filing-info');
  info.append(ctx.el('div', 'edp-sec-filing-title', filing.title || filing.filingType || ''));
  info.append(ctx.el('div', 'edp-sec-filing-meta', fmtDate(filing.filedAt ?? '')));
  r.append(info);

  if (filing.url) {
    const link = document.createElement('a');
    link.className = 'edp-sec-filing-link';
    link.href = sanitizeUrl(filing.url);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '↗';
    link.title = 'View on EDGAR';
    r.append(link);
  }

  return r;
}
