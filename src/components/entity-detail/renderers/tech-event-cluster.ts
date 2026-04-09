import type { MapTechEventCluster } from '@/types';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startText = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (Number.isNaN(start.getTime())) return startIso;
  if (Number.isNaN(end.getTime()) || end.toDateString() === start.toDateString()) return startText;
  const endText = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startText} - ${endText}`;
}

export class TechEventClusterRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const cluster = data as MapTechEventCluster;
    const totalCount = cluster.count ?? cluster.items.length;
    const soonCount = cluster.soonCount ?? cluster.items.filter((item) => item.daysUntil <= 14).length;
    const sortedItems = [...cluster.items].sort((a, b) => a.daysUntil - b.daysUntil);

    const container = ctx.el('div', 'edp-generic');

    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', cluster.location));
    header.append(ctx.el('div', 'edp-subtitle', `${cluster.location}, ${cluster.country}`));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(`${totalCount} EVENTS`, 'edp-badge'));
    if (soonCount > 0) badgeRow.append(ctx.badge(`${soonCount} SOON`, 'edp-badge edp-badge-warning'));
    header.append(badgeRow);
    container.append(header);

    const [overviewCard, overviewBody] = ctx.sectionCard('Details');
    overviewBody.append(row(ctx, 'Location', cluster.location));
    overviewBody.append(row(ctx, 'Country', cluster.country));
    overviewBody.append(row(ctx, 'Event Count', String(totalCount)));
    if (cluster.sampled != null) overviewBody.append(row(ctx, 'Sampled', cluster.sampled ? 'Yes' : 'No'));
    overviewBody.append(row(ctx, 'Coordinates', `${cluster.lat.toFixed(4)}°, ${cluster.lon.toFixed(4)}°`));
    container.append(overviewCard);

    if (sortedItems.length > 0) {
      const [eventsCard, eventsBody] = ctx.sectionCard('Upcoming Events');
      for (const item of sortedItems.slice(0, 8)) {
        const when = formatDateRange(item.startDate, item.endDate);
        const timing = item.daysUntil === 0 ? 'Today' : item.daysUntil === 1 ? 'Tomorrow' : `In ${item.daysUntil} days`;
        eventsBody.append(row(ctx, item.title, `${when} • ${timing}`));
      }
      if (sortedItems.length > 8) {
        eventsBody.append(row(ctx, 'More', `${sortedItems.length - 8} additional events`));
      }
      container.append(eventsCard);
    }

    return container;
  }
}
