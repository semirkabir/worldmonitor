import { MarketServiceClient } from '@/generated/client/worldmonitor/market/v1/service_client';
import type { MarketQuote, SecFiling } from '@/generated/client/worldmonitor/market/v1/service_client';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';
import { sanitizeUrl } from '@/utils/sanitize';

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
}

const client = new MarketServiceClient('', { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) });

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
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const { ticker, name } = data as CompanyData;
    const container = ctx.el('div', 'edp-generic');

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

    // Stock quote loading
    const [quoteCard, quoteBody] = ctx.sectionCard('Market Data');
    quoteCard.dataset.slot = 'quote';
    quoteBody.append(ctx.makeLoading('Loading quote…'));
    container.append(quoteCard);

    // SEC filings loading
    const [filingsCard, filingsBody] = ctx.sectionCard('SEC Filings');
    filingsCard.dataset.slot = 'filings';
    filingsBody.append(ctx.makeLoading('Loading filings…'));
    container.append(filingsCard);

    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<CompanyEnriched> {
    const { ticker, name } = data as CompanyData;

    const [quotesResp, filingsResp] = await Promise.allSettled([
      client.listMarketQuotes({ symbols: [ticker] }, { signal }),
      client.listSecFilings({ ticker, limit: 10 }, { signal }),
    ]);

    const quote = quotesResp.status === 'fulfilled'
      ? (quotesResp.value.quotes.find(q => q.symbol === ticker) ?? quotesResp.value.quotes[0] ?? null)
      : null;

    const filings = filingsResp.status === 'fulfilled' ? filingsResp.value.filings : [];
    const companyName = filingsResp.status === 'fulfilled' ? filingsResp.value.companyName : name;

    return { ticker, name, quote, filings, companyName };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const { ticker, name, quote, filings, companyName } = enrichedData as CompanyEnriched;

    // Inject TradingView widget now that the container is in the DOM
    injectTradingViewWidget(container, ticker);

    // Replace quote card content
    const quoteBody = container.querySelector('[data-slot="quote"] .edp-card-body');
    if (quoteBody) {
      quoteBody.replaceChildren();
      if (quote) {
        const displayName = companyName || name || quote.name;
        if (displayName) quoteBody.append(row(ctx, 'Company', displayName));
        quoteBody.append(row(ctx, 'Price', fmtPrice(quote.price)));

        const changeEl = ctx.el('div', 'edp-detail-row');
        changeEl.append(ctx.el('span', 'edp-detail-label', 'Change'));
        const changeVal = ctx.el('span',
          quote.change >= 0 ? 'edp-detail-value edp-positive' : 'edp-detail-value edp-negative',
          fmtChange(quote.change));
        changeEl.append(changeVal);
        quoteBody.append(changeEl);

        if (quote.sparkline && quote.sparkline.length > 1) {
          quoteBody.append(buildSparkline(ctx, quote.sparkline, quote.change >= 0));
        }
      } else {
        quoteBody.append(ctx.makeEmpty('Quote unavailable'));
      }
    }

    // Replace filings card content
    const filingsBody = container.querySelector('[data-slot="filings"] .edp-card-body');
    if (filingsBody) {
      filingsBody.replaceChildren();
      if (filings.length === 0) {
        filingsBody.append(ctx.makeEmpty('No filings found'));
      } else {
        for (const filing of filings) {
          filingsBody.append(buildFilingRow(ctx, filing));
        }
      }
    }
  }
}

function buildSparkline(ctx: EntityRenderContext, data: number[], positive: boolean): HTMLElement {
  const wrap = ctx.el('div', 'edp-sparkline-wrap');
  const W = 200, H = 40;
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
  svg.setAttribute('width', '100%');
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
  const row = ctx.el('div', 'edp-sec-filing');

  const typeClass = FILING_TYPE_CLASS[filing.filingType] ?? 'edp-sec-type-badge';
  const typeBadge = ctx.el('span', typeClass, filing.filingType);
  row.append(typeBadge);

  const info = ctx.el('div', 'edp-sec-filing-info');
  const title = ctx.el('div', 'edp-sec-filing-title', filing.title || filing.filingType);
  const meta = ctx.el('div', 'edp-sec-filing-meta', fmtDate(filing.filedAt));
  info.append(title, meta);
  row.append(info);

  if (filing.url) {
    const link = document.createElement('a');
    link.className = 'edp-sec-filing-link';
    link.href = sanitizeUrl(filing.url);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '↗';
    link.title = 'View on EDGAR';
    row.append(link);
  }

  return row;
}
