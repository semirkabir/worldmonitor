import { buildMapUrl } from '@/utils';
import type { MapContainer, TimeRange } from '@/components';
import type { CountryBriefPanel } from '@/components/CountryBriefPanel';
import type { MapLayers } from '@/types';
import type { MapView } from '@/components';

interface ShareableMapState {
  view: MapView;
  zoom: number;
  timeRange: TimeRange;
  layers: MapLayers;
}

export function buildShareUrl(
  map: MapContainer | null,
  briefPage: CountryBriefPanel | null,
  baseUrl: string,
): string | null {
  if (!map) return null;

  const state = map.getState() as ShareableMapState;
  const center = map.getCenter() as { lat: number; lon: number } | null;
  const isCountryVisible = briefPage?.isVisible() ?? false;

  return buildMapUrl(baseUrl, {
    view: state.view,
    zoom: state.zoom,
    center,
    timeRange: state.timeRange,
    layers: state.layers,
    country: isCountryVisible ? (briefPage?.getCode() ?? undefined) : undefined,
    expanded: isCountryVisible && briefPage?.getIsMaximized?.() ? true : undefined,
  });
}

export function getHeaderThemeIconHtml(isDark: boolean): string {
  return isDark
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
}
