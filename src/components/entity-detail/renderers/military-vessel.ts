import type { MilitaryVessel } from '@/types';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const VESSEL_TYPE_LABELS: Record<string, string> = {
  carrier: 'Aircraft Carrier',
  destroyer: 'Destroyer',
  frigate: 'Frigate',
  submarine: 'Submarine',
  amphibious: 'Amphibious Assault Ship',
  patrol: 'Patrol Vessel',
  auxiliary: 'Auxiliary / Support',
  research: 'Research Vessel',
  icebreaker: 'Icebreaker',
  special: 'Special Mission',
  unknown: 'Unknown',
};

const OPERATOR_LABELS: Record<string, string> = {
  usn: 'US Navy',
  uscg: 'US Coast Guard',
  rn: 'Royal Navy',
  pla: 'PLA Navy',
  russian_navy: 'Russian Navy',
  french_navy: 'French Navy',
  indian_navy: 'Indian Navy',
  japan_msdf: 'Japan Maritime Self-Defense Force',
  other: 'Other',
};

const DEPLOYMENT_STATUS_LABELS: Record<string, string> = {
  deployed: 'Deployed',
  underway: 'Underway',
  'in-port': 'In Port',
  unknown: 'Unknown',
};

function getOperatorLabel(vessel: MilitaryVessel): string {
  return OPERATOR_LABELS[vessel.operator] || vessel.operatorCountry || vessel.operator || 'Unknown';
}

function getVesselTypeLabel(vessel: MilitaryVessel): string {
  return VESSEL_TYPE_LABELS[vessel.vesselType] || vessel.vesselType || 'Unknown';
}

function buildHeader(container: HTMLElement, ctx: EntityRenderContext, vessel: MilitaryVessel): void {
  const header = ctx.el('div', 'edp-header');
  header.append(ctx.el('h2', 'edp-title', vessel.name || vessel.id));

  const subtitleParts = [getOperatorLabel(vessel)].filter(Boolean);
  if (vessel.hullNumber) subtitleParts.push(vessel.hullNumber);
  if (subtitleParts.length > 0) {
    header.append(ctx.el('div', 'edp-subtitle', subtitleParts.join(' · ')));
  }

  const badgeRow = ctx.el('div', 'edp-badge-row');
  badgeRow.append(ctx.badge(getVesselTypeLabel(vessel), 'edp-badge'));

  if (vessel.isDark) {
    badgeRow.append(ctx.badge('DARK TARGET', 'edp-badge edp-badge-severity'));
  } else if (vessel.usniDeploymentStatus && vessel.usniDeploymentStatus !== 'unknown') {
    const statusLabel = DEPLOYMENT_STATUS_LABELS[vessel.usniDeploymentStatus] || vessel.usniDeploymentStatus;
    badgeRow.append(ctx.badge(statusLabel.toUpperCase(), 'edp-badge edp-badge-dim'));
  }

  if (vessel.isInteresting) {
    badgeRow.append(ctx.badge('INTERESTING', 'edp-badge edp-badge-status'));
  }

  header.append(badgeRow);
  container.append(header);
}

function buildLiveStats(container: HTMLElement, ctx: EntityRenderContext, vessel: MilitaryVessel): void {
  const grid = ctx.el('div', 'edp-stat-grid');

  if (vessel.speed > 0) {
    const speed = ctx.el('div', 'edp-stat-highlight');
    speed.append(ctx.el('div', 'edp-stat-highlight-value', vessel.speed.toFixed(1)));
    speed.append(ctx.el('div', 'edp-stat-highlight-label', 'Speed (knots)'));
    grid.append(speed);
  }

  if (vessel.heading != null) {
    const heading = ctx.el('div', 'edp-stat-highlight');
    heading.append(ctx.el('div', 'edp-stat-highlight-value', `${Math.round(vessel.heading)}°`));
    heading.append(ctx.el('div', 'edp-stat-highlight-label', 'Heading'));
    grid.append(heading);
  }

  if (vessel.lat != null && vessel.lon != null) {
    const position = ctx.el('div', 'edp-stat-highlight');
    position.append(ctx.el('div', 'edp-stat-highlight-value', `${vessel.lat.toFixed(2)}°`));
    position.append(ctx.el('div', 'edp-stat-highlight-label', 'Latitude'));
    grid.append(position);

    const lon = ctx.el('div', 'edp-stat-highlight');
    lon.append(ctx.el('div', 'edp-stat-highlight-value', `${vessel.lon.toFixed(2)}°`));
    lon.append(ctx.el('div', 'edp-stat-highlight-label', 'Longitude'));
    grid.append(lon);
  }

  if (grid.children.length > 0) {
    container.append(grid);
  }
}

export class MilitaryVesselRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const vessel = data as MilitaryVessel;
    const container = ctx.el('div', 'edp-generic');

    buildHeader(container, ctx, vessel);
    buildLiveStats(container, ctx, vessel);

    const [infoCard, infoBody] = ctx.sectionCard('Vessel Info');
    infoBody.append(row(ctx, 'Type', getVesselTypeLabel(vessel)));
    infoBody.append(row(ctx, 'Operator', getOperatorLabel(vessel)));
    if (vessel.hullNumber) infoBody.append(row(ctx, 'Hull Number', vessel.hullNumber));
    if (vessel.mmsi) infoBody.append(row(ctx, 'MMSI', vessel.mmsi));
    if (vessel.usniRegion) infoBody.append(row(ctx, 'Region', vessel.usniRegion));
    if (vessel.usniStrikeGroup) infoBody.append(row(ctx, 'Strike Group', vessel.usniStrikeGroup));
    if (vessel.usniDeploymentStatus) {
      infoBody.append(row(ctx, 'Deployment', DEPLOYMENT_STATUS_LABELS[vessel.usniDeploymentStatus] || vessel.usniDeploymentStatus));
    }
    if (vessel.lastAisUpdate) {
      try {
        infoBody.append(row(ctx, 'Last AIS Update', new Date(vessel.lastAisUpdate).toLocaleString()));
      } catch {
        infoBody.append(row(ctx, 'Last AIS Update', String(vessel.lastAisUpdate)));
      }
    }
    if (vessel.destination) infoBody.append(row(ctx, 'Destination', vessel.destination));
    if (vessel.nearChokepoint) infoBody.append(row(ctx, 'Near Chokepoint', vessel.nearChokepoint));
    if (vessel.nearBase) infoBody.append(row(ctx, 'Near Base', vessel.nearBase));
    infoBody.append(row(ctx, 'Confidence', vessel.confidence));
    container.append(infoCard);

    if (vessel.usniActivityDescription) {
      const [intelCard, intelBody] = ctx.sectionCard('USNI Intelligence');
      intelBody.append(ctx.el('p', 'edp-description', vessel.usniActivityDescription));
      container.append(intelCard);
    }

    if (vessel.note) {
      const [noteCard, noteBody] = ctx.sectionCard('Notes');
      noteBody.append(ctx.el('p', 'edp-description', vessel.note));
      container.append(noteCard);
    }

    return container;
  }
}
