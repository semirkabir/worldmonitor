import type { NuclearFacility, NuclearFacilityType } from '@/types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const TYPE_LABELS: Record<NuclearFacilityType, string> = {
  plant: 'Nuclear Power Plant',
  enrichment: 'Uranium Enrichment Facility',
  reprocessing: 'Plutonium Reprocessing Facility',
  weapons: 'Nuclear Weapons Design / Assembly',
  ssbn: 'Nuclear Submarine Base',
  'test-site': 'Nuclear Test Site',
  icbm: 'ICBM Silo Field',
  research: 'Research Reactor',
};

const TYPE_DESC: Record<NuclearFacilityType, string> = {
  plant: 'Civilian nuclear power generation facility providing electricity to the national grid.',
  enrichment: 'Facility for enriching uranium for use in nuclear reactors or weapons programs.',
  reprocessing: 'Facility that reprocesses spent nuclear fuel to recover plutonium.',
  weapons: 'Nuclear weapons design, assembly, or storage installation.',
  ssbn: 'Naval base supporting nuclear-armed ballistic missile submarines.',
  'test-site': 'Historical or active nuclear weapons test site.',
  icbm: 'Intercontinental ballistic missile silo field.',
  research: 'Research reactor facility for scientific and medical isotope production.',
};

function row(ctx: EntityRenderContext, label: string, value: string): HTMLElement {
  const r = ctx.el('div', 'edp-detail-row');
  r.append(ctx.el('span', 'edp-detail-label', label));
  r.append(ctx.el('span', 'edp-detail-value', value));
  return r;
}

export class NuclearRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const facility = data as NuclearFacility;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', facility.name));
    if (facility.operator) header.append(ctx.el('div', 'edp-subtitle', facility.operator));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(TYPE_LABELS[facility.type] ?? facility.type, 'edp-badge edp-badge-nuclear'));
    const statusClass = facility.status === 'active' ? 'edp-badge edp-badge-status'
      : facility.status === 'construction' ? 'edp-badge edp-badge-warning'
        : 'edp-badge edp-badge-dim';
    badgeRow.append(ctx.badge(facility.status.toUpperCase(), statusClass));
    header.append(badgeRow);
    container.append(header);

    // Description
    container.append(ctx.el('p', 'edp-description', TYPE_DESC[facility.type] ?? 'Nuclear facility.'));

    // Details
    const [detailCard, detailBody] = ctx.sectionCard('Facility Info');
    detailBody.append(row(ctx, 'Type', TYPE_LABELS[facility.type] ?? facility.type));
    detailBody.append(row(ctx, 'Status', facility.status));
    if (facility.operator) detailBody.append(row(ctx, 'Operator / Country', facility.operator));
    detailBody.append(row(ctx, 'Coordinates', `${facility.lat.toFixed(4)}°, ${facility.lon.toFixed(4)}°`));
    container.append(detailCard);

    return container;
  }
}
