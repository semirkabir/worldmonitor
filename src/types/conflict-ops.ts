import type { MapLayers } from '@/types';

export type ConflictViewFamily = 'generic' | 'maritime' | 'warfare' | 'humanitarian' | 'border';

export type ConflictModule =
  | 'headlineMetrics'
  | 'timeline'
  | 'vesselTracks'
  | 'crossings'
  | 'oilMetrics'
  | 'droneReports'
  | 'casualties'
  | 'displacement'
  | 'aidAccess'
  | 'militaryPosture'
  | 'strikeTempo'
  | 'incidentFeed'
  | 'infrastructure';

export interface ConflictAOI {
  center: [number, number];
  polygon: [number, number][];
  zoom?: number;
}

export interface ConflictOverlayPreset {
  id: string;
  enabledLayers: Array<keyof MapLayers>;
  hiddenLayers?: Array<keyof MapLayers>;
  focusAisLive?: boolean;
}

export interface ConflictProfile {
  id: string;
  viewFamily: ConflictViewFamily;
  modules: ConflictModule[];
  overlay: ConflictOverlayPreset;
  playbackEnabled: boolean;
  playbackResolution: '1h';
  defaultTimeRange: '24h' | '48h' | '7d' | 'all';
  aoi: ConflictAOI;
  labels?: {
    primaryChartTitle?: string;
    chartLegendA?: string;
    chartLegendB?: string;
  };
}

export interface ConflictHeadlineMetric {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'info';
  delta?: string;
}

export interface ConflictSeriesPoint {
  timestamp: number;
  primary: number;
  secondary?: number;
}

export interface ConflictOpsIncident {
  id: string;
  title: string;
  timestamp: number;
  category: string;
  summary?: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface ConflictOilMetric {
  label: string;
  value: string;
  delta: string;
  tone?: 'positive' | 'danger' | 'neutral';
}

export interface ConflictVesselTrackPoint {
  lat: number;
  lon: number;
  timestamp: number;
}

export interface ConflictVesselTrack {
  id: string;
  name: string;
  class: 'commercial' | 'military' | 'unknown';
  direction?: 'inbound' | 'outbound' | 'stationary';
  speed?: number;
  heading?: number;
  points: ConflictVesselTrackPoint[];
}

export interface ConflictVesselSnapshot {
  timestamp: number;
  vessels: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    class: 'commercial' | 'military' | 'unknown';
    direction?: 'inbound' | 'outbound' | 'stationary';
  }>;
}

export interface ConflictOpsSnapshot {
  profile: ConflictProfile;
  asOf: number;
  metrics: ConflictHeadlineMetric[];
  series: ConflictSeriesPoint[];
  incidents: ConflictOpsIncident[];
  summary: string[];
  oilMetrics?: ConflictOilMetric[];
  crossings?: {
    crossingEvents: number;
    inbound: number;
    outbound: number;
    uniqueVessels: number;
    darkTransitCount?: number;
  };
  warfare?: {
    droneReports?: number;
    killingsReported?: string;
    strikeEvents?: number;
  };
  humanitarian?: {
    displaced?: string;
    aidStatus?: string;
  };
  nearbyAssets?: Array<{ id: string; name: string; type: string; distanceKm: number }>;
  nearbyMilitary?: {
    flights: number;
    vessels: number;
    darkVessels: number;
  };
  liveAis?: {
    connected: boolean;
    trackedVessels: number;
    disruptions: number;
    densityZones: number;
  };
  vesselTracks?: ConflictVesselTrack[];
  hourlySnapshots?: ConflictVesselSnapshot[];
}
