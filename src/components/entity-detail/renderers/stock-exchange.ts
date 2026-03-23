import type { StockExchange } from '@/config/finance-geo';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

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

    // Live open/closed
    const open = isMarketOpen(ex);
    badgeRow.append(ctx.badge(open ? 'OPEN' : 'CLOSED', open ? 'edp-badge edp-badge-status' : 'edp-badge edp-badge-dim'));
    header.append(badgeRow);
    container.append(header);

    // Description
    if (ex.description) container.append(ctx.el('p', 'edp-description', ex.description));

    // Market cap highlight
    if (ex.marketCap != null) {
      const highlight = ctx.el('div', 'edp-stat-highlight');
      highlight.style.marginBottom = '12px';
      const val = ctx.el('div', 'edp-stat-highlight-value',
        ex.marketCap >= 1 ? `$${ex.marketCap.toFixed(1)}T` : `$${(ex.marketCap * 1000).toFixed(0)}B`);
      const lbl = ctx.el('div', 'edp-stat-highlight-label', 'Market Capitalization');
      highlight.append(val, lbl);
      container.append(highlight);
    }

    // Trading info
    const [tradingCard, tradingBody] = ctx.sectionCard('Trading Info');
    if (ex.tradingHours) tradingBody.append(row(ctx, 'Trading Hours', ex.tradingHours));
    if (ex.timezone) tradingBody.append(row(ctx, 'Timezone', ex.timezone));
    tradingBody.append(row(ctx, 'City', `${ex.city}, ${ex.country}`));
    container.append(tradingCard);

    return container;
  }
}
