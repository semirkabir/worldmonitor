import type { StockExchange } from '@/config/finance-geo';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';
import { MarketServiceClient } from '@/generated/client/worldmonitor/market/v1/service_client';
import type { MarketQuote, SectorPerformance } from '@/generated/client/worldmonitor/market/v1/service_client';
import { lookupEntityByAlias } from '@/services/entity-index';

const client = new MarketServiceClient('', { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) });

// Representative symbols per exchange (Yahoo Finance format)
const EXCHANGE_SYMBOLS: Record<string, string[]> = {
  // US
  nyse:      ['JPM', 'BAC', 'WMT', 'JNJ', 'PG', 'XOM', 'CVX', 'KO', 'WFC', 'C', 'GS', 'HD', 'UNH', 'MCD', 'MMM', 'AXP', 'CAT', 'BA', 'DIS', 'PFE', 'VZ', 'IBM', 'MRK', 'T', 'GE'],
  nasdaq:    ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'COST', 'ADBE', 'CSCO', 'NFLX', 'PEP', 'INTC', 'AMD', 'QCOM', 'INTU', 'AMAT', 'MU', 'PYPL'],
  // Europe
  lse:       ['AZN.L', 'HSBA.L', 'SHEL.L', 'BP.L', 'ULVR.L', 'RIO.L', 'GSK.L', 'LLOY.L', 'VOD.L', 'DGE.L'],
  xetra:     ['SAP.DE', 'SIE.DE', 'ALV.DE', 'BMW.DE', 'MBG.DE', 'BAS.DE', 'DTE.DE', 'ADS.DE', 'MUV2.DE', 'BAYN.DE'],
  euronext:  ['ASML.AS', 'MC.PA', 'TTE.PA', 'BNP.PA', 'AI.PA', 'OR.PA', 'SAN.PA', 'KER.PA', 'CS.PA', 'LOR.PA'],
  six:       ['ROG.SW', 'NESN.SW', 'NOVN.SW', 'ABBN.SW', 'UBSG.SW', 'ZURN.SW', 'SREN.SW', 'LONN.SW', 'SIKA.SW', 'GIVN.SW'],
  // Asia-Pacific
  jpx:       ['7203.T', '9984.T', '8306.T', '6758.T', '9432.T', '8058.T', '6861.T', '4661.T', '8035.T', '9433.T'],
  hkex:      ['0700.HK', '9988.HK', '0005.HK', '0941.HK', '2318.HK', '1299.HK', '0003.HK', '0388.HK', '1810.HK', '2020.HK'],
  sse:       ['600519.SS', '601398.SS', '600036.SS', '601318.SS', '600900.SS', '601988.SS', '600276.SS', '601166.SS', '600030.SS', '600028.SS'],
  szse:      ['000858.SZ', '000333.SZ', '002415.SZ', '300750.SZ', '000002.SZ', '000651.SZ', '001289.SZ', '002594.SZ', '000568.SZ', '300059.SZ'],
  krx:       ['005930.KS', '000660.KS', '035420.KS', '005490.KS', '051910.KS', '006400.KS', '035720.KS', '003550.KS', '096770.KS', '028260.KS'],
  twse:      ['2330.TW', '2317.TW', '2454.TW', '2308.TW', '2412.TW', '2882.TW', '1301.TW', '2303.TW', '2881.TW', '1303.TW'],
  asx:       ['BHP.AX', 'CBA.AX', 'CSL.AX', 'ANZ.AX', 'WBC.AX', 'NAB.AX', 'WES.AX', 'MQG.AX', 'RIO.AX', 'FMG.AX'],
  sgx:       ['D05.SI', 'O39.SI', 'U11.SI', 'Z74.SI', 'C6L.SI', 'V03.SI', 'BN4.SI', 'Y92.SI', 'C38U.SI', 'A17U.SI'],
  // South Asia
  'nse-india': ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS', 'HINDUNILVR.NS', 'SBIN.NS', 'BAJFINANCE.NS', 'BHARTIARTL.NS', 'KOTAKBANK.NS'],
  'bse-india': ['RELIANCE.BO', 'TCS.BO', 'HDFCBANK.BO', 'INFY.BO', 'ICICIBANK.BO', 'HINDUNILVR.BO', 'SBIN.BO', 'BAJFINANCE.BO', 'BHARTIARTL.BO', 'KOTAKBANK.BO'],
  // Middle East
  tadawul:   ['2222.SR', '1180.SR', '2010.SR', '2380.SR', '1010.SR', '2050.SR', '2090.SR', '1020.SR', '1211.SR', '4001.SR'],
  tase:      ['ESLT.TA', 'NICE.TA', 'CHKP.TA', 'CEVA.TA', 'WIXCOM.TA', 'ICL.TA', 'TEVA.TA', 'BEZQ.TA', 'PERI.TA', 'FTAL.TA'],
  // Americas
  tsx:       ['RY.TO', 'TD.TO', 'ENB.TO', 'CNR.TO', 'BNS.TO', 'BMO.TO', 'CP.TO', 'SU.TO', 'ABX.TO', 'TRP.TO'],
  b3:        ['PETR4.SA', 'VALE3.SA', 'ITUB4.SA', 'BBDC4.SA', 'ABEV3.SA', 'WEGE3.SA', 'BBAS3.SA', 'SUZB3.SA', 'RENT3.SA', 'EGIE3.SA'],
  bmv:       ['AMXL.MX', 'FEMSAUBD.MX', 'GMEXICOB.MX', 'WALMEX*.MX', 'BIMBOA.MX', 'GFINBURO.MX', 'CEMEXCPO.MX', 'TLEVISACPO.MX', 'KOFL.MX', 'ALSEA*.MX'],
  // Africa
  jse:       ['NPN.JO', 'PRX.JO', 'ABG.JO', 'SBK.JO', 'FSR.JO', 'NED.JO', 'BTI.JO', 'AGL.JO', 'SOL.JO', 'MTN.JO'],
  // Southeast Asia
  idx:       ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'BMRI.JK', 'ASII.JK', 'UNVR.JK', 'PGAS.JK', 'EXCL.JK', 'ICBP.JK', 'KLBF.JK'],
  set:       ['PTT.BK', 'CPALL.BK', 'ADVANC.BK', 'SCB.BK', 'BBL.BK', 'KBANK.BK', 'SCC.BK', 'PTTEP.BK', 'TOP.BK', 'AWC.BK'],
  // Other emerging
  moex:      ['SBER.ME', 'GAZP.ME', 'LKOH.ME', 'NVTK.ME', 'YNDX.ME', 'MGNT.ME', 'ROSN.ME', 'TATN.ME', 'GMKN.ME', 'ALRS.ME'],
};

// Sector ETF labels
const SECTOR_LABELS: Record<string, string> = {
  XLK: 'Tech', XLF: 'Finance', XLE: 'Energy', XLV: 'Health',
  XLY: 'Cons.Disc', XLI: 'Industl', XLP: 'Staples', XLU: 'Utilities',
  XLB: 'Materials', XLRE: 'Real Est.', XLC: 'Comm.', SMH: 'Semis',
};

function isMarketOpen(exchange: StockExchange): boolean {
  if (!exchange.tradingHours || !exchange.timezone) return false;
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: exchange.timezone,
      hour: 'numeric', minute: 'numeric', hour12: false,
    });
    const [hours, minutes] = formatter.format(now).split(':').map(Number) as [number, number];
    const nowMins = (hours ?? 0) * 60 + (minutes ?? 0);
    const match = exchange.tradingHours.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
    if (!match) return false;
    const openMins = parseInt(match[1]!) * 60 + parseInt(match[2]!);
    const closeMins = parseInt(match[3]!) * 60 + parseInt(match[4]!);
    return nowMins >= openMins && nowMins < closeMins;
  } catch {
    return false;
  }
}

function changeColor(pct: number): string {
  const abs = Math.min(Math.abs(pct), 5);
  const intensity = Math.round((abs / 5) * 180);
  return pct >= 0
    ? `rgba(34,197,94,${0.15 + (intensity / 255) * 0.55})`
    : `rgba(239,68,68,${0.15 + (intensity / 255) * 0.55})`;
}

function changeTextColor(pct: number): string {
  return pct >= 0 ? '#22c55e' : '#ef4444';
}

function fmtChange(pct: number): string {
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

interface ExchangeEnriched {
  exchange: StockExchange;
  quotes: MarketQuote[];
  sectors: SectorPerformance[];
}

export class StockExchangeRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const ex = data as StockExchange;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', ex.shortName || ex.name));
    if (ex.shortName && ex.shortName !== ex.name) {
      header.append(ctx.el('div', 'edp-subtitle', ex.name));
    }
    header.append(ctx.el('div', 'edp-subtitle', `${ex.city}, ${ex.country}`));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    const tierClass = ex.tier === 'mega' ? 'edp-badge edp-badge-severity'
      : ex.tier === 'major' ? 'edp-badge edp-badge-tier'
        : 'edp-badge';
    badgeRow.append(ctx.badge(ex.tier.toUpperCase(), tierClass));
    const open = isMarketOpen(ex);
    badgeRow.append(ctx.badge(open ? 'OPEN' : 'CLOSED', open ? 'edp-badge edp-badge-status' : 'edp-badge edp-badge-dim'));
    header.append(badgeRow);
    container.append(header);

    if (ex.description) container.append(ctx.el('p', 'edp-description', ex.description));

    if (ex.marketCap != null) {
      const highlight = ctx.el('div', 'edp-stat-highlight');
      highlight.style.marginBottom = '12px';
      const val = ctx.el('div', 'edp-stat-highlight-value',
        ex.marketCap >= 1 ? `$${ex.marketCap.toFixed(1)}T` : `$${(ex.marketCap * 1000).toFixed(0)}B`);
      const lbl = ctx.el('div', 'edp-stat-highlight-label', 'Market Capitalization');
      highlight.append(val, lbl);
      container.append(highlight);
    }

    // Movers loading
    const [moversCard, moversBody] = ctx.sectionCard('Top Movers');
    moversCard.dataset.slot = 'movers';
    moversBody.append(ctx.makeLoading('Loading market data…'));
    container.append(moversCard);

    // Sector loading
    const [sectorCard, sectorBody] = ctx.sectionCard('Sector Performance');
    sectorCard.dataset.slot = 'sectors';
    sectorBody.append(ctx.makeLoading('Loading sectors…'));
    container.append(sectorCard);

    // Trading info
    const [tradingCard, tradingBody] = ctx.sectionCard('Trading Info');
    if (ex.tradingHours) tradingBody.append(row(ctx, 'Trading Hours', ex.tradingHours));
    if (ex.timezone) tradingBody.append(row(ctx, 'Timezone', ex.timezone));
    tradingBody.append(row(ctx, 'Location', `${ex.city}, ${ex.country}`));
    container.append(tradingCard);

    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<ExchangeEnriched> {
    const exchange = data as StockExchange;
    const symbols = EXCHANGE_SYMBOLS[exchange.id] ?? [];

    const [quotesRes, sectorsRes] = await Promise.allSettled([
      symbols.length > 0
        ? client.listMarketQuotes({ symbols }, { signal })
        : Promise.resolve({ quotes: [], finnhubSkipped: false, skipReason: '', rateLimited: false }),
      client.getSectorSummary({ period: '1d' }, { signal }),
    ]);

    const quotes = quotesRes.status === 'fulfilled' ? quotesRes.value.quotes : [];
    const sectors = sectorsRes.status === 'fulfilled' ? sectorsRes.value.sectors : [];

    return { exchange, quotes, sectors };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const { quotes, sectors } = enrichedData as ExchangeEnriched;

    // Replace movers card
    const moversBody = container.querySelector('[data-slot="movers"] .edp-card-body');
    const sectorBody = container.querySelector('[data-slot="sectors"] .edp-card-body');

    if (moversBody) {
      moversBody.replaceChildren();
      if (quotes.length === 0) {
        moversBody.append(ctx.makeEmpty('No market data available'));
      } else {
        const sorted = [...quotes].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
        const gainers = sorted.filter(q => q.change > 0).slice(0, 5);
        const losers = sorted.filter(q => q.change < 0).slice(0, 5);

        if (gainers.length > 0) {
          moversBody.append(buildMoversSection(ctx, 'Top Gainers', gainers));
        }
        if (losers.length > 0) {
          moversBody.append(buildMoversSection(ctx, 'Top Losers', losers));
        }
        if (gainers.length === 0 && losers.length === 0) {
          moversBody.append(buildHeatmapGrid(sorted.slice(0, 20)));
        }
      }
    }

    if (sectorBody) {
      sectorBody.replaceChildren();
      if (sectors.length === 0) {
        sectorBody.append(ctx.makeEmpty('Sector data unavailable'));
      } else {
        sectorBody.append(buildSectorHeatmap(sectors));
      }
    }
  }
}

function buildMoversSection(ctx: EntityRenderContext, label: string, quotes: MarketQuote[]): HTMLElement {
  const wrap = ctx.el('div', 'edp-movers-group');
  wrap.append(ctx.el('div', 'edp-movers-label', label));
  wrap.append(buildHeatmapGrid(quotes));
  return wrap;
}

function buildHeatmapGrid(quotes: MarketQuote[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'edp-movers-grid';

  for (const q of quotes) {
    // Strip exchange suffix for lookup (e.g. "AAPL" from "AAPL", bare for US)
    const bareSymbol = q.symbol.split('.')[0]!;
    const entity = lookupEntityByAlias(bareSymbol) ?? lookupEntityByAlias(q.symbol);

    const cell = document.createElement('div');
    cell.style.background = changeColor(q.change);

    if (entity) {
      // Clickable — opens company detail panel via global ticker-link delegation
      cell.className = 'edp-mover-cell ticker-link';
      cell.dataset.ticker = entity.id;
      cell.dataset.name = entity.name;
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.title = entity.name;
    } else {
      cell.className = 'edp-mover-cell';
    }

    const sym = document.createElement('div');
    sym.className = 'edp-mover-sym';
    sym.textContent = q.display || bareSymbol;

    const pct = document.createElement('div');
    pct.className = 'edp-mover-pct';
    pct.style.color = changeTextColor(q.change);
    pct.textContent = fmtChange(q.change);

    cell.append(sym, pct);
    grid.append(cell);
  }

  return grid;
}

function buildSectorHeatmap(sectors: SectorPerformance[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'edp-movers-grid';

  for (const s of sectors) {
    const cell = document.createElement('div');
    cell.className = 'edp-mover-cell';
    cell.style.background = changeColor(s.change);

    const sym = document.createElement('div');
    sym.className = 'edp-mover-sym';
    sym.textContent = SECTOR_LABELS[s.symbol] ?? s.symbol;

    const pct = document.createElement('div');
    pct.className = 'edp-mover-pct';
    pct.style.color = changeTextColor(s.change);
    pct.textContent = fmtChange(s.change);

    cell.append(sym, pct);
    grid.append(cell);
  }

  return grid;
}
