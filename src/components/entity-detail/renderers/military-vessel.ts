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

interface VesselPanelData {
  vessel: MilitaryVessel;
  photo: { url: string; source: string; credit?: string } | null;
  wikiSummary: string | null;
  wikiUrl: string | null;
}

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
    const badgeCls = vessel.usniDeploymentStatus === 'deployed'
      ? 'edp-badge edp-badge-deployed'
      : 'edp-badge edp-badge-dim';
    badgeRow.append(ctx.badge(statusLabel.toUpperCase(), badgeCls));
  }

  if (vessel.isInteresting) {
    badgeRow.append(ctx.badge('INTERESTING', 'edp-badge edp-badge-status'));
  }

  header.append(badgeRow);
  container.append(header);
}

function buildPhoto(container: HTMLElement, ctx: EntityRenderContext, photo: VesselPanelData['photo']): void {
  if (!photo) return;

  const wrap = ctx.el('div', 'edp-vessel-photo');

  const img = ctx.el('img', '') as HTMLImageElement;
  img.src = photo.url;
  img.alt = 'Military vessel image';
  img.loading = 'lazy';
  img.onerror = () => { (img as HTMLImageElement).style.display = 'none'; };
  wrap.append(img);

  if (photo.credit) {
    const credit = ctx.el('div', 'edp-vessel-photo-credit');
    credit.textContent = photo.credit;
    wrap.append(credit);
  }

  container.append(wrap);
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

async function fetchWikipediaData(name: string, signal: AbortSignal): Promise<{
  summary: string | null;
  url: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
}> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name + ' ship naval')}&format=json&origin=*`;
    const searchResp = await fetch(searchUrl, { signal });
    if (!searchResp.ok) return { summary: null, url: null, imageUrl: null, imageCredit: null };
    const searchData = await searchResp.json();
    const results = searchData.query?.search;
    if (!results || results.length === 0) return { summary: null, url: null, imageUrl: null, imageCredit: null };

    const title = results[0].title;
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryResp = await fetch(summaryUrl, { signal });
    if (!summaryResp.ok) return { summary: null, url, imageUrl: null, imageCredit: null };
    const summaryData = await summaryResp.json();

    let imageUrl: string | null = null;
    let imageCredit: string | null = null;

    if (summaryData.thumbnail?.source) {
      imageUrl = summaryData.thumbnail.source;
      imageCredit = `Image via Wikipedia`;
    }

    if (!imageUrl && summaryData.originalimage?.source) {
      imageUrl = summaryData.originalimage.source;
      imageCredit = `Image via Wikipedia`;
    }

    return {
      summary: summaryData.extract || null,
      url,
      imageUrl,
      imageCredit,
    };
  } catch {
    return { summary: null, url: null, imageUrl: null, imageCredit: null };
  }
}

async function fetchWikimediaImage(vessel: MilitaryVessel, signal: AbortSignal): Promise<VesselPanelData['photo'] | null> {
  try {
    const searchName = vessel.name || vessel.id;
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchName + ' ship naval')}&gsrnamespace=6&format=json&origin=*&gsrlimit=3`;
    const resp = await fetch(searchUrl, { signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = data.query?.pages;
    if (!pages) return null;

    const pageIds = Object.keys(pages);
    for (const id of pageIds) {
      const page = pages[id];
      if (page.imageinfo && page.imageinfo.length > 0) {
        const info = page.imageinfo[0];
        return {
          url: info.thumburl || info.url,
          source: 'wikimedia',
          credit: `Photo via Wikimedia Commons / ${info.user || 'Unknown'}`,
        };
      }
    }
  } catch {
    // No images available
  }

  return null;
}

export class MilitaryVesselRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const vessel = data as MilitaryVessel;
    const container = ctx.el('div', 'edp-generic');

    buildHeader(container, ctx, vessel);
    buildLiveStats(container, ctx, vessel);

    // Photo placeholder
    const photoPlaceholder = ctx.el('div', 'edp-vessel-photo-placeholder');
    photoPlaceholder.textContent = 'Loading vessel image…';
    container.append(photoPlaceholder);

    // Wiki loading placeholder
    const wikiPlaceholder = ctx.el('div', 'edp-wiki-loading');
    wikiPlaceholder.textContent = 'Loading vessel information…';
    container.append(wikiPlaceholder);

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

  async enrich(data: unknown, signal: AbortSignal): Promise<VesselPanelData> {
    const vessel = data as MilitaryVessel;
    const searchName = vessel.name || vessel.id;
    const wikiData = await fetchWikipediaData(searchName, signal);

    let photo: VesselPanelData['photo'] = null;
    if (wikiData.imageUrl) {
      photo = { url: wikiData.imageUrl, source: 'wikipedia', credit: wikiData.imageCredit || undefined };
    } else {
      photo = await fetchWikimediaImage(vessel, signal);
    }

    return { vessel, photo, wikiSummary: wikiData.summary, wikiUrl: wikiData.url };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const { vessel, photo, wikiSummary, wikiUrl } = enrichedData as VesselPanelData;
    container.replaceChildren();

    buildHeader(container, ctx, vessel);

    // Photo
    buildPhoto(container, ctx, photo);

    // Wiki summary
    if (wikiSummary) {
      container.append(ctx.el('p', 'edp-description', wikiSummary));
      if (wikiUrl) {
        const wikiLink = ctx.el('a', 'edp-wiki-link') as HTMLAnchorElement;
        wikiLink.href = wikiUrl;
        wikiLink.target = '_blank';
        wikiLink.rel = 'noopener noreferrer';
        wikiLink.textContent = 'Read more on Wikipedia →';
        container.append(wikiLink);
      }
    } else if (vessel.usniActivityDescription) {
      container.append(ctx.el('p', 'edp-description', vessel.usniActivityDescription));
    } else if (vessel.note) {
      container.append(ctx.el('p', 'edp-description', vessel.note));
    }

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
    if (photo) {
      infoBody.append(row(ctx, 'Image Source', photo.credit || photo.source));
    }
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
  }
}
