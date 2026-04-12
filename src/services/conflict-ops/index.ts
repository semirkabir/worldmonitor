import type { AppContext } from '@/app/app-context';
import type { ConflictZone, NewsItem, MilitaryFlight, MilitaryVessel, AssetType } from '@/types';
import type {
  ConflictHeadlineMetric,
  ConflictOpsIncident,
  ConflictOpsSnapshot,
  ConflictProfile,
  ConflictSeriesPoint,
  ConflictOilMetric,
} from '@/types/conflict-ops';
import { getConflictProfile } from '@/config/conflict-profiles';
import { getNearbyInfrastructure } from '@/services/related-assets';
import { fetchOilAnalytics, formatOilValue, formatChange } from '@/services/economic';
import { fetchAisSignals, getAisStatus } from '@/services/maritime';
import { haversineKm } from '@/utils/geo';

const RANGE_MS = {
  '1h': 1 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  all: 30 * 24 * 60 * 60 * 1000,
} as const;

function conflictRadiusKm(profile: ConflictProfile): number {
  switch (profile.viewFamily) {
    case 'maritime': return 450;
    case 'warfare': return 650;
    case 'border': return 500;
    default: return 400;
  }
}

function isNearby(lat: number, lon: number, conflict: ConflictZone, profile: ConflictProfile): boolean {
  return haversineKm(lat, lon, conflict.center[1], conflict.center[0]) <= conflictRadiusKm(profile);
}

function keywordHit(item: NewsItem, keywords: string[]): boolean {
  const haystack = `${item.title} ${item.source}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function filterConflictNews(ctx: AppContext, conflict: ConflictZone): NewsItem[] {
  const rangeMs = RANGE_MS[ctx.currentTimeRange];
  const cutoff = Date.now() - rangeMs;
  const keywords = conflict.keywords ?? [];
  return ctx.allNews.filter((item) => item.pubDate.getTime() >= cutoff && keywordHit(item, keywords));
}

function bucketizeNews(news: NewsItem[], bucketCount = 12): ConflictSeriesPoint[] {
  const now = Date.now();
  const earliest = news.length > 0 ? Math.min(...news.map((item) => item.pubDate.getTime())) : now - 12 * 60 * 60 * 1000;
  const start = Math.min(earliest, now - 12 * 60 * 60 * 1000);
  const span = Math.max(1, now - start);
  const bucketMs = Math.max(1, Math.floor(span / bucketCount));
  const points = Array.from({ length: bucketCount }, (_, index) => ({
    timestamp: start + (index + 1) * bucketMs,
    primary: 0,
    secondary: 0,
  }));
  for (const item of news) {
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((item.pubDate.getTime() - start) / bucketMs)));
    const point = points[index];
    if (!point) continue;
    point.primary += 1;
    if (item.isAlert) point.secondary = (point.secondary ?? 0) + 1;
  }
  return points;
}

function topIncidents(news: NewsItem[]): ConflictOpsIncident[] {
  return news
    .slice()
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 8)
    .map((item, index) => ({
      id: `${item.link || item.title}-${index}`,
      title: item.title,
      timestamp: item.pubDate.getTime(),
      category: item.source,
      summary: item.locationName || item.source,
      severity: item.isAlert ? 'high' : 'medium',
    }));
}

function countMatches(news: NewsItem[], pattern: RegExp): number {
  return news.filter((item) => pattern.test(item.title.toLowerCase())).length;
}

function buildSummary(conflict: ConflictZone, news: NewsItem[], profile: ConflictProfile): string[] {
  const summary = [...(conflict.keyDevelopments ?? [])].slice(0, 4);
  if (profile.viewFamily === 'maritime') {
    summary.unshift(`${news.filter((item) => item.isAlert).length} alert headlines linked to the corridor in the current range.`);
  }
  if (profile.viewFamily === 'warfare') {
    summary.unshift(`${countMatches(news, /(drone|uav|shahed|missile|strike)/)} strike-related headlines captured in range.`);
  }
  return summary.slice(0, 5);
}

function nearbyMilitary(ctx: AppContext, conflict: ConflictZone, profile: ConflictProfile): { flights: number; vessels: number; darkVessels: number } {
  const flights = ctx.intelligenceCache.military?.flights ?? [];
  const vessels = ctx.intelligenceCache.military?.vessels ?? [];
  const nearbyFlights = flights.filter((item: MilitaryFlight) => isNearby(item.lat, item.lon, conflict, profile)).length;
  const nearbyVessels = vessels.filter((item: MilitaryVessel) => isNearby(item.lat, item.lon, conflict, profile));
  return {
    flights: nearbyFlights,
    vessels: nearbyVessels.length,
    darkVessels: nearbyVessels.filter((item) => item.isDark).length,
  };
}

function assetTypesForProfile(profile: ConflictProfile): AssetType[] {
  if (profile.viewFamily === 'maritime') return ['base', 'pipeline', 'cable'];
  if (profile.viewFamily === 'warfare') return ['base', 'nuclear', 'pipeline'];
  if (profile.viewFamily === 'border') return ['base'];
  return ['base', 'pipeline'];
}

function toneForDelta(value: number | null | undefined, inverse = false): 'positive' | 'danger' | 'neutral' {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) < 0.05) return 'neutral';
  const positive = value > 0;
  if (inverse) return positive ? 'danger' : 'positive';
  return positive ? 'positive' : 'danger';
}

function toOilMetrics(oil: Awaited<ReturnType<typeof fetchOilAnalytics>>): ConflictOilMetric[] | undefined {
  if (!oil.wtiPrice && !oil.brentPrice) return undefined;
  const spread = oil.brentPrice && oil.wtiPrice ? oil.brentPrice.current - oil.wtiPrice.current : null;
  const metrics: ConflictOilMetric[] = [];
  if (oil.brentPrice) {
    metrics.push({
      label: 'Brent',
      value: formatOilValue(oil.brentPrice.current, oil.brentPrice.unit),
      delta: formatChange(oil.brentPrice.changePct, '%'),
      tone: toneForDelta(oil.brentPrice.changePct),
    });
  }
  if (oil.wtiPrice) {
    metrics.push({
      label: 'WTI',
      value: formatOilValue(oil.wtiPrice.current, oil.wtiPrice.unit),
      delta: formatChange(oil.wtiPrice.changePct, '%'),
      tone: toneForDelta(oil.wtiPrice.changePct),
    });
  }
  if (spread != null) {
    metrics.push({
      label: 'Brent-WTI',
      value: `$${spread.toFixed(2)}`,
      delta: oil.brentPrice && oil.wtiPrice ? formatChange(oil.brentPrice.changePct - oil.wtiPrice.changePct, '%') : 'N/A',
      tone: toneForDelta(spread),
    });
  }
  return metrics;
}

function buildMetrics(conflict: ConflictZone, profile: ConflictProfile, news: NewsItem[], military: ReturnType<typeof nearbyMilitary>, liveAis?: ConflictOpsSnapshot['liveAis']): ConflictHeadlineMetric[] {
  const alertCount = news.filter((item) => item.isAlert).length;
  const base: ConflictHeadlineMetric[] = [
    { label: 'Headlines', value: String(news.length), tone: 'info' },
    { label: 'Alerts', value: String(alertCount), tone: alertCount > 0 ? 'danger' : 'neutral' },
  ];
  if (profile.modules.includes('militaryPosture')) {
    base.push(
      { label: 'Nearby Flights', value: String(military.flights), tone: military.flights > 0 ? 'warning' : 'neutral' },
      { label: 'Nearby Vessels', value: String(military.vessels), tone: military.vessels > 0 ? 'warning' : 'neutral' },
    );
  }
  if (profile.viewFamily === 'maritime' && liveAis) {
    base.push(
      { label: 'AIS Relay', value: liveAis.connected ? 'Live' : 'Offline', tone: liveAis.connected ? 'positive' : 'danger' },
      { label: 'Tracked Ships', value: String(liveAis.trackedVessels), tone: 'info' },
    );
  }
  if (profile.modules.includes('casualties') && conflict.casualties) {
    base.push({ label: 'Casualties', value: conflict.casualties, tone: 'danger' });
  }
  if (profile.modules.includes('displacement') && conflict.displaced) {
    base.push({ label: 'Displaced', value: conflict.displaced, tone: 'warning' });
  }
  return base.slice(0, 6);
}

export async function buildConflictOpsSnapshot(ctx: AppContext, conflict: ConflictZone): Promise<ConflictOpsSnapshot | null> {
  const profile = getConflictProfile(conflict);
  if (!profile) return null;

  const news = filterConflictNews(ctx, conflict);
  const military = nearbyMilitary(ctx, conflict, profile);
  const [oil, ais] = await Promise.all([
    profile.modules.includes('oilMetrics') ? fetchOilAnalytics() : Promise.resolve(null),
    profile.viewFamily === 'maritime' ? fetchAisSignals() : Promise.resolve({ disruptions: [], density: [] }),
  ]);
  const aisStatus = profile.viewFamily === 'maritime' ? getAisStatus() : { connected: false, vessels: 0, messages: 0 };

  const incidents = topIncidents(news);
  const liveAis = profile.viewFamily === 'maritime'
    ? {
        connected: aisStatus.connected,
        trackedVessels: aisStatus.vessels,
        disruptions: ais.disruptions.length,
        densityZones: ais.density.length,
      }
    : undefined;

  const droneReports = countMatches(news, /(drone|uav|shahed|loitering)/);
  const strikeEvents = countMatches(news, /(missile|strike|airstrike|artillery|rocket|bombardment)/);
  const killingsReported = countMatches(news, /(killed|casualt|dead|fatalit)/);

  return {
    profile,
    asOf: Date.now(),
    metrics: buildMetrics(conflict, profile, news, military, liveAis),
    series: bucketizeNews(news),
    incidents,
    summary: buildSummary(conflict, news, profile),
    oilMetrics: oil ? toOilMetrics(oil) : undefined,
    warfare: profile.viewFamily === 'warfare' ? {
      droneReports,
      killingsReported: conflict.casualties ?? `${killingsReported} reported death-related headlines`,
      strikeEvents,
    } : undefined,
    humanitarian: profile.viewFamily === 'humanitarian' ? {
      displaced: conflict.displaced,
      aidStatus: countMatches(news, /(aid|corridor|crossing|ceasefire|humanitarian)/) > 0 ? 'Aid corridor active in feed' : 'No active aid corridor signal',
    } : undefined,
    nearbyAssets: getNearbyInfrastructure(conflict.center[1], conflict.center[0], assetTypesForProfile(profile)).slice(0, 6).map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      distanceKm: asset.distanceKm,
    })),
    nearbyMilitary: military,
    liveAis,
    crossings: profile.viewFamily === 'maritime' ? {
      crossingEvents: Math.max(0, (ais.disruptions.length * 2) + ais.density.reduce((sum, zone) => sum + Math.max(0, Math.round(zone.shipsPerDay ?? 0)), 0)),
      inbound: Math.max(0, Math.round(aisStatus.vessels * 0.48)),
      outbound: Math.max(0, Math.round(aisStatus.vessels * 0.52)),
      uniqueVessels: aisStatus.vessels,
      darkTransitCount: ais.disruptions.reduce((sum, item) => sum + (item.darkShips ?? 0), 0),
    } : undefined,
  };
}
