import type { MilitaryVesselCluster, MilitaryVessel } from '@/types';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';
import { MilitaryVesselRenderer } from './military-vessel';

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

const DEPLOYMENT_STATUS_LABELS: Record<string, string> = {
  deployed: 'Deployed',
  underway: 'Underway',
  'in-port': 'In Port',
  unknown: 'Unknown',
};

const DEPLOYMENT_STATUS_CLASS: Record<string, string> = {
  deployed: 'edp-badge edp-badge-deployed edp-vessel-status',
  underway: 'edp-badge edp-badge-warning edp-vessel-status',
  'in-port': 'edp-badge edp-badge-dim edp-vessel-status',
  unknown: 'edp-badge edp-badge-dim edp-vessel-status',
};

const vesselRenderer = new MilitaryVesselRenderer();

function openVesselDetail(vessel: MilitaryVessel, ctx: EntityRenderContext): void {
  const detail = vesselRenderer.renderSkeleton(vessel, ctx);
  ctx.navigate(detail);

  if (vesselRenderer.enrich && vesselRenderer.renderEnriched) {
    void vesselRenderer.enrich(vessel, ctx.signal)
      .then((enriched) => {
        if (!ctx.signal.aborted) {
          vesselRenderer.renderEnriched?.(detail, enriched, ctx);
        }
      })
      .catch(() => {});
  }
}

function renderVesselRow(vessel: MilitaryVessel, ctx: EntityRenderContext): HTMLElement {
  const item = ctx.el('button', 'edp-vessel-item edp-vessel-item-button') as HTMLButtonElement;
  item.type = 'button';
  item.title = `Open ${vessel.name || vessel.id}`;
  item.setAttribute('aria-label', `Open vessel details for ${vessel.name || vessel.id}`);
  item.addEventListener('click', () => openVesselDetail(vessel, ctx));

  const nameRow = ctx.el('div', 'edp-vessel-name-row');
  const name = ctx.el('span', 'edp-vessel-name', vessel.name || vessel.id);
  nameRow.append(name);

  if (vessel.hullNumber) {
    nameRow.append(ctx.el('span', 'edp-vessel-hull', vessel.hullNumber));
  }
  if (vessel.isDark) {
    nameRow.append(ctx.badge('DARK', 'edp-badge edp-badge-severity edp-vessel-status'));
  } else if (vessel.usniDeploymentStatus && vessel.usniDeploymentStatus !== 'unknown') {
    const status = vessel.usniDeploymentStatus;
    nameRow.append(ctx.badge(
      DEPLOYMENT_STATUS_LABELS[status] ?? status,
      DEPLOYMENT_STATUS_CLASS[status] ?? 'edp-badge edp-badge-dim edp-vessel-status',
    ));
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

  const affordance = ctx.el('div', 'edp-vessel-open-hint', 'Open vessel details');
  item.append(affordance);

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
