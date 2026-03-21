import type { Port } from '@/config/ports';
import type { EntityRenderer, EntityRenderContext } from '../types';

const PORT_TYPE_LABELS: Record<string, string> = {
  container: 'Container Port',
  oil: 'Oil Terminal',
  lng: 'LNG Terminal',
  naval: 'Naval Base',
  mixed: 'Mixed Port',
  bulk: 'Bulk Terminal',
};

function row(ctx: EntityRenderContext, label: string, value: string): HTMLElement {
  const r = ctx.el('div', 'edp-detail-row');
  r.append(ctx.el('span', 'edp-detail-label', label));
  r.append(ctx.el('span', 'edp-detail-value', value));
  return r;
}

export class PortRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const port = data as Port;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', port.name));
    header.append(ctx.el('div', 'edp-subtitle', port.country));
    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(PORT_TYPE_LABELS[port.type] ?? port.type, 'edp-badge'));
    if (port.rank != null) badgeRow.append(ctx.badge(`RANK #${port.rank}`, 'edp-badge edp-badge-tier'));
    header.append(badgeRow);
    container.append(header);

    // Note as description
    if (port.note) {
      container.append(ctx.el('p', 'edp-description', port.note));
    }

    // Details
    const [detailCard, detailBody] = ctx.sectionCard('Port Info');
    detailBody.append(row(ctx, 'Country', port.country));
    detailBody.append(row(ctx, 'Type', PORT_TYPE_LABELS[port.type] ?? port.type));
    if (port.rank != null) detailBody.append(row(ctx, 'World Rank', `#${port.rank}`));
    detailBody.append(row(ctx, 'Coordinates', `${port.lat.toFixed(4)}°, ${port.lon.toFixed(4)}°`));
    container.append(detailCard);

    return container;
  }
}
