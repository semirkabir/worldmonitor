import type { UnderseaCable } from '@/types';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

export class CableRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const cable = data as UnderseaCable;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', cable.name));
    header.append(ctx.el('div', 'edp-subtitle', 'Undersea Fiber Optic Cable'));
    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(cable.major ? 'MAJOR' : 'REGIONAL', cable.major ? 'edp-badge edp-badge-severity' : 'edp-badge'));
    header.append(badgeRow);
    container.append(header);

    // Auto-generated description
    const descParts: string[] = ['Submarine fiber optic telecommunications cable.'];
    if (cable.capacityTbps) descParts.push(`Capacity: ${cable.capacityTbps} Tbps.`);
    if (cable.rfsYear) descParts.push(`In service since ${cable.rfsYear}.`);
    if (cable.owners && cable.owners.length > 0) descParts.push(`Owned by ${cable.owners.slice(0, 3).join(', ')}${cable.owners.length > 3 ? ` +${cable.owners.length - 3} more` : ''}.`);
    container.append(ctx.el('p', 'edp-description', descParts.join(' ')));

    // Stats
    const [statsCard, statsBody] = ctx.sectionCard('Cable Info');
    if (cable.capacityTbps) statsBody.append(row(ctx, 'Capacity', `${cable.capacityTbps} Tbps`));
    if (cable.rfsYear) statsBody.append(row(ctx, 'In Service', String(cable.rfsYear)));
    statsBody.append(row(ctx, 'Waypoints', String(cable.points.length)));
    if (cable.landingPoints) statsBody.append(row(ctx, 'Landing Points', String(cable.landingPoints.length)));
    container.append(statsCard);

    // Owners
    if (cable.owners && cable.owners.length > 0) {
      const [ownCard, ownBody] = ctx.sectionCard('Owners');
      const tags = ctx.el('div', 'edp-tags');
      for (const o of cable.owners) tags.append(ctx.badge(o, 'edp-tag'));
      ownBody.append(tags);
      container.append(ownCard);
    }

    // Landing points
    if (cable.landingPoints && cable.landingPoints.length > 0) {
      const [lpCard, lpBody] = ctx.sectionCard(`Landing Points (${cable.landingPoints.length})`);
      for (const lp of cable.landingPoints) {
        const lpRow = ctx.el('div', 'edp-lp-row');
        if (lp.city) {
          const city = ctx.el('span', 'edp-lp-city', lp.city);
          lpRow.append(city);
        }
        const country = ctx.el('span', 'edp-lp-country', lp.city ? ` · ${lp.countryName}` : lp.countryName);
        lpRow.append(country);
        lpBody.append(lpRow);
      }
      container.append(lpCard);
    }

    // Countries served
    if (cable.countriesServed && cable.countriesServed.length > 0) {
      const [csCard, csBody] = ctx.sectionCard('Countries Served');
      for (const cs of cable.countriesServed) {
        const pct = Math.round(cs.capacityShare * 100);
        csBody.append(row(ctx, cs.country, `${pct}% capacity${cs.isRedundant ? ' · redundant' : ''}`));
      }
      container.append(csCard);
    }

    return container;
  }
}
