import type { EntityRenderer, EntityRenderContext } from '../types';

interface CryptoData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  sparkline?: number[];
}

function formatCryptoPrice(price: number): string {
  if (!Number.isFinite(price)) return '—';
  const abs = Math.abs(price);
  const maxFrac = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  const minFrac = maxFrac === 0 ? 0 : Math.min(maxFrac, abs >= 1 ? 2 : maxFrac);
  return '$' + price.toLocaleString(undefined, { minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac });
}

function getCryptoOutlook(change: number): string {
  if (change >= 6)  return 'Breakout momentum';
  if (change >= 2)  return 'Bullish session';
  if (change > 0)   return 'Grinding higher';
  if (change <= -6) return 'Heavy selloff';
  if (change <= -2) return 'Pullback in motion';
  if (Math.abs(change) <= 0.5) return 'Range-bound trade';
  return 'Pressure building';
}

function toTradingViewSymbol(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s === 'BTC') return 'BINANCE:BTCUSDT';
  if (s === 'ETH') return 'BINANCE:ETHUSDT';
  if (s === 'SOL') return 'BINANCE:SOLUSDT';
  if (s === 'BNB') return 'BINANCE:BNBUSDT';
  if (s === 'XRP') return 'BINANCE:XRPUSDT';
  if (s === 'ADA') return 'BINANCE:ADAUSDT';
  if (s === 'DOGE') return 'BINANCE:DOGEUSDT';
  if (s === 'DOT') return 'BINANCE:DOTUSDT';
  if (s === 'AVAX') return 'BINANCE:AVAXUSDT';
  if (s === 'MATIC' || s === 'POL') return 'BINANCE:MATICUSDT';
  if (s === 'LINK') return 'BINANCE:LINKUSDT';
  if (s === 'UNI') return 'BINANCE:UNIUSDT';
  if (s === 'LTC') return 'BINANCE:LTCUSDT';
  if (s === 'ATOM') return 'BINANCE:ATOMUSDT';
  if (s === 'NEAR') return 'BINANCE:NEARUSDT';
  if (s === 'APT') return 'BINANCE:APTUSDT';
  if (s === 'ARB') return 'BINANCE:ARBUSDT';
  if (s === 'OP') return 'BINANCE:OPUSDT';
  if (s === 'FIL') return 'BINANCE:FILUSDT';
  if (s === 'TRX') return 'BINANCE:TRXUSDT';
  return `BINANCE:${s}USDT`;
}

function injectTradingViewWidget(container: HTMLElement, symbol: string): void {
  const wrap = container.querySelector('.edp-tradingview-widget');
  if (!wrap) return;
  const tvSymbol = toTradingViewSymbol(symbol);
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
  script.async = true;
  script.textContent = JSON.stringify({
    symbol: tvSymbol,
    width: '100%',
    height: 220,
    colorTheme: 'dark',
    isTransparent: true,
    dateRange: '1M',
    locale: 'en',
  });
  wrap.appendChild(script);
}

export class CryptoRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const coin = data as CryptoData;
    const positive = coin.change >= 0;
    const stroke = positive ? '#22c55e' : '#ef4444';

    const container = ctx.el('div', 'edp-generic edp-crypto-detail');

    // Header
    const header = ctx.el('div', 'edp-header');
    const badge = ctx.el('div', 'crypto-edp-badge');
    badge.textContent = coin.symbol.slice(0, 5).toUpperCase();
    header.append(badge);
    header.append(ctx.el('h2', 'edp-title', coin.name));
    const sub = ctx.el('div', 'crypto-edp-subtitle');
    sub.textContent = coin.symbol.toUpperCase() + ' · Crypto';
    header.append(sub);
    container.append(header);

    // TradingView chart widget placeholder
    const tvWrap = ctx.el('div', 'edp-tradingview-widget');
    container.append(tvWrap);

    // Price hero
    const hero = ctx.el('div', 'crypto-edp-hero');
    hero.append(ctx.el('span', 'crypto-edp-price', formatCryptoPrice(coin.price)));
    const pill = ctx.el('span', `crypto-edp-pill ${positive ? 'crypto-edp-positive' : 'crypto-edp-negative'}`);
    pill.textContent = (positive ? '+' : '') + coin.change.toFixed(2) + '% 24h';
    hero.append(pill);
    container.append(hero);

    // Outlook
    const outlook = ctx.el('div', `crypto-edp-outlook ${positive ? 'crypto-edp-positive' : 'crypto-edp-negative'}`);
    outlook.textContent = getCryptoOutlook(coin.change);
    container.append(outlook);

    // Inject TradingView widget
    injectTradingViewWidget(container, coin.symbol);

    // 7-Day Stats (if sparkline data available)
    const sparkline = coin.sparkline ?? [];
    if (sparkline.length >= 2) {
      const low = Math.min(...sparkline);
      const high = Math.max(...sparkline);
      const momentum = sparkline.length >= 2
        ? ((sparkline[sparkline.length - 1]! - sparkline[0]!) / (sparkline[0] || 1)) * 100
        : coin.change;
      const volatility = ((high - low) / (low || 1)) * 100;

      const [statsCard, statsBody] = ctx.sectionCard('7-Day Stats');
      const grid = ctx.el('div', 'crypto-edp-stats-grid');

      const statItems: [string, string, string][] = [
        ['7d Low',        formatCryptoPrice(low),              ''],
        ['7d High',       formatCryptoPrice(high),             ''],
        ['7d Momentum',   (momentum >= 0 ? '+' : '') + momentum.toFixed(2) + '%', momentum >= 0 ? 'crypto-edp-positive' : 'crypto-edp-negative'],
        ['Range Volatility', volatility.toFixed(2) + '%',      ''],
      ];

      for (const [label, value, cls] of statItems) {
        const cell = ctx.el('div', 'crypto-edp-stat-cell');
        cell.append(ctx.el('span', 'crypto-edp-stat-label', label));
        cell.append(ctx.el('span', `crypto-edp-stat-value ${cls}`.trim(), value));
        grid.append(cell);
      }

      statsBody.append(grid);
      container.append(statsCard);
    }

    // Current price card
    const [priceCard, priceBody] = ctx.sectionCard('Price Info');
    priceBody.append(buildRow(ctx, 'Current Price', formatCryptoPrice(coin.price)));
    priceBody.append(buildRow(ctx, '24h Change', (positive ? '+' : '') + coin.change.toFixed(2) + '%', stroke));
    container.append(priceCard);

    return container;
  }
}

function buildRow(ctx: EntityRenderContext, label: string, value: string, color?: string): HTMLElement {
  const r = ctx.el('div', 'edp-detail-row');
  r.append(ctx.el('span', 'edp-detail-label', label));
  const val = ctx.el('span', 'edp-detail-value', value);
  if (color) val.style.color = color;
  r.append(val);
  return r;
}
