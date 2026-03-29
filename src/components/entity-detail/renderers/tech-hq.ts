import type { TechHQ } from '@/config/tech-geo';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

export class TechHQRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const hq = data as TechHQ;
    const container = ctx.el('div', 'edp-generic');

    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', hq.company));
    header.append(ctx.el('div', 'edp-subtitle', `${hq.city}, ${hq.country}`));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    const typeClass = hq.type === 'faang'
      ? 'edp-badge edp-badge-severity'
      : hq.type === 'unicorn' ? 'edp-badge edp-badge-tier' : 'edp-badge';
    badgeRow.append(ctx.badge(hq.type.toUpperCase(), typeClass));
    header.append(badgeRow);
    container.append(header);

    const [card, body] = ctx.sectionCard('Details');
    body.append(row(ctx, 'City', hq.city));
    body.append(row(ctx, 'Country', hq.country));
    if (hq.employees != null) body.append(row(ctx, 'Employees', hq.employees.toLocaleString()));
    if (hq.marketCap != null) body.append(row(ctx, 'Market Cap', hq.marketCap));
    container.append(card);

    return container;
  }
}
