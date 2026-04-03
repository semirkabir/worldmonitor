import type { APTGroup } from '@/types';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

export class APTGroupRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const apt = data as APTGroup;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', apt.name));
    if (apt.aka) header.append(ctx.el('div', 'edp-subtitle', apt.aka));
    const badgeRow = ctx.el('div', 'edp-badge-row');
    const threatClass = apt.threatLevel === 'critical' ? 'edp-badge edp-badge-severity'
      : apt.threatLevel === 'high' ? 'edp-badge edp-badge-warning'
      : 'edp-badge edp-badge-tier';
    badgeRow.append(ctx.badge((apt.threatLevel ?? 'high').toUpperCase(), threatClass));
    badgeRow.append(ctx.badge('STATE-SPONSORED', 'edp-badge'));
    header.append(badgeRow);
    container.append(header);

    // Overview card — includes description at top
    const [infoCard, infoBody] = ctx.sectionCard('Overview');
    if (apt.description) {
      const desc = ctx.el('p', 'edp-apt-description', apt.description);
      infoBody.append(desc);
    }
    infoBody.append(row(ctx, 'Sponsor', apt.sponsor));
    if (apt.active) infoBody.append(row(ctx, 'Active Since', apt.active));
    container.append(infoCard);

    // Targets
    if (apt.targets && apt.targets.length > 0) {
      const [card, body] = ctx.sectionCard('Primary Targets');
      const tags = ctx.el('div', 'edp-tags');
      for (const t of apt.targets) tags.append(ctx.badge(t, 'edp-tag'));
      body.append(tags);
      container.append(card);
    }

    // Techniques
    if (apt.techniques && apt.techniques.length > 0) {
      const [card, body] = ctx.sectionCard('Techniques & TTPs');
      const tags = ctx.el('div', 'edp-tags');
      for (const t of apt.techniques) tags.append(ctx.badge(t, 'edp-tag'));
      body.append(tags);
      container.append(card);
    }

    // Known operations — linked to Wikipedia where available
    if (apt.knownOps && apt.knownOps.length > 0) {
      const [card, body] = ctx.sectionCard('Known Operations');
      for (const op of apt.knownOps) {
        const item = ctx.el('div', 'edp-lp-row');
        if (op.url) {
          const link = document.createElement('a');
          link.className = 'edp-op-link';
          link.textContent = op.name;
          link.href = op.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          item.append(link);
        } else {
          item.append(ctx.el('span', 'edp-lp-city', op.name));
        }
        body.append(item);
      }
      container.append(card);
    }

    return container;
  }
}
