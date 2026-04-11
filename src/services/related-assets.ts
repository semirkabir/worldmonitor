import type { ClusteredEvent, RelatedAsset, AssetType, RelatedAssetContext } from '@/types';
import { tokenizeForMatch, matchKeyword } from '@/utils/keyword-match';
import { t } from '@/services/i18n';
import { haversineKm } from '@/utils/geo';
import { getCountryCentroid, isCoordinateInCountry, nameToCountryCode } from '@/services/country-geometry';
import {
  INTEL_HOTSPOTS,
  CONFLICT_ZONES,
  MILITARY_BASES,
  UNDERSEA_CABLES,
  NUCLEAR_FACILITIES,
  AI_DATA_CENTERS,
  PIPELINES,
} from '@/config';

const MAX_DISTANCE_KM = 300;
const MAX_ASSETS_PER_TYPE = 3;

const ASSET_KEYWORDS: Record<AssetType, string[]> = {
  pipeline: ['pipeline', 'oil pipeline', 'gas pipeline', 'fuel pipeline', 'pipeline leak', 'pipeline spill'],
  cable: ['cable', 'undersea cable', 'subsea cable', 'fiber cable', 'fiber optic', 'internet cable'],
  datacenter: ['datacenter', 'data center', 'server farm', 'colocation', 'hyperscale'],
  base: ['military base', 'airbase', 'naval base', 'base', 'garrison'],
  nuclear: ['nuclear', 'reactor', 'uranium', 'enrichment', 'nuclear plant'],
};

interface AssetOrigin {
  lat: number;
  lon: number;
  label: string;
}

type AssetIndexEntry = { id: string; name: string; lat: number; lon: number };

function detectAssetTypes(titles: string[]): AssetType[] {
  const tokenized = titles.map(t => tokenizeForMatch(t));
  const types = Object.entries(ASSET_KEYWORDS)
    .filter(([, keywords]) =>
      tokenized.some(tokens => keywords.some(keyword => matchKeyword(tokens, keyword)))
    )
    .map(([type]) => type as AssetType);
  return types;
}

function countKeywordMatches(titles: string[], keywords: string[]): number {
  const tokenized = titles.map(t => tokenizeForMatch(t));
  return keywords.reduce((count, keyword) => {
    return count + tokenized.filter(tokens => matchKeyword(tokens, keyword)).length;
  }, 0);
}

function inferOrigin(titles: string[]): AssetOrigin | null {
  const hotspotCandidates = INTEL_HOTSPOTS.map((hotspot) => ({
    label: hotspot.name,
    lat: hotspot.lat,
    lon: hotspot.lon,
    score: countKeywordMatches(titles, hotspot.keywords),
  })).filter(candidate => candidate.score > 0);

  const conflictCandidates = CONFLICT_ZONES.map((conflict) => ({
    label: conflict.name,
    lat: conflict.center[1],
    lon: conflict.center[0],
    score: countKeywordMatches(titles, conflict.keywords ?? []),
  })).filter(candidate => candidate.score > 0);

  const allCandidates = [...hotspotCandidates, ...conflictCandidates];
  if (allCandidates.length === 0) return null;

  return allCandidates.sort((a, b) => b.score - a.score)[0] ?? null;
}

function midpoint(points: [number, number][]): { lat: number; lon: number } | null {
  if (points.length === 0) return null;
  const mid = points[Math.floor(points.length / 2)] as [number, number];
  return { lon: mid[0], lat: mid[1] };
}

function buildAssetIndex(type: AssetType): Array<AssetIndexEntry | null> {
  switch (type) {
    case 'pipeline':
      return PIPELINES.map(pipeline => {
        const mid = midpoint(pipeline.points);
        if (!mid) return null;
        return { id: pipeline.id, name: pipeline.name, lat: mid.lat, lon: mid.lon };
      });
    case 'cable':
      return UNDERSEA_CABLES.map(cable => {
        const mid = midpoint(cable.points);
        if (!mid) return null;
        return { id: cable.id, name: cable.name, lat: mid.lat, lon: mid.lon };
      });
    case 'datacenter':
      return AI_DATA_CENTERS.map(dc => ({ id: dc.id, name: dc.name, lat: dc.lat, lon: dc.lon }));
    case 'base':
      return MILITARY_BASES.map(base => ({ id: base.id, name: base.name, lat: base.lat, lon: base.lon }));
    case 'nuclear':
      return NUCLEAR_FACILITIES.map(site => ({ id: site.id, name: site.name, lat: site.lat, lon: site.lon }));
    default:
      return [];
  }
}

function isCoordinateInsideCountry(lat: number, lon: number, countryCode: string): boolean {
  return isCoordinateInCountry(lat, lon, countryCode) === true;
}

function isMilitaryBaseInCountry(base: typeof MILITARY_BASES[number], countryCode: string): boolean {
  const hostCode = base.country ? nameToCountryCode(base.country.toLowerCase()) : null;
  if (hostCode === countryCode) return true;
  return isCoordinateInsideCountry(base.lat, base.lon, countryCode);
}

function isCableInCountry(cable: typeof UNDERSEA_CABLES[number], countryCode: string): boolean {
  if (cable.landingPoints?.some((point) => point.country.toUpperCase() === countryCode)) return true;
  if (cable.countriesServed?.some((country) => country.country.toUpperCase() === countryCode)) return true;
  return cable.points.some(([lon, lat]) => isCoordinateInsideCountry(lat, lon, countryCode));
}

function isPipelineInCountry(pipeline: typeof PIPELINES[number], countryCode: string): boolean {
  return pipeline.points.some(([lon, lat]) => isCoordinateInsideCountry(lat, lon, countryCode));
}

function buildCountryAssetIndex(countryCode: string, type: AssetType): AssetIndexEntry[] {
  switch (type) {
    case 'pipeline':
      return PIPELINES
        .filter((pipeline) => isPipelineInCountry(pipeline, countryCode))
        .map((pipeline) => {
          const mid = midpoint(pipeline.points);
          return mid ? { id: pipeline.id, name: pipeline.name, lat: mid.lat, lon: mid.lon } : null;
        })
        .filter((asset): asset is AssetIndexEntry => !!asset);
    case 'cable':
      return UNDERSEA_CABLES
        .filter((cable) => isCableInCountry(cable, countryCode))
        .map((cable) => {
          const landingPoint = cable.landingPoints?.find((point) => point.country.toUpperCase() === countryCode);
          if (landingPoint) {
            return { id: cable.id, name: cable.name, lat: landingPoint.lat, lon: landingPoint.lon };
          }
          const mid = midpoint(cable.points);
          return mid ? { id: cable.id, name: cable.name, lat: mid.lat, lon: mid.lon } : null;
        })
        .filter((asset): asset is AssetIndexEntry => !!asset);
    case 'datacenter':
      return AI_DATA_CENTERS
        .filter((dc) => isCoordinateInsideCountry(dc.lat, dc.lon, countryCode))
        .map((dc) => ({ id: dc.id, name: dc.name, lat: dc.lat, lon: dc.lon }));
    case 'base':
      return MILITARY_BASES
        .filter((base) => isMilitaryBaseInCountry(base, countryCode))
        .map((base) => ({ id: base.id, name: base.name, lat: base.lat, lon: base.lon }));
    case 'nuclear':
      return NUCLEAR_FACILITIES
        .filter((site) => isCoordinateInsideCountry(site.lat, site.lon, countryCode))
        .map((site) => ({ id: site.id, name: site.name, lat: site.lat, lon: site.lon }));
    default:
      return [];
  }
}

function findNearbyAssets(origin: AssetOrigin, types: AssetType[]): RelatedAsset[] {
  const results: RelatedAsset[] = [];

  types.forEach((type) => {
    const candidates = buildAssetIndex(type)
      .filter((asset): asset is { id: string; name: string; lat: number; lon: number } => !!asset)
      .map((asset) => ({
        ...asset,
        distanceKm: haversineKm(origin.lat, origin.lon, asset.lat, asset.lon),
      }))
      .filter(asset => asset.distanceKm <= MAX_DISTANCE_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_ASSETS_PER_TYPE);

    candidates.forEach(candidate => {
      results.push({
        id: candidate.id,
        name: candidate.name,
        type,
        distanceKm: candidate.distanceKm,
      });
    });
  });

  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}

export function getClusterAssetContext(cluster: ClusteredEvent): RelatedAssetContext | null {
  const titles = cluster.allItems.map(item => item.title);
  const types = detectAssetTypes(titles);
  if (types.length === 0) return null;

  const origin = inferOrigin(titles);
  if (!origin) return null;

  const assets = findNearbyAssets(origin, types);
  return { origin, assets, types };
}

export function getAssetLabel(type: AssetType): string {
  return t(`components.relatedAssets.${type}`);
}

export function getNearbyInfrastructure(
  lat: number, lon: number, types: AssetType[]
): RelatedAsset[] {
  return findNearbyAssets({ lat, lon, label: 'country-centroid' }, types);
}

export function getCountryInfrastructure(countryCode: string, types: AssetType[]): RelatedAsset[] {
  const centroid = getCountryCentroid(countryCode);

  return types.flatMap((type) => {
    const assets = buildCountryAssetIndex(countryCode, type)
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        type,
        distanceKm: centroid ? haversineKm(centroid.lat, centroid.lon, asset.lat, asset.lon) : 0,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return assets;
  });
}

export { MAX_DISTANCE_KM };
