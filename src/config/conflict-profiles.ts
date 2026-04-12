import type { ConflictZone } from '@/types';
import { CONFLICT_ZONES } from '@/config/geo';
import type { ConflictProfile } from '@/types/conflict-ops';

function zone(id: string): ConflictZone {
  const match = CONFLICT_ZONES.find((item) => item.id === id);
  if (!match) throw new Error(`Unknown conflict zone: ${id}`);
  return match;
}

function profileFor(id: string, overrides: Omit<ConflictProfile, 'id' | 'aoi'>): ConflictProfile {
  const conflict = zone(id);
  return {
    id,
    aoi: {
      center: conflict.center,
      polygon: conflict.coords,
      zoom: overrides.viewFamily === 'maritime' ? 6.5 : overrides.viewFamily === 'border' ? 6.25 : 5.2,
    },
    ...overrides,
  };
}

export const CONFLICT_PROFILES: Record<string, ConflictProfile> = {
  iran: profileFor('iran', {
    viewFamily: 'warfare',
    modules: ['headlineMetrics', 'timeline', 'strikeTempo', 'casualties', 'oilMetrics', 'militaryPosture', 'incidentFeed', 'infrastructure'],
    overlay: { id: 'iran-war', enabledLayers: ['conflicts', 'military', 'flights', 'bases', 'nuclear', 'iranAttacks', 'waterways'], hiddenLayers: [], focusAisLive: false },
    playbackEnabled: true,
    playbackResolution: '1h',
    defaultTimeRange: '48h',
    labels: { primaryChartTitle: 'Strike & Escalation Tempo', chartLegendA: 'Escalation', chartLegendB: 'Alerts' },
  }),
  strait_hormuz: profileFor('strait_hormuz', {
    viewFamily: 'maritime',
    modules: ['headlineMetrics', 'timeline', 'vesselTracks', 'crossings', 'oilMetrics', 'militaryPosture', 'incidentFeed', 'infrastructure'],
    overlay: { id: 'hormuz-maritime', enabledLayers: ['conflicts', 'ais', 'military', 'waterways'], hiddenLayers: [], focusAisLive: true },
    playbackEnabled: true,
    playbackResolution: '1h',
    defaultTimeRange: '48h',
    labels: { primaryChartTitle: 'Operational Vessel Flow', chartLegendA: 'Operational Events', chartLegendB: 'Alerts' },
  }),
  ukraine: profileFor('ukraine', {
    viewFamily: 'warfare',
    modules: ['headlineMetrics', 'timeline', 'droneReports', 'casualties', 'strikeTempo', 'militaryPosture', 'incidentFeed', 'infrastructure'],
    overlay: { id: 'ukraine-war', enabledLayers: ['conflicts', 'military', 'flights', 'bases', 'waterways', 'ucdpEvents'], hiddenLayers: [], focusAisLive: false },
    playbackEnabled: true,
    playbackResolution: '1h',
    defaultTimeRange: '7d',
    labels: { primaryChartTitle: 'Drone & Strike Tempo', chartLegendA: 'Drone Reports', chartLegendB: 'Alerts' },
  }),
  gaza: profileFor('gaza', {
    viewFamily: 'humanitarian',
    modules: ['headlineMetrics', 'timeline', 'casualties', 'displacement', 'aidAccess', 'incidentFeed', 'infrastructure'],
    overlay: { id: 'gaza-humanitarian', enabledLayers: ['conflicts', 'military', 'flights', 'bases'], hiddenLayers: [], focusAisLive: false },
    playbackEnabled: true,
    playbackResolution: '1h',
    defaultTimeRange: '7d',
    labels: { primaryChartTitle: 'Humanitarian Pressure', chartLegendA: 'Conflict Mentions', chartLegendB: 'Alerts' },
  }),
  south_lebanon: profileFor('south_lebanon', {
    viewFamily: 'humanitarian',
    modules: ['headlineMetrics', 'timeline', 'casualties', 'displacement', 'strikeTempo', 'incidentFeed', 'militaryPosture'],
    overlay: { id: 'south-lebanon-border', enabledLayers: ['conflicts', 'military', 'flights', 'bases'], hiddenLayers: [], focusAisLive: false },
    playbackEnabled: true,
    playbackResolution: '1h',
    defaultTimeRange: '7d',
    labels: { primaryChartTitle: 'Cross-Border Exchange Tempo', chartLegendA: 'Mentions', chartLegendB: 'Alerts' },
  }),
  yemen_redsea: profileFor('yemen_redsea', {
    viewFamily: 'maritime',
    modules: ['headlineMetrics', 'timeline', 'vesselTracks', 'crossings', 'militaryPosture', 'incidentFeed', 'infrastructure'],
    overlay: { id: 'red-sea-maritime', enabledLayers: ['conflicts', 'ais', 'military', 'waterways', 'cables'], hiddenLayers: [], focusAisLive: true },
    playbackEnabled: true,
    playbackResolution: '1h',
    defaultTimeRange: '48h',
    labels: { primaryChartTitle: 'Shipping Disruption Pressure', chartLegendA: 'Operational Events', chartLegendB: 'Alerts' },
  }),
  sudan: profileFor('sudan', {
    viewFamily: 'humanitarian',
    modules: ['headlineMetrics', 'timeline', 'casualties', 'displacement', 'aidAccess', 'incidentFeed', 'infrastructure'],
    overlay: { id: 'sudan-humanitarian', enabledLayers: ['conflicts', 'flights', 'military'], hiddenLayers: [], focusAisLive: false },
    playbackEnabled: true,
    playbackResolution: '1h',
    defaultTimeRange: '7d',
    labels: { primaryChartTitle: 'Conflict & Displacement Pressure', chartLegendA: 'Mentions', chartLegendB: 'Alerts' },
  }),
  myanmar: profileFor('myanmar', {
    viewFamily: 'humanitarian',
    modules: ['headlineMetrics', 'timeline', 'casualties', 'displacement', 'strikeTempo', 'incidentFeed', 'infrastructure'],
    overlay: { id: 'myanmar-insurgency', enabledLayers: ['conflicts', 'flights', 'military'], hiddenLayers: [], focusAisLive: false },
    playbackEnabled: true,
    playbackResolution: '1h',
    defaultTimeRange: '7d',
    labels: { primaryChartTitle: 'Operational Tempo', chartLegendA: 'Mentions', chartLegendB: 'Alerts' },
  }),
  korean_dmz: profileFor('korean_dmz', {
    viewFamily: 'border',
    modules: ['headlineMetrics', 'timeline', 'militaryPosture', 'incidentFeed', 'infrastructure'],
    overlay: { id: 'korean-dmz-watch', enabledLayers: ['conflicts', 'military', 'flights', 'bases'], hiddenLayers: [], focusAisLive: false },
    playbackEnabled: true,
    playbackResolution: '1h',
    defaultTimeRange: '48h',
    labels: { primaryChartTitle: 'Deterrence Watch', chartLegendA: 'Mentions', chartLegendB: 'Alerts' },
  }),
  pak_afghan: profileFor('pak_afghan', {
    viewFamily: 'border',
    modules: ['headlineMetrics', 'timeline', 'casualties', 'displacement', 'incidentFeed', 'militaryPosture'],
    overlay: { id: 'pak-afghan-border', enabledLayers: ['conflicts', 'military', 'flights'], hiddenLayers: [], focusAisLive: false },
    playbackEnabled: true,
    playbackResolution: '1h',
    defaultTimeRange: '48h',
    labels: { primaryChartTitle: 'Border Pressure', chartLegendA: 'Mentions', chartLegendB: 'Alerts' },
  }),
};

export function getConflictProfile(conflict: ConflictZone): ConflictProfile | null {
  return CONFLICT_PROFILES[conflict.id] ?? null;
}
