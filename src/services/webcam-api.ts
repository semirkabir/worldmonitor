/**
 * Webcam API client — fetches live cameras from the Windy proxy at /api/cameras.
 * Results are cached in memory with a 5-minute TTL.
 */

import { getApiBaseUrl } from './runtime';
import { dataFreshness } from './data-freshness';

export interface WindyCamera {
  id: string;
  title: string;
  status: string;
  image: {
    current: string;
    daylight: string;
  };
  player: {
    day: string;
    lifetime: string;
  };
  location: {
    city: string;
    region: string;
    country: string;
    countryCode: string;
    continent: string;
    continentCode: string;
    latitude: number;
    longitude: number;
  };
  lastUpdatedOn: string | null;
}

export interface CameraResponse {
  cameras: WindyCamera[];
  total: number;
  limit: number;
  offset: number;
}

// Continent codes matching Windy API
export type ContinentCode = 'AF' | 'AN' | 'AS' | 'EU' | 'NA' | 'OC' | 'SA';

interface CacheEntry {
  data: CameraResponse;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const inflight = new Map<string, Promise<CameraResponse>>();

function buildUrl(continent?: ContinentCode, limit = 50, offset = 0): string {
  const base = getApiBaseUrl();
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (continent) params.set('continent', continent);
  return `${base}/api/cameras?${params.toString()}`;
}

async function doFetch(url: string): Promise<CameraResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Camera API ${res.status}`);
  return res.json() as Promise<CameraResponse>;
}

/**
 * Fetch cameras, optionally filtered by continent.
 * Deduplicates concurrent identical requests and caches results.
 */
export async function fetchCameras(
  continent?: ContinentCode,
  limit = 50,
  offset = 0,
): Promise<CameraResponse> {
  const url = buildUrl(continent, limit, offset);

  // Check cache
  const entry = cache.get(url);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
    return entry.data;
  }

  // Deduplicate inflight requests
  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = doFetch(url)
    .then((data) => {
      cache.set(url, { data, fetchedAt: Date.now() });
      inflight.delete(url);
      dataFreshness.recordUpdate('webcams', data.cameras.length);
      return data;
    })
    .catch((err) => {
      inflight.delete(url);
      dataFreshness.recordError('webcams', err.message);
      throw err;
    });

  inflight.set(url, promise);
  return promise;
}

/** Map our UI region names to Windy continent codes. */
export function regionToContinentCode(region: string): ContinentCode | undefined {
  const map: Record<string, ContinentCode> = {
    'europe': 'EU',
    'americas': 'NA',
    'n-america': 'NA',
    's-america': 'SA',
    'asia': 'AS',
    'africa': 'AF',
    'oceania': 'OC',
    'middle-east': 'AS', // Windy has no ME — use Asia
  };
  return map[region];
}
