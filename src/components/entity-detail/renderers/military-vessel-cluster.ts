import type { MilitaryVesselCluster, MilitaryVessel } from '@/types';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const VESSEL_TYPE_LABELS: Record<string, string> = {
  carrier: 'Carrier',
  destroyer: 'Destroyer',
  frigate: 'Frigate',
  submarine: 'Submarine',
  amphibious: 'Amphibious',
  patrol: 'Patrol',
  auxiliary: 'Auxiliary',
  research: 'Research',
  icebreaker: 'Icebreaker',
  special: 'Special Mission',
  unknown: 'Unknown',
};

const ACTIVITY_LABELS: Record<string, string> = {
  exercise: 'Exercise',
  deployment: 'Deployment',
  transit: 'Transit',
  unknown: 'Activity Unknown',
};

const ACTIVITY_BADGE_CLASS: Record<string, string> = {
  exercise: 'edp-badge edp-badge-severity',
  deployment: 'edp-badge edp-badge-severity',
  transit: 'edp-badge',
  unknown: 'edp-badge edp-badge-dim',
};

const OPERATOR_LABELS: Record<string, string> = {
  usn: 'US Navy',
  uscg: 'US Coast Guard',
  rn: 'Royal Navy',
  pla: 'PLA Navy',
  russian_navy: 'Russian Navy',
  french_navy: 'French Navy',
  other: 'Other',
};

function renderVesselRow(vessel: MilitaryVessel, ctx: EntityRenderContext): HTMLElement {
  const item = ctx.el('div', 'edp-vessel-item');

  const nameRow = ctx.el('div', 'edp-vessel-name-row');
  const name = ctx.el('span', 'edp-vessel-name', vessel.name || vessel.id);
  nameRow.append(name);

  if (vessel.hullNumber) {
    nameRow.append(ctx.el('span', 'edp-vessel-hull', vessel.hullNumber));
  }
  if (vessel.isDark) {
    nameRow.append(ctx.badge('DARK', 'edp-badge edp-badge-severity edp-vessel-status'));
  } else if (vessel.usniDeploymentStatus && vessel.usniDeploymentStatus !== 'unknown') {
    nameRow.append(ctx.badge(vessel.usniDeploymentStatus.toUpperCase(), 'edp-badge edp-badge-dim edp-vessel-status'));
  }
  item.append(nameRow);

  const metaRow = ctx.el('div', 'edp-vessel-meta');
  const typeLabel = VESSEL_TYPE_LABELS[vessel.vesselType] ?? vessel.vesselType;
  const operatorLabel = OPERATOR_LABELS[vessel.operator] ?? vessel.operatorCountry;
  metaRow.append(ctx.el('span', 'edp-vessel-type', typeLabel));
  metaRow.append(ctx.el('span', 'edp-vessel-operator', operatorLabel));
  if (vessel.speed > 0) {
    metaRow.append(ctx.el('span', 'edp-vessel-speed', `${vessel.speed.toFixed(1)} kn`));
  }
  item.append(metaRow);

  if (vessel.note) {
    item.append(ctx.el('div', 'edp-vessel-note', vessel.note));
  }

  return item;
}

export class MilitaryVesselClusterRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const cluster = data as MilitaryVesselCluster;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', cluster.name));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(`${cluster.vesselCount} Vessel${cluster.vesselCount !== 1 ? 's' : ''}`, 'edp-badge'));
    const activityType = cluster.activityType ?? 'unknown';
    badgeRow.append(ctx.badge(
      ACTIVITY_LABELS[activityType] ?? activityType,
      ACTIVITY_BADGE_CLASS[activityType] ?? 'edp-badge',
    ));
    header.append(badgeRow);
    container.append(header);

    // Cluster info
    const [infoCard, infoBody] = ctx.sectionCard('Strike Group Info');
    if (cluster.region) infoBody.append(row(ctx, 'Region', cluster.region));
    infoBody.append(row(ctx, 'Vessels', String(cluster.vesselCount)));
    infoBody.append(row(ctx, 'Activity', ACTIVITY_LABELS[activityType] ?? activityType));
    container.append(infoCard);

    // Vessel list
    if (cluster.vessels.length > 0) {
      const [vesselCard, vesselBody] = ctx.sectionCard('Vessels');
      vesselBody.className += ' edp-vessel-list';
      for (const vessel of cluster.vessels) {
        vesselBody.append(renderVesselRow(vessel, ctx));
      }
      container.append(vesselCard);
    }

    return container;
  }
}
