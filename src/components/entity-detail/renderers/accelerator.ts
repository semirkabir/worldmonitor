import type { Accelerator } from '@/config/tech-geo';
import { row, rowTags } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const TYPE_LABELS: Record<Accelerator['type'], string> = {
  accelerator: 'Accelerator',
  incubator: 'Incubator',
  studio: 'Startup Studio',
};

export class AcceleratorRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const acc = data as Accelerator;
    const container = ctx.el('div', 'edp-generic');

    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', acc.name));
    header.append(ctx.el('div', 'edp-subtitle', `${acc.city}, ${acc.country}`));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(TYPE_LABELS[acc.type].toUpperCase(), 'edp-badge edp-badge-tier'));
    header.append(badgeRow);
    container.append(header);

    const [overviewCard, overviewBody] = ctx.sectionCard('Details');
    overviewBody.append(row(ctx, 'City', acc.city));
    overviewBody.append(row(ctx, 'Country', acc.country));
    overviewBody.append(row(ctx, 'Type', TYPE_LABELS[acc.type]));
    if (acc.founded != null) overviewBody.append(row(ctx, 'Founded', String(acc.founded)));
    overviewBody.append(row(ctx, 'Coordinates', `${acc.lat.toFixed(4)}°, ${acc.lon.toFixed(4)}°`));
    if (acc.notable?.length) {
      rowTags(ctx, overviewBody, 'Notable Alumni', acc.notable);
    }
    container.append(overviewCard);

    return container;
  }
}
