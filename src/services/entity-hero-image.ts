import type { PopupType } from '@/components/MapPopup';
import { sanitizeUrl } from '@/utils/sanitize';

export interface EntityHeroImage {
  imageUrl: string;
  pageUrl: string | null;
  sourceLabel: string;
  alt: string;
}

type EntityRecord = Record<string, unknown>;

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getPrimaryName(obj: EntityRecord): string | null {
  return getString(obj.name)
    || getString(obj.title)
    || getString(obj.shortName)
    || getString(obj.location)
    || getString(obj.city)
    || getString(obj.country)
    || getString(obj.operator)
    || null;
}

function buildSearchQueries(type: PopupType, data: unknown): string[] {
  const obj = (data ?? {}) as EntityRecord;
  const name = getPrimaryName(obj);
  const country = getString(obj.country);
  const city = getString(obj.city) || getString(obj.locationName) || getString(obj.location);
  const category = getString(obj.category);

  const queries = new Set<string>();
  if (name) queries.add(name);

  switch (type) {
    case 'pipeline':
      if (name) queries.add(`${name} pipeline`);
      break;
    case 'cable':
    case 'cable-advisory':
      if (name) queries.add(`${name} undersea cable`);
      break;
    case 'repair-ship':
    case 'militaryVessel':
    case 'militaryVesselCluster':
      if (name) queries.add(`${name} ship`);
      break;
    case 'protest':
    case 'protestCluster':
      if (city || country) queries.add(`${city || country} protest`);
      if (country) queries.add(`${country} protests`);
      break;
    case 'weather':
      if (category && city) queries.add(`${category} ${city}`);
      if (category && country) queries.add(`${category} ${country}`);
      break;
    case 'hotspot':
      if (name) queries.add(`${name} conflict`);
      if (country) queries.add(`${country} conflict`);
      break;
    case 'outage':
      if (city || country) queries.add(`${city || country} internet outage`);
      break;
    case 'datacenter':
    case 'datacenterCluster':
      if (name) queries.add(`${name} data center`);
      break;
    case 'techHQ':
    case 'techHQCluster':
      if (name) queries.add(`${name} headquarters`);
      break;
    case 'company':
      if (name) queries.add(`${name} company`);
      break;
    case 'stockExchange':
      if (name) queries.add(`${name} stock exchange`);
      break;
    case 'financialCenter':
      if (name) queries.add(`${name} financial centre`);
      break;
    case 'spaceport':
      if (name) queries.add(`${name} spaceport`);
      break;
    case 'port':
    case 'commodityPort':
      if (name) queries.add(`${name} port`);
      break;
    case 'predictionMarket':
      queries.add('Prediction market');
      break;
    default:
      if (name && type) queries.add(`${name} ${type.replace(/[A-Z]/g, (m) => ` ${m.toLowerCase()}`)}`.trim());
      break;
  }

  return Array.from(queries).filter(Boolean).slice(0, 4);
}

async function fetchWikiSummary(title: string, signal: AbortSignal): Promise<EntityHeroImage | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) return null;
  const data = await resp.json() as {
    thumbnail?: { source?: string };
    originalimage?: { source?: string };
    content_urls?: { desktop?: { page?: string } };
    title?: string;
  };

  const imageUrl = data.thumbnail?.source || data.originalimage?.source;
  if (!imageUrl) return null;
  return {
    imageUrl: sanitizeUrl(imageUrl),
    pageUrl: data.content_urls?.desktop?.page ? sanitizeUrl(data.content_urls.desktop.page) : null,
    sourceLabel: 'Image via Wikipedia',
    alt: data.title || title,
  };
}

async function searchWikipedia(query: string, signal: AbortSignal): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&origin=*&search=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) return null;
  const data = await resp.json() as [string, string[]];
  return data?.[1]?.[0] || null;
}

export async function resolveEntityHeroImage(type: PopupType, data: unknown, signal: AbortSignal): Promise<EntityHeroImage | null> {
  const queries = buildSearchQueries(type, data);
  for (const query of queries) {
    try {
      const title = await searchWikipedia(query, signal);
      if (!title) continue;
      const summary = await fetchWikiSummary(title, signal);
      if (summary) return summary;
    } catch {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    }
  }
  return null;
}
