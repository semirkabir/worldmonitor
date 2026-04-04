import type { GammaIrradiator } from '@/types';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const COUNTRY_RISK: Record<string, { level: string; severity: number }> = {
  'USA': { level: 'REGULATED', severity: 1 },
  'Canada': { level: 'REGULATED', severity: 1 },
  'Mexico': { level: 'MODERATE', severity: 2 },
  'Russia': { level: 'ELEVATED', severity: 3 },
  'China': { level: 'ELEVATED', severity: 3 },
  'India': { level: 'MODERATE', severity: 2 },
  'Pakistan': { level: 'HIGH', severity: 4 },
  'North Korea': { level: 'CRITICAL', severity: 5 },
  'Iran': { level: 'HIGH', severity: 4 },
};

interface IrradiatorPanelData {
  irradiator: GammaIrradiator;
  photo: IrradiatorPhoto | null;
  wikiSummary: string | null;
  wikiUrl: string | null;
}

interface IrradiatorPhoto {
  url: string;
  source: string;
  credit?: string;
}

function getRiskInfo(country: string): { level: string; severity: number } {
  return COUNTRY_RISK[country] || { level: 'UNKNOWN', severity: 2 };
}

function buildHeader(container: HTMLElement, ctx: EntityRenderContext, irradiator: GammaIrradiator): void {
  const header = ctx.el('div', 'edp-header');
  header.append(ctx.el('h2', 'edp-title', `☢️ ${irradiator.city}`));
  header.append(ctx.el('div', 'edp-subtitle', irradiator.country));

  const risk = getRiskInfo(irradiator.country);
  const badgeRow = ctx.el('div', 'edp-badge-row');
  badgeRow.append(ctx.badge('GAMMA IRRADIATOR', 'edp-badge edp-badge-nuclear'));
  badgeRow.append(ctx.badge(risk.level, risk.severity >= 4 ? 'edp-badge edp-badge-severity' : 'edp-badge edp-badge-dim'));
  badgeRow.append(ctx.badge(`RISK ${risk.severity}/5`, 'edp-badge'));
  header.append(badgeRow);
  container.append(header);
}

function buildPhoto(container: HTMLElement, ctx: EntityRenderContext, photo: IrradiatorPhoto | null): void {
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

async function fetchWikipediaData(city: string, country: string, signal: AbortSignal): Promise<{
  summary: string | null;
  url: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
}> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(city + ' ' + country + ' irradiation facility nuclear')}&format=json&origin=*`;
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

async function fetchWikimediaImage(irradiator: GammaIrradiator, signal: AbortSignal): Promise<IrradiatorPhoto | null> {
  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(irradiator.city + ' irradiation facility')}&gsrnamespace=6&format=json&origin=*&gsrlimit=3`;
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

export class IrradiatorRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const irradiator = data as GammaIrradiator;
    const container = ctx.el('div', 'edp-generic');

    buildHeader(container, ctx, irradiator);

    const photoPlaceholder = ctx.el('div', 'edp-nuclear-photo-placeholder');
    photoPlaceholder.textContent = 'Loading facility image…';
    container.append(photoPlaceholder);

    const wikiPlaceholder = ctx.el('div', 'edp-wiki-loading');
    wikiPlaceholder.textContent = 'Loading facility information…';
    container.append(wikiPlaceholder);

    const risk = getRiskInfo(irradiator.country);
    const [detailCard, detailBody] = ctx.sectionCard('Facility Info');
    detailBody.append(row(ctx, 'City', irradiator.city));
    detailBody.append(row(ctx, 'Country', irradiator.country));
    detailBody.append(row(ctx, 'Risk Level', risk.level));
    detailBody.append(row(ctx, 'Risk Severity', `${risk.severity}/5`));
    detailBody.append(row(ctx, 'Coordinates', `${irradiator.lat.toFixed(4)}°, ${irradiator.lon.toFixed(4)}°`));
    detailBody.append(row(ctx, 'Source', 'IAEA DIIF Database'));
    container.append(detailCard);

    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<IrradiatorPanelData> {
    const irradiator = data as GammaIrradiator;

    const wikiData = await fetchWikipediaData(irradiator.city, irradiator.country, signal);

    let photo: IrradiatorPhoto | null = null;
    if (wikiData.imageUrl) {
      photo = { url: wikiData.imageUrl, source: 'wikipedia', credit: wikiData.imageCredit || undefined };
    } else {
      photo = await fetchWikimediaImage(irradiator, signal);
    }

    return { irradiator, photo, wikiSummary: wikiData.summary, wikiUrl: wikiData.url };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const { irradiator, photo, wikiSummary, wikiUrl } = enrichedData as IrradiatorPanelData;
    container.replaceChildren();

    buildHeader(container, ctx, irradiator);
    buildPhoto(container, ctx, photo);

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
    } else {
      container.append(ctx.el('p', 'edp-description', `Industrial gamma irradiation facility located in ${irradiator.city}, ${irradiator.country}. These facilities use radioactive sources (typically Cobalt-60 or Cesium-137) for sterilization, food preservation, and materials processing.`));
    }

    const risk = getRiskInfo(irradiator.country);
    const [detailCard, detailBody] = ctx.sectionCard('Facility Info');
    detailBody.append(row(ctx, 'City', irradiator.city));
    detailBody.append(row(ctx, 'Country', irradiator.country));
    detailBody.append(row(ctx, 'Risk Level', risk.level));
    detailBody.append(row(ctx, 'Risk Severity', `${risk.severity}/5`));
    detailBody.append(row(ctx, 'Coordinates', `${irradiator.lat.toFixed(4)}°, ${irradiator.lon.toFixed(4)}°`));
    detailBody.append(row(ctx, 'Source', 'IAEA DIIF Database'));
    if (photo) {
      detailBody.append(row(ctx, 'Image Source', photo.credit || photo.source));
    }
    container.append(detailCard);
  }
}
