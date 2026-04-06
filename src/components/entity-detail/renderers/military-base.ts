import type { MilitaryBaseEnriched } from '@/types';
import { row, statusBadgeClass, textSection, wikiSection } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const BASE_TYPE_LABELS: Record<string, string> = {
  'us-nato': 'US/NATO Military',
  'china': 'Chinese Military',
  'russia': 'Russian Military',
  'uk': 'British Military',
  'france': 'French Military',
  'india': 'Indian Military',
  'italy': 'Italian Military',
  'uae': 'UAE Military',
  'turkey': 'Turkish Military',
  'japan': 'Japan SDF',
  'other': 'Other',
};

interface MilitaryBasePanelData {
  base: MilitaryBaseEnriched;
  photo: { url: string; source: string; credit?: string } | null;
  wikiSummary: string | null;
  wikiUrl: string | null;
}

export class MilitaryBaseRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const base = data as MilitaryBaseEnriched;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', base.name));
    if (base.country) header.append(ctx.el('div', 'edp-subtitle', base.country));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    const typeLabel = BASE_TYPE_LABELS[base.type] ?? base.type;
    badgeRow.append(ctx.badge(typeLabel, 'edp-badge'));
    if (base.status) {
      badgeRow.append(ctx.badge(base.status.toUpperCase(), statusBadgeClass(base.status)));
    }
    header.append(badgeRow);
    container.append(header);

    // Photo placeholder
    const photoPlaceholder = ctx.el('div', 'edp-base-photo-placeholder');
    photoPlaceholder.textContent = 'Loading facility image…';
    container.append(photoPlaceholder);

    // Wiki loading placeholder
    const wikiPlaceholder = ctx.el('div', 'edp-wiki-loading');
    wikiPlaceholder.textContent = 'Loading base information…';
    container.append(wikiPlaceholder);

    // Description (fallback until wiki loads)
    if (base.description) container.append(ctx.el('p', 'edp-description', base.description));

    // Details
    const [detailCard, detailBody] = ctx.sectionCard('Base Info');
    if (base.country) detailBody.append(row(ctx, 'Country', base.country));
    if (base.arm) detailBody.append(row(ctx, 'Branch', base.arm));
    if (base.status) detailBody.append(row(ctx, 'Status', base.status));
    detailBody.append(row(ctx, 'Coordinates', `${base.lat.toFixed(4)}°, ${base.lon.toFixed(4)}°`));
    container.append(detailCard);

    // Capabilities (enriched)
    const enriched = base as MilitaryBaseEnriched;
    const caps: string[] = [];
    if (enriched.catAirforce) caps.push('Air Force');
    if (enriched.catNaval) caps.push('Naval');
    if (enriched.catNuclear) caps.push('Nuclear');
    if (enriched.catSpace) caps.push('Space');
    if (enriched.catTraining) caps.push('Training');

    if (caps.length > 0) {
      const [capCard, capBody] = ctx.sectionCard('Capabilities');
      const tags = ctx.el('div', 'edp-tags');
      for (const cap of caps) {
        const cls = cap === 'Nuclear' ? 'edp-tag edp-badge-nuclear' : 'edp-tag';
        tags.append(ctx.badge(cap, cls));
      }
      capBody.append(tags);
      container.append(capCard);
    }

    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<MilitaryBasePanelData> {
    const base = data as MilitaryBaseEnriched;
    const wikiData = await fetchWikipediaData(base.name, signal);

    let photo: MilitaryBasePanelData['photo'] = null;
    if (wikiData.imageUrl) {
      photo = { url: wikiData.imageUrl, source: 'wikipedia', credit: wikiData.imageCredit || undefined };
    } else {
      photo = await fetchWikimediaImage(base, signal);
    }

    return { base, photo, wikiSummary: wikiData.summary, wikiUrl: wikiData.url };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const { base, photo, wikiSummary, wikiUrl } = enrichedData as MilitaryBasePanelData;
    container.replaceChildren();

    buildPhoto(container, ctx, photo);

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', base.name));
    if (base.country) header.append(ctx.el('div', 'edp-subtitle', base.country));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    const typeLabel = BASE_TYPE_LABELS[base.type] ?? base.type;
    badgeRow.append(ctx.badge(typeLabel, 'edp-badge'));
    if (base.status) {
      badgeRow.append(ctx.badge(base.status.toUpperCase(), statusBadgeClass(base.status)));
    }
    header.append(badgeRow);
    container.append(header);

    // Wiki summary
    if (wikiSummary) {
      container.append(wikiSection(ctx, wikiSummary, wikiUrl));
    } else if (base.description) {
      container.append(textSection(ctx, 'Overview', base.description));
    }

    // Details
    const [detailCard, detailBody] = ctx.sectionCard('Base Info');
    if (base.country) detailBody.append(row(ctx, 'Country', base.country));
    if (base.arm) detailBody.append(row(ctx, 'Branch', base.arm));
    if (base.status) detailBody.append(row(ctx, 'Status', base.status));
    detailBody.append(row(ctx, 'Coordinates', `${base.lat.toFixed(4)}°, ${base.lon.toFixed(4)}°`));
    if (photo) {
      detailBody.append(row(ctx, 'Image Source', photo.credit || photo.source));
    }
    container.append(detailCard);

    // Capabilities
    const enriched = base as MilitaryBaseEnriched;
    const caps: string[] = [];
    if (enriched.catAirforce) caps.push('Air Force');
    if (enriched.catNaval) caps.push('Naval');
    if (enriched.catNuclear) caps.push('Nuclear');
    if (enriched.catSpace) caps.push('Space');
    if (enriched.catTraining) caps.push('Training');

    if (caps.length > 0) {
      const [capCard, capBody] = ctx.sectionCard('Capabilities');
      const tags = ctx.el('div', 'edp-tags');
      for (const cap of caps) {
        const cls = cap === 'Nuclear' ? 'edp-tag edp-badge-nuclear' : 'edp-tag';
        tags.append(ctx.badge(cap, cls));
      }
      capBody.append(tags);
      container.append(capCard);
    }
  }
}

function buildPhoto(container: HTMLElement, ctx: EntityRenderContext, photo: MilitaryBasePanelData['photo']): void {
  if (!photo) return;

  const wrap = ctx.el('div', 'edp-base-photo');

  const img = ctx.el('img', '') as HTMLImageElement;
  img.src = photo.url;
  img.alt = 'Military base image';
  img.loading = 'lazy';
  img.onerror = () => { (img as HTMLImageElement).style.display = 'none'; };
  wrap.append(img);

  if (photo.credit) {
    const credit = ctx.el('div', 'edp-base-photo-credit');
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
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name + ' military base')}&format=json&origin=*`;
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

async function fetchWikimediaImage(base: MilitaryBaseEnriched, signal: AbortSignal): Promise<MilitaryBasePanelData['photo'] | null> {
  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(base.name + ' military base')}&gsrnamespace=6&format=json&origin=*&gsrlimit=3`;
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
