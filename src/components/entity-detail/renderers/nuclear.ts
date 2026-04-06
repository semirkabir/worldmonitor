import type { NuclearFacility, NuclearFacilityType } from '@/types';
import { row, statusBadgeClass, textSection, wikiSection } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const TYPE_LABELS: Record<NuclearFacilityType, string> = {
  plant: 'Nuclear Power Plant',
  enrichment: 'Uranium Enrichment Facility',
  reprocessing: 'Plutonium Reprocessing Facility',
  weapons: 'Nuclear Weapons Design / Assembly',
  ssbn: 'Nuclear Submarine Base',
  'test-site': 'Nuclear Test Site',
  icbm: 'ICBM Silo Field',
  research: 'Research Reactor',
};

const TYPE_DESC: Record<NuclearFacilityType, string> = {
  plant: 'Civilian nuclear power generation facility providing electricity to the national grid.',
  enrichment: 'Facility for enriching uranium for use in nuclear reactors or weapons programs.',
  reprocessing: 'Facility that reprocesses spent nuclear fuel to recover plutonium.',
  weapons: 'Nuclear weapons design, assembly, or storage installation.',
  ssbn: 'Naval base supporting nuclear-armed ballistic missile submarines.',
  'test-site': 'Historical or active nuclear weapons test site.',
  icbm: 'Intercontinental ballistic missile silo field.',
  research: 'Research reactor facility for scientific and medical isotope production.',
};

const TYPE_ICONS: Record<NuclearFacilityType, string> = {
  plant: '⚡',
  enrichment: '🔬',
  reprocessing: '♻️',
  weapons: '☢️',
  ssbn: '🚢',
  'test-site': '💥',
  icbm: '🚀',
  research: '🔬',
};

const TYPE_SEVERITY: Record<NuclearFacilityType, number> = {
  plant: 1,
  research: 1,
  enrichment: 2,
  reprocessing: 3,
  ssbn: 3,
  icbm: 4,
  weapons: 5,
  'test-site': 4,
};

interface NuclearPanelData {
  facility: NuclearFacility;
  photo: NuclearFacilityPhoto | null;
  wikiSummary: string | null;
  wikiUrl: string | null;
}

interface NuclearFacilityPhoto {
  url: string;
  source: string;
  credit?: string;
}

function buildHeader(container: HTMLElement, ctx: EntityRenderContext, facility: NuclearFacility): void {
  const header = ctx.el('div', 'edp-header');
  header.append(ctx.el('h2', 'edp-title', facility.name));
  if (facility.operator) header.append(ctx.el('div', 'edp-subtitle', facility.operator));

  const badgeRow = ctx.el('div', 'edp-badge-row');
  badgeRow.append(ctx.badge(`${TYPE_ICONS[facility.type]} ${TYPE_LABELS[facility.type]}`, 'edp-badge edp-badge-nuclear'));
  badgeRow.append(ctx.badge(facility.status.toUpperCase(), statusBadgeClass(facility.status)));
  badgeRow.append(ctx.badge(`SEVERITY ${TYPE_SEVERITY[facility.type]}/5`, 'edp-badge edp-badge-severity'));
  header.append(badgeRow);
  container.append(header);
}

function buildPhoto(container: HTMLElement, ctx: EntityRenderContext, photo: NuclearFacilityPhoto | null): void {
  if (!photo?.url) return;

  const wrap = ctx.el('div', 'edp-nuclear-photo');
  const img = ctx.el('img', 'edp-nuclear-photo-img') as HTMLImageElement;
  img.src = photo.url;
  img.alt = 'Facility image';
  img.loading = 'lazy';
  img.onerror = () => { (img as HTMLImageElement).style.display = 'none'; };
  wrap.append(img);

  if (photo.credit) {
    const credit = ctx.el('div', 'edp-nuclear-photo-credit');
    credit.textContent = photo.credit;
    wrap.append(credit);
  }

  container.append(wrap);
}

async function fetchWikipediaData(name: string, signal: AbortSignal): Promise<{
  summary: string | null;
  url: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
}> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name + ' nuclear facility')}&format=json&origin=*`;
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

async function fetchWikimediaImage(facility: NuclearFacility, signal: AbortSignal): Promise<NuclearFacilityPhoto | null> {
  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(facility.name + ' nuclear')}&gsrnamespace=6&format=json&origin=*&gsrlimit=3`;
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

export class NuclearRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const facility = data as NuclearFacility;
    const container = ctx.el('div', 'edp-generic');

    buildHeader(container, ctx, facility);

    const photoPlaceholder = ctx.el('div', 'edp-nuclear-photo-placeholder');
    photoPlaceholder.textContent = 'Loading facility image…';
    container.append(photoPlaceholder);

    const wikiPlaceholder = ctx.el('div', 'edp-wiki-loading');
    wikiPlaceholder.textContent = 'Loading facility information…';
    container.append(wikiPlaceholder);

    const [detailCard, detailBody] = ctx.sectionCard('Facility Info');
    detailBody.append(row(ctx, 'Type', TYPE_LABELS[facility.type] ?? facility.type));
    detailBody.append(row(ctx, 'Status', facility.status));
    if (facility.operator) detailBody.append(row(ctx, 'Operator / Country', facility.operator));
    detailBody.append(row(ctx, 'Coordinates', `${facility.lat.toFixed(4)}°, ${facility.lon.toFixed(4)}°`));
    detailBody.append(row(ctx, 'Strategic Significance', `Severity ${TYPE_SEVERITY[facility.type]}/5`));
    container.append(detailCard);

    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<NuclearPanelData> {
    const facility = data as NuclearFacility;

    const wikiData = await fetchWikipediaData(facility.name, signal);

    let photo: NuclearFacilityPhoto | null = null;
    if (wikiData.imageUrl) {
      photo = { url: wikiData.imageUrl, source: 'wikipedia', credit: wikiData.imageCredit || undefined };
    } else {
      photo = await fetchWikimediaImage(facility, signal);
    }

    return { facility, photo, wikiSummary: wikiData.summary, wikiUrl: wikiData.url };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const { facility, photo, wikiSummary, wikiUrl } = enrichedData as NuclearPanelData;
    container.replaceChildren();

    buildPhoto(container, ctx, photo);
    buildHeader(container, ctx, facility);

    if (wikiSummary) {
      container.append(wikiSection(ctx, wikiSummary, wikiUrl));
    } else {
      container.append(textSection(ctx, 'Overview', TYPE_DESC[facility.type] ?? 'Nuclear facility.'));
    }

    const [detailCard, detailBody] = ctx.sectionCard('Facility Info');
    detailBody.append(row(ctx, 'Type', TYPE_LABELS[facility.type] ?? facility.type));
    detailBody.append(row(ctx, 'Status', facility.status));
    if (facility.operator) detailBody.append(row(ctx, 'Operator / Country', facility.operator));
    detailBody.append(row(ctx, 'Coordinates', `${facility.lat.toFixed(4)}°, ${facility.lon.toFixed(4)}°`));
    detailBody.append(row(ctx, 'Strategic Significance', `Severity ${TYPE_SEVERITY[facility.type]}/5`));
    if (photo) {
      detailBody.append(row(ctx, 'Image Source', photo.credit || photo.source));
    }
    container.append(detailCard);
  }
}
