import type { Pipeline } from '@/types';
import type { EntityRenderer, EntityRenderContext } from '../types';

function row(ctx: EntityRenderContext, label: string, value: string): HTMLElement {
  const r = ctx.el('div', 'edp-detail-row');
  r.append(ctx.el('span', 'edp-detail-label', label));
  r.append(ctx.el('span', 'edp-detail-value', value));
  return r;
}

const PIPELINE_DESC: Record<string, string> = {
  oil: 'Crude oil pipeline transporting petroleum between production fields and terminals.',
  gas: 'Natural gas pipeline providing energy transport infrastructure.',
  products: 'Refined petroleum products pipeline (gasoline, diesel, jet fuel).',
};

export class PipelineRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const pipeline = data as Pipeline;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', pipeline.name));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(pipeline.type.toUpperCase(), 'edp-badge'));
    const statusClass = pipeline.status === 'operating' ? 'edp-badge edp-badge-status' : 'edp-badge edp-badge-warning';
    badgeRow.append(ctx.badge(pipeline.status.toUpperCase(), statusClass));
    header.append(badgeRow);
    container.append(header);

    // Description
    container.append(ctx.el('p', 'edp-description', PIPELINE_DESC[pipeline.type] ?? 'Energy infrastructure pipeline.'));

    // Details
    const [detailCard, detailBody] = ctx.sectionCard('Pipeline Info');
    if (pipeline.operator) detailBody.append(row(ctx, 'Operator', pipeline.operator));
    if (pipeline.capacity) detailBody.append(row(ctx, 'Capacity', pipeline.capacity));
    if (pipeline.capacityMbpd) detailBody.append(row(ctx, 'Capacity', `${pipeline.capacityMbpd} Mbpd`));
    if (pipeline.capacityBcmY) detailBody.append(row(ctx, 'Capacity', `${pipeline.capacityBcmY} BCM/yr`));
    if (pipeline.length) detailBody.append(row(ctx, 'Length', pipeline.length));
    container.append(detailCard);

    // Route
    if (pipeline.origin || pipeline.destination) {
      const [routeCard, routeBody] = ctx.sectionCard('Route');
      if (pipeline.origin) {
        const origin = [pipeline.origin.name, pipeline.origin.country].filter(Boolean).join(', ');
        routeBody.append(row(ctx, 'Origin', origin));
      }
      if (pipeline.destination) {
        const dest = [pipeline.destination.name, pipeline.destination.country].filter(Boolean).join(', ');
        routeBody.append(row(ctx, 'Destination', dest));
      }
      if (pipeline.transitCountries && pipeline.transitCountries.length > 0) {
        rowTags(ctx, routeBody, 'Transit', pipeline.transitCountries);
      }
      container.append(routeCard);
    } else if (pipeline.countries && pipeline.countries.length > 0) {
      const [routeCard, routeBody] = ctx.sectionCard('Countries');
      const tags = ctx.el('div', 'edp-tags');
      for (const c of pipeline.countries) tags.append(ctx.badge(c, 'edp-tag'));
      routeBody.append(tags);
      container.append(routeCard);
    }

    return container;
  }
}

function rowTags(ctx: EntityRenderContext, body: HTMLElement, label: string, items: string[]): void {
  const r = ctx.el('div', 'edp-detail-row');
  r.append(ctx.el('span', 'edp-detail-label', label));
  const tags = ctx.el('div', 'edp-tags');
  for (const item of items) tags.append(ctx.badge(item, 'edp-tag'));
  r.append(tags);
  body.append(r);
}
