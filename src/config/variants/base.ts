// Base configuration shared across all variants
import type { PanelConfig, MapLayers } from '@/types';

// Shared exports (re-exported by all variants)
export { SECTORS, COMMODITIES, MARKET_SYMBOLS } from '../markets';
export { UNDERSEA_CABLES } from '../geo';
export { AI_DATA_CENTERS } from '../ai-datacenters';

// Idle pause duration - shared across map and stream panels (5 minutes)
export const IDLE_PAUSE_MS = 5 * 60 * 1000;

// Refresh intervals for logged-in users
export const REFRESH_INTERVALS = {
  feeds: 20 * 60 * 1000,
  markets: 12 * 60 * 1000,
  crypto: 12 * 60 * 1000,
  predictions: 15 * 60 * 1000,
  ais: 15 * 60 * 1000,
  pizzint: 10 * 60 * 1000,
  natural: 60 * 60 * 1000,
  weather: 10 * 60 * 1000,
  fred: 30 * 60 * 1000,
  oil: 30 * 60 * 1000,
  spending: 60 * 60 * 1000,
  bis: 60 * 60 * 1000,
  firms: 30 * 60 * 1000,
  flights: 2 * 60 * 60 * 1000,
  cables: 30 * 60 * 1000,
  cableHealth: 2 * 60 * 60 * 1000,
  cyberThreats: 15 * 60 * 1000,
  gdelt: 15 * 60 * 1000,
  acled: 15 * 60 * 1000,
  opensky: 15 * 60 * 1000,
  economic: 30 * 60 * 1000,
  webcams: 30 * 60 * 1000,
};

// Refresh intervals for anonymous users (throttled more aggressively)
export const REFRESH_INTERVALS_ANON = {
  feeds: 10 * 60 * 1000,
  markets: 10 * 60 * 1000,
  crypto: 10 * 60 * 1000,
  predictions: 10 * 60 * 1000,
  ais: 10 * 60 * 1000,
  pizzint: 30 * 60 * 1000,
  natural: 60 * 60 * 1000,
  weather: 30 * 60 * 1000,
  fred: 60 * 60 * 1000,
  oil: 60 * 60 * 1000,
  spending: 60 * 60 * 1000,
  bis: 60 * 60 * 1000,
  firms: 60 * 60 * 1000,
  flights: 60 * 60 * 1000,
  cables: 60 * 60 * 1000,
  cableHealth: 60 * 60 * 1000,
  cyberThreats: 30 * 60 * 1000,
  gdelt: 30 * 60 * 1000,
  acled: 30 * 60 * 1000,
  opensky: 30 * 60 * 1000,
  economic: 60 * 60 * 1000,
  webcams: 60 * 60 * 1000,
};

// Monitor colors - shared
export const MONITOR_COLORS = [
  '#44ff88',
  '#ff8844',
  '#4488ff',
  '#ff44ff',
  '#ffff44',
  '#ff4444',
  '#44ffff',
  '#88ff44',
  '#ff88ff',
  '#88ffff',
];

// Storage keys - shared
export const STORAGE_KEYS = {
  panels: 'worldmonitor-panels',
  monitors: 'worldmonitor-monitors',
  mapLayers: 'worldmonitor-layers',
  disabledFeeds: 'worldmonitor-disabled-feeds',
  liveChannels: 'worldmonitor-live-channels',
  mapMode: 'worldmonitor-map-mode',          // 'flat' | 'globe'
  layoutMode: 'worldmonitor-layout-mode',    // 'bottom' | 'side'
} as const;

// Type definitions for variant configs
export interface VariantConfig {
  name: string;
  description: string;
  panels: Record<string, PanelConfig>;
  mapLayers: MapLayers;
  mobileMapLayers: MapLayers;
}
