import type { MilitaryFlightCluster, MilitaryFlight } from '@/types';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';
import { MilitaryFlightRenderer } from './military-flight';

const ACTIVITY_LABELS: Record<string, string> = {
  exercise: 'Exercise',
  patrol: 'Patrol',
  transport: 'Transport',
  unknown: 'Activity Unknown',
};

const ACTIVITY_BADGE_CLASS: Record<string, string> = {
  exercise: 'edp-badge edp-badge-severity',
  patrol: 'edp-badge edp-badge-warning',
  transport: 'edp-badge',
  unknown: 'edp-badge edp-badge-dim',
};

const flightRenderer = new MilitaryFlightRenderer();

function openFlightDetail(flight: MilitaryFlight, ctx: EntityRenderContext): void {
  ctx.navigate(flightRenderer.renderSkeleton(flight, ctx));
}

function renderFlightRow(flight: MilitaryFlight, ctx: EntityRenderContext): HTMLElement {
  const item = ctx.el('button', 'edp-vessel-item edp-vessel-item-button') as HTMLButtonElement;
  item.type = 'button';
  item.title = `Open ${flight.callsign || flight.id}`;
  item.addEventListener('click', () => openFlightDetail(flight, ctx));

  const nameRow = ctx.el('div', 'edp-vessel-name-row');
  nameRow.append(ctx.el('span', 'edp-vessel-name', flight.callsign || flight.id));
  if (flight.registration) nameRow.append(ctx.el('span', 'edp-vessel-hull', flight.registration));
  nameRow.append(ctx.badge(flight.aircraftType.toUpperCase(), 'edp-badge edp-badge-dim edp-vessel-status'));
  item.append(nameRow);

  const metaRow = ctx.el('div', 'edp-vessel-meta');
  metaRow.append(ctx.el('span', 'edp-vessel-type', flight.aircraftModel || flight.aircraftType));
  metaRow.append(ctx.el('span', 'edp-vessel-operator', flight.operatorCountry || flight.operator));
  metaRow.append(ctx.el('span', 'edp-vessel-speed', `${Math.round(flight.speed)} kn`));
  item.append(metaRow);

  if (flight.note) item.append(ctx.el('div', 'edp-vessel-note', flight.note));
  item.append(ctx.el('div', 'edp-vessel-open-hint', 'Open flight details'));
  return item;
}

export class MilitaryFlightClusterRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const cluster = data as MilitaryFlightCluster;
    const container = ctx.el('div', 'edp-generic');

    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', cluster.name));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(`${cluster.flightCount} Aircraft`, 'edp-badge'));
    const activityType = cluster.activityType ?? 'unknown';
    badgeRow.append(ctx.badge(ACTIVITY_LABELS[activityType] ?? activityType, ACTIVITY_BADGE_CLASS[activityType] ?? 'edp-badge'));
    header.append(badgeRow);
    container.append(header);

    const [infoCard, infoBody] = ctx.sectionCard('Flight Group Info');
    infoBody.append(row(ctx, 'Aircraft', String(cluster.flightCount)));
    infoBody.append(row(ctx, 'Activity', ACTIVITY_LABELS[activityType] ?? activityType));
    if (cluster.dominantOperator) infoBody.append(row(ctx, 'Primary Operator', cluster.dominantOperator.toUpperCase()));
    container.append(infoCard);

    if (cluster.flights.length > 0) {
      const [flightCard, flightBody] = ctx.sectionCard('Aircraft');
      flightBody.className += ' edp-vessel-list';
      for (const flight of cluster.flights) {
        flightBody.append(renderFlightRow(flight, ctx));
      }
      container.append(flightCard);
    }

    return container;
  }
}
