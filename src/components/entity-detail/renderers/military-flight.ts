import type { MilitaryFlight } from '@/types';
import { row, textSection } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const AIRCRAFT_TYPE_LABELS: Record<string, string> = {
  fighter: 'Fighter',
  bomber: 'Bomber',
  transport: 'Transport',
  tanker: 'Tanker',
  awacs: 'AWACS',
  reconnaissance: 'Reconnaissance',
  helicopter: 'Helicopter',
  drone: 'Drone',
  patrol: 'Patrol',
  special_ops: 'Special Ops',
  vip: 'VIP Transport',
  unknown: 'Unknown',
};

const OPERATOR_LABELS: Record<string, string> = {
  usaf: 'US Air Force',
  usn: 'US Navy',
  usmc: 'US Marine Corps',
  usa: 'US Army',
  raf: 'Royal Air Force',
  rn: 'Royal Navy',
  faf: 'French Air Force',
  gaf: 'German Air Force',
  plaaf: 'PLA Air Force',
  plan: 'PLA Navy',
  vks: 'Russian Aerospace Forces',
  iaf: 'Israeli Air Force',
  nato: 'NATO',
  other: 'Other',
};

function typeLabel(flight: MilitaryFlight): string {
  return AIRCRAFT_TYPE_LABELS[flight.aircraftType] || flight.aircraftType || 'Unknown';
}

function operatorLabel(flight: MilitaryFlight): string {
  return OPERATOR_LABELS[flight.operator] || flight.operatorCountry || flight.operator || 'Unknown';
}

function buildHeader(container: HTMLElement, ctx: EntityRenderContext, flight: MilitaryFlight): void {
  const header = ctx.el('div', 'edp-header');
  header.append(ctx.el('h2', 'edp-title', flight.callsign || flight.registration || flight.id));

  const subtitle = [operatorLabel(flight), flight.aircraftModel || typeLabel(flight)].filter(Boolean).join(' · ');
  if (subtitle) header.append(ctx.el('div', 'edp-subtitle', subtitle));

  const badgeRow = ctx.el('div', 'edp-badge-row');
  badgeRow.append(ctx.badge(typeLabel(flight), 'edp-badge'));
  badgeRow.append(ctx.badge(flight.confidence.toUpperCase(), flight.confidence === 'high' ? 'edp-badge edp-badge-status' : 'edp-badge edp-badge-dim'));
  if (flight.isInteresting) badgeRow.append(ctx.badge('INTERESTING', 'edp-badge edp-badge-warning'));
  if (flight.onGround) badgeRow.append(ctx.badge('GROUND', 'edp-badge edp-badge-dim'));
  header.append(badgeRow);

  container.append(header);
}

function buildLiveStats(container: HTMLElement, ctx: EntityRenderContext, flight: MilitaryFlight): void {
  const grid = ctx.el('div', 'edp-stat-grid');

  const altitude = ctx.el('div', 'edp-stat-highlight');
  altitude.append(ctx.el('div', 'edp-stat-highlight-value', flight.altitude > 0 ? `FL${Math.round(flight.altitude / 100)}` : 'GROUND'));
  altitude.append(ctx.el('div', 'edp-stat-highlight-label', 'Altitude'));
  grid.append(altitude);

  const speed = ctx.el('div', 'edp-stat-highlight');
  speed.append(ctx.el('div', 'edp-stat-highlight-value', `${Math.round(flight.speed)}`));
  speed.append(ctx.el('div', 'edp-stat-highlight-label', 'Knots'));
  grid.append(speed);

  const heading = ctx.el('div', 'edp-stat-highlight');
  heading.append(ctx.el('div', 'edp-stat-highlight-value', `${Math.round(flight.heading)}°`));
  heading.append(ctx.el('div', 'edp-stat-highlight-label', 'Heading'));
  grid.append(heading);

  container.append(grid);
}

export class MilitaryFlightRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const flight = data as MilitaryFlight;
    const container = ctx.el('div', 'edp-generic');

    buildHeader(container, ctx, flight);
    buildLiveStats(container, ctx, flight);

    if (flight.note) {
      container.append(textSection(ctx, 'Operational Note', flight.note));
    }

    const [infoCard, infoBody] = ctx.sectionCard('Flight Info');
    infoBody.append(row(ctx, 'Type', typeLabel(flight)));
    infoBody.append(row(ctx, 'Operator', operatorLabel(flight)));
    infoBody.append(row(ctx, 'Hex Code', flight.hexCode));
    if (flight.registration) infoBody.append(row(ctx, 'Registration', flight.registration));
    if (flight.aircraftModel) infoBody.append(row(ctx, 'Aircraft Model', flight.aircraftModel));
    if (flight.origin) infoBody.append(row(ctx, 'Origin', flight.origin));
    if (flight.destination) infoBody.append(row(ctx, 'Destination', flight.destination));
    if (flight.squawk) infoBody.append(row(ctx, 'Squawk', flight.squawk));
    infoBody.append(row(ctx, 'Observed', new Date(flight.lastSeen).toLocaleString()));
    infoBody.append(row(ctx, 'Position', `${flight.lat.toFixed(2)}, ${flight.lon.toFixed(2)}`));
    container.append(infoCard);

    if (flight.enriched) {
      const [enrichedCard, enrichedBody] = ctx.sectionCard('Aircraft Context');
      if (flight.enriched.manufacturer) enrichedBody.append(row(ctx, 'Manufacturer', flight.enriched.manufacturer));
      if (flight.enriched.owner) enrichedBody.append(row(ctx, 'Owner', flight.enriched.owner));
      if (flight.enriched.operatorName) enrichedBody.append(row(ctx, 'Operator Name', flight.enriched.operatorName));
      if (flight.enriched.builtYear) enrichedBody.append(row(ctx, 'Built', flight.enriched.builtYear));
      if (flight.enriched.militaryBranch) enrichedBody.append(row(ctx, 'Branch', flight.enriched.militaryBranch));
      container.append(enrichedCard);
    }

    return container;
  }
}
