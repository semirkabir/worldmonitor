import type { MilitaryBaseEnriched } from '@/types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const BASE_TYPE_LABELS: Record<string, string> = {
  'US': 'US Military', 'NATO': 'NATO', 'Russia': 'Russian Military',
  'China': 'Chinese Military', 'UK': 'British Military', 'France': 'French Military',
  'Israel': 'Israeli Military', 'Iran': 'Iranian Military',
};

function row(ctx: EntityRenderContext, label: string, value: string): HTMLElement {
  const r = ctx.el('div', 'edp-detail-row');
  r.append(ctx.el('span', 'edp-detail-label', label));
  r.append(ctx.el('span', 'edp-detail-value', value));
  return r;
}

export class MilitaryBaseRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const base = data as MilitaryBaseEnriched;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', base.name));
    if (base.country) header.append(ctx.el('div', 'edp-subtitle', base.country));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    const typeLabel = BASE_TYPE_LABELS[base.type] ?? base.type;
    badgeRow.append(ctx.badge(typeLabel, 'edp-badge'));
    if (base.status) {
      const statusClass = base.status === 'active' ? 'edp-badge edp-badge-status'
        : base.status === 'planned' ? 'edp-badge edp-badge-warning'
          : 'edp-badge edp-badge-dim';
      badgeRow.append(ctx.badge(base.status.toUpperCase(), statusClass));
    }
    header.append(badgeRow);
    container.append(header);

    // Description
    if (base.description) container.append(ctx.el('p', 'edp-description', base.description));

    // Details
    const [detailCard, detailBody] = ctx.sectionCard('Base Info');
    if (base.country) detailBody.append(row(ctx, 'Country', base.country));
    if (base.arm) detailBody.append(row(ctx, 'Branch', base.arm));
    if (base.status) detailBody.append(row(ctx, 'Status', base.status));
    detailBody.append(row(ctx, 'Coordinates', `${base.lat.toFixed(4)}°, ${base.lon.toFixed(4)}°`));
    container.append(detailCard);

    // Capabilities (enriched)
    const enriched = base as MilitaryBaseEnriched;
    const caps: string[] = [];
    if (enriched.catAirforce) caps.push('Air Force');
    if (enriched.catNaval) caps.push('Naval');
    if (enriched.catNuclear) caps.push('Nuclear');
    if (enriched.catSpace) caps.push('Space');
    if (enriched.catTraining) caps.push('Training');

    if (caps.length > 0) {
      const [capCard, capBody] = ctx.sectionCard('Capabilities');
      const tags = ctx.el('div', 'edp-tags');
      for (const cap of caps) {
        const cls = cap === 'Nuclear' ? 'edp-tag edp-badge-nuclear' : 'edp-tag';
        tags.append(ctx.badge(cap, cls));
      }
      capBody.append(tags);
      container.append(capCard);
    }

    return container;
  }
}
