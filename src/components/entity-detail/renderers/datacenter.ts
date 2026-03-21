import type { AIDataCenter } from '@/types';
import type { EntityRenderer, EntityRenderContext } from '../types';

function row(ctx: EntityRenderContext, label: string, value: string): HTMLElement {
  const r = ctx.el('div', 'edp-detail-row');
  r.append(ctx.el('span', 'edp-detail-label', label));
  r.append(ctx.el('span', 'edp-detail-value', value));
  return r;
}

export class DatacenterRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const dc = data as AIDataCenter;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', dc.name));
    header.append(ctx.el('div', 'edp-subtitle', `${dc.owner} · ${dc.country}`));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    const statusClass = dc.status === 'existing' ? 'edp-badge edp-badge-status'
      : dc.status === 'planned' ? 'edp-badge edp-badge-warning'
        : 'edp-badge edp-badge-dim';
    badgeRow.append(ctx.badge(dc.status.toUpperCase(), statusClass));
    if (dc.sector) badgeRow.append(ctx.badge(dc.sector, 'edp-badge'));
    header.append(badgeRow);
    container.append(header);

    // Note
    if (dc.note) container.append(ctx.el('p', 'edp-description', dc.note));

    // Stats grid
    const grid = ctx.el('div', 'edp-stat-grid');

    if (dc.chipCount) {
      const stat = ctx.el('div', 'edp-stat-highlight');
      stat.append(ctx.el('div', 'edp-stat-highlight-value', dc.chipCount.toLocaleString()));
      stat.append(ctx.el('div', 'edp-stat-highlight-label', dc.chipType || 'Chips'));
      grid.append(stat);
    }
    if (dc.powerMW) {
      const stat = ctx.el('div', 'edp-stat-highlight');
      stat.append(ctx.el('div', 'edp-stat-highlight-value', `${dc.powerMW} MW`));
      stat.append(ctx.el('div', 'edp-stat-highlight-label', 'Power Capacity'));
      grid.append(stat);
    }
    if (grid.childElementCount > 0) container.append(grid);

    // Details
    const [detailCard, detailBody] = ctx.sectionCard('Details');
    detailBody.append(row(ctx, 'Owner', dc.owner));
    detailBody.append(row(ctx, 'Country', dc.country));
    detailBody.append(row(ctx, 'Chip Type', dc.chipType));
    if (dc.h100Equivalent) detailBody.append(row(ctx, 'H100 Equivalent', dc.h100Equivalent.toLocaleString()));
    if (dc.sector) detailBody.append(row(ctx, 'Sector', dc.sector));
    container.append(detailCard);

    return container;
  }
}
