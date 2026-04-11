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

function buildSparklineSvg(sparkline: number[], positive: boolean): SVGSVGElement {
  const W = 360, H = 120;
  const min = Math.min(...sparkline);
  const max = Math.max(...sparkline);
  const range = max - min || Math.max(Math.abs(max) * 0.04, 1);
  const pX = 8, pY = 8;
  const stroke = positive ? '#22c55e' : '#ef4444';

  const pts = sparkline.map((v, i) => {
    const x = pX + (i / (sparkline.length - 1)) * (W - pX * 2);
    const y = H - pY - ((v - min) / range) * (H - pY * 2);
    return { x, y };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const areaPath = `${linePath} L ${last.x.toFixed(1)} ${H - pY} L ${first.x.toFixed(1)} ${H - pY} Z`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '120');
  svg.style.display = 'block';

  // Gradient
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'crypto-edp-fill');
  grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
  const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', stroke);
  stop1.setAttribute('stop-opacity', '0.3');
  const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', stroke);
  stop2.setAttribute('stop-opacity', '0.02');
  grad.append(stop1, stop2);
  defs.append(grad);
  svg.append(defs);

  // Area fill
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('d', areaPath);
  area.setAttribute('fill', 'url(#crypto-edp-fill)');
  svg.append(area);

  // Line
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', linePath);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', stroke);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linecap', 'round');
  svg.append(line);

  // Last price dot
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', last.x.toFixed(1));
  dot.setAttribute('cy', last.y.toFixed(1));
  dot.setAttribute('r', '4');
  dot.setAttribute('fill', stroke);
  svg.append(dot);

  return svg;
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

    // Sparkline chart
    const sparkline = coin.sparkline ?? [];
    if (sparkline.length >= 2) {
      const [chartCard, chartBody] = ctx.sectionCard('7-Day Chart');
      const chartWrap = ctx.el('div', 'crypto-edp-chart-wrap');
      chartWrap.append(buildSparklineSvg(sparkline, positive));
      chartBody.append(chartWrap);

      // Range labels
      const low = Math.min(...sparkline);
      const high = Math.max(...sparkline);
      const rangeRow = ctx.el('div', 'crypto-edp-range');
      rangeRow.append(ctx.el('span', 'crypto-edp-range-low', 'Low: ' + formatCryptoPrice(low)));
      rangeRow.append(ctx.el('span', 'crypto-edp-range-high', 'High: ' + formatCryptoPrice(high)));
      chartBody.append(rangeRow);
      container.append(chartCard);

      // Stats grid
      const [statsCard, statsBody] = ctx.sectionCard('7-Day Stats');
      const grid = ctx.el('div', 'crypto-edp-stats-grid');

      const momentum = sparkline.length >= 2
        ? ((sparkline[sparkline.length - 1]! - sparkline[0]!) / (sparkline[0] || 1)) * 100
        : coin.change;
      const volatility = ((high - low) / (low || 1)) * 100;

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
