import type { MilitaryVesselCluster, MilitaryVessel } from '@/types';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const VESSEL_TYPE_LABELS: Record<string, string> = {
  carrier: 'Aircraft Carrier',
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

function renderVesselDetail(vessel: MilitaryVessel, ctx: EntityRenderContext): HTMLElement {
  const container = ctx.el('div', 'edp-generic');

  // Header
  const header = ctx.el('div', 'edp-header');
  header.append(ctx.el('h2', 'edp-title', vessel.name));
  if (vessel.hullNumber) header.append(ctx.el('div', 'edp-subtitle', vessel.hullNumber));

  const badgeRow = ctx.el('div', 'edp-badge-row');
  badgeRow.append(ctx.badge(VESSEL_TYPE_LABELS[vessel.vesselType] ?? vessel.vesselType, 'edp-badge'));
  if (vessel.isDark) {
    badgeRow.append(ctx.badge('AIS DARK', 'edp-badge edp-badge-severity'));
  } else if (vessel.usniDeploymentStatus && vessel.usniDeploymentStatus !== 'unknown') {
    badgeRow.append(ctx.badge(vessel.usniDeploymentStatus.toUpperCase(), 'edp-badge edp-badge-status'));
  }
  header.append(badgeRow);
  container.append(header);

  // Wikipedia image + extract (async)
  const wikiWrap = ctx.el('div', 'edp-vessel-wiki');
  const wikiImg = ctx.el('img', 'edp-vessel-wiki-img') as HTMLImageElement;
  wikiImg.alt = vessel.name;
  const wikiCaption = ctx.el('div', 'edp-vessel-wiki-caption');
  wikiWrap.append(wikiImg, wikiCaption);
  container.append(wikiWrap);

  // Fetch Wikipedia summary
  const slug = vessel.name.replace(/ /g, '_');
  fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`, { signal: ctx.signal })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then((data: { thumbnail?: { source: string }; extract?: string; content_urls?: { desktop?: { page?: string } } }) => {
      if (data.thumbnail?.source) {
        wikiImg.src = data.thumbnail.source;
        wikiImg.style.display = 'block';
      }
      if (data.extract) {
        const desc = ctx.el('p', 'edp-description edp-vessel-wiki-extract', data.extract);
        wikiCaption.append(desc);

        // View more / View less toggle
        const toggle = ctx.el('button', 'edp-vessel-wiki-toggle', 'View more');
        let expanded = false;
        toggle.addEventListener('click', () => {
          expanded = !expanded;
          desc.classList.toggle('edp-vessel-wiki-extract--expanded', expanded);
          toggle.textContent = expanded ? 'View less' : 'View more';
          if (wikiLink) wikiLink.style.display = expanded ? 'inline' : 'none';
        });
        wikiCaption.append(toggle);
      }

      let wikiLink: HTMLAnchorElement | null = null;
      if (data.content_urls?.desktop?.page) {
        wikiLink = ctx.el('a', 'edp-vessel-wiki-link') as HTMLAnchorElement;
        wikiLink.href = data.content_urls.desktop.page;
        wikiLink.target = '_blank';
        wikiLink.rel = 'noopener noreferrer';
        wikiLink.textContent = 'Wikipedia →';
        wikiLink.style.display = 'none'; // hidden until expanded
        wikiCaption.append(wikiLink);
      }
    })
    .catch(() => { /* no wiki data — section stays empty */ });

  // Current location card
  const [locCard, locBody] = ctx.sectionCard('Current Location');
  if (vessel.note) {
    let noteText = vessel.note;
    if (vessel.lastAisUpdate) {
      const diffMs = Date.now() - vessel.lastAisUpdate.getTime();
      const diffMins = Math.round(diffMs / 60000);
      let timeStr: string;
      if (diffMins < 1) timeStr = 'just now';
      else if (diffMins < 60) timeStr = `${diffMins}m ago`;
      else if (diffMins < 1440) timeStr = `${Math.round(diffMins / 60)}h ago`;
      else timeStr = `${Math.round(diffMins / 1440)}d ago`;
      noteText = vessel.note.replace(/\(approximate\)/i, `(updated ${timeStr})`);
    }
    locBody.append(row(ctx, 'Position', noteText));
  }
  locBody.append(row(ctx, 'Coordinates', `${vessel.lat.toFixed(4)}°, ${vessel.lon.toFixed(4)}°`));
  if (vessel.usniRegion) locBody.append(row(ctx, 'Region', vessel.usniRegion));
  if (vessel.nearChokepoint) locBody.append(row(ctx, 'Near Chokepoint', vessel.nearChokepoint));
  if (vessel.nearBase) locBody.append(row(ctx, 'Near Base', vessel.nearBase));
  if (vessel.destination) locBody.append(row(ctx, 'Destination', vessel.destination));
  container.append(locCard);

  // Vessel info card
  const [infoCard, infoBody] = ctx.sectionCard('Vessel Info');
  infoBody.append(row(ctx, 'Type', VESSEL_TYPE_LABELS[vessel.vesselType] ?? vessel.vesselType));
  infoBody.append(row(ctx, 'Operator', OPERATOR_LABELS[vessel.operator] ?? vessel.operatorCountry));
  if (vessel.speed > 0) infoBody.append(row(ctx, 'Speed', `${vessel.speed.toFixed(1)} kn`));
  if (vessel.heading) infoBody.append(row(ctx, 'Heading', `${vessel.heading}°`));
  if (vessel.usniStrikeGroup) infoBody.append(row(ctx, 'Strike Group', vessel.usniStrikeGroup));
  if (vessel.aisGapMinutes && vessel.aisGapMinutes > 0) {
    infoBody.append(row(ctx, 'AIS Gap', `${vessel.aisGapMinutes} min`));
  }
  infoBody.append(row(ctx, 'Confidence', vessel.confidence));
  container.append(infoCard);

  // Activity description
  if (vessel.usniActivityDescription) {
    const [actCard, actBody] = ctx.sectionCard('Activity');
    actBody.append(ctx.el('p', 'edp-description', vessel.usniActivityDescription));
    container.append(actCard);
  }

  // USNI article link
  if (vessel.usniArticleUrl) {
    const linkWrap = ctx.el('div', 'edp-vessel-article-wrap');
    const link = ctx.el('a', 'edp-external-link') as HTMLAnchorElement;
    link.href = vessel.usniArticleUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '→ USNI News Article';
    linkWrap.append(link);
    container.append(linkWrap);
  }

  return container;
}

function renderVesselRow(vessel: MilitaryVessel, ctx: EntityRenderContext): HTMLElement {
  const item = ctx.el('div', 'edp-vessel-item edp-vessel-item--clickable');

  const nameRow = ctx.el('div', 'edp-vessel-name-row');
  const name = ctx.el('span', 'edp-vessel-name', vessel.name || vessel.id);
  nameRow.append(name);

  if (vessel.hullNumber) {
    nameRow.append(ctx.el('span', 'edp-vessel-hull', vessel.hullNumber));
  }
  if (vessel.isDark) {
    nameRow.append(ctx.badge('DARK', 'edp-badge edp-badge-severity edp-vessel-status'));
  } else if (vessel.usniDeploymentStatus && vessel.usniDeploymentStatus !== 'unknown') {
    // Green badge for deployed status
    nameRow.append(ctx.badge(vessel.usniDeploymentStatus.toUpperCase(), 'edp-badge edp-badge-status edp-vessel-status'));
  }

  // Chevron
  const chevron = ctx.el('span', 'edp-vessel-chevron', '›');
  nameRow.append(chevron);
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
    let noteText = vessel.note;
    if (vessel.lastAisUpdate) {
      const diffMs = Date.now() - vessel.lastAisUpdate.getTime();
      const diffMins = Math.round(diffMs / 60000);
      let timeStr: string;
      if (diffMins < 1) timeStr = 'just now';
      else if (diffMins < 60) timeStr = `${diffMins}m ago`;
      else if (diffMins < 1440) timeStr = `${Math.round(diffMins / 60)}h ago`;
      else timeStr = `${Math.round(diffMins / 1440)}d ago`;
      noteText = vessel.note.replace(/\(approximate\)/i, `(updated ${timeStr})`);
    }
    item.append(ctx.el('div', 'edp-vessel-note', noteText));
  }

  // Click → drill into vessel detail
  item.addEventListener('click', () => {
    ctx.navigate(renderVesselDetail(vessel, ctx));
  });

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
