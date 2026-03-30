/**
 * DeckGLMap - WebGL-accelerated map visualization for desktop
 * Uses deck.gl for high-performance rendering of large datasets
 * Mobile devices gracefully degrade to the D3/SVG-based Map component
 */
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Layer, LayersList, PickingInfo } from '@deck.gl/core';
import { GeoJsonLayer, ScatterplotLayer, PathLayer, IconLayer, TextLayer, PolygonLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import { registerPMTilesProtocol, FALLBACK_DARK_STYLE, FALLBACK_LIGHT_STYLE, getUnifiedTheme, setUnifiedTheme, resolveUnifiedTheme, UNIFIED_THEME_OPTIONS, THEME_LAYER_OVERRIDES, getStyleForProvider, isLightMapTheme, CUSTOM_THEME_FILTERS } from '@/config/basemap';
import Supercluster from 'supercluster';
import type {
  MapLayers,
  Hotspot,
  NewsItem,
  InternetOutage,
  RelatedAsset,
  AssetType,
  AisDisruptionEvent,
  AisDensityZone,
  CableAdvisory,
  RepairShip,
  SocialUnrestEvent,
  AIDataCenter,
  MilitaryFlight,
  MilitaryVessel,
  MilitaryFlightCluster,
  MilitaryVesselCluster,
  NaturalEvent,
  UcdpGeoEvent,
  MapProtestCluster,
  MapTechHQCluster,
  MapTechEventCluster,
  MapDatacenterCluster,
  CyberThreat,
  CableHealthRecord,
  MilitaryBaseEnriched,
} from '@/types';
import { fetchMilitaryBases, type MilitaryBaseCluster as ServerBaseCluster } from '@/services/military-bases';
import type { AirportDelayAlert, PositionSample } from '@/services/aviation';
import { fetchAircraftPositions } from '@/services/aviation';
import { registerAisCallback, unregisterAisCallback, type AisPositionData } from '@/services/maritime';
import { type IranEvent } from '@/services/conflict';
import type { GpsJamHex } from '@/services/gps-interference';
import type { DisplacementFlow } from '@/services/displacement';
import type { Earthquake } from '@/services/earthquakes';
import type { ClimateAnomaly } from '@/services/climate';
import { ArcLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import type { WeatherAlert } from '@/services/weather';
import { escapeHtml } from '@/utils/sanitize';
import { tokenizeForMatch, matchKeyword, matchesAnyKeyword, findMatchingKeywords } from '@/utils/keyword-match';
import { t } from '@/services/i18n';
import { debounce, rafSchedule, getCurrentTheme } from '@/utils/index';
import { showLayerWarning } from '@/utils/layer-warning';
import { localizeMapLabels } from '@/utils/map-locale';
import {
  INTEL_HOTSPOTS,
  CONFLICT_ZONES,

  MILITARY_BASES,
  UNDERSEA_CABLES,
  NUCLEAR_FACILITIES,
  GAMMA_IRRADIATORS,
  PIPELINES,
  PIPELINE_COLORS,
  STRATEGIC_WATERWAYS,
  ECONOMIC_CENTERS,
  AI_DATA_CENTERS,
  SITE_VARIANT,
  STARTUP_HUBS,
  ACCELERATORS,
  TECH_HQS,
  CLOUD_REGIONS,
  PORTS,
  SPACEPORTS,
  APT_GROUPS,
  CRITICAL_MINERALS,
  STOCK_EXCHANGES,
  FINANCIAL_CENTERS,
  CENTRAL_BANKS,
  COMMODITY_HUBS,
  GULF_INVESTMENTS,
  MINING_SITES,
  PROCESSING_PLANTS,
  COMMODITY_PORTS as COMMODITY_GEO_PORTS,
} from '@/config';
import type { GulfInvestment } from '@/types';
import { resolveTradeRouteSegments, TRADE_ROUTES as TRADE_ROUTES_LIST, type TradeRouteSegment } from '@/config/trade-routes';
import { getLayersForVariant, resolveLayerLabel, resolveLayerAccentColor, resolveLayerIcon, type MapVariant } from '@/config/map-layer-definitions';
import { getSecretState } from '@/services/runtime-config';
import { MapPopup, type PopupType } from './MapPopup';
import {
  updateHotspotEscalation,
  getHotspotEscalation,
  setMilitaryData,
  setCIIGetter,
  setGeoAlertGetter,
} from '@/services/hotspot-escalation';
import { getCountryScore } from '@/services/country-instability';
import { getAlertsNearLocation } from '@/services/geo-convergence';
import type { PositiveGeoEvent } from '@/services/positive-events-geo';
import type { KindnessPoint } from '@/services/kindness-data';
import type { HappinessData } from '@/services/happiness-data';
import type { RenewableInstallation } from '@/services/renewable-installations';
import type { SpeciesRecovery } from '@/services/conservation-data';
import { getCountriesGeoJson, getCountryAtCoordinates, getCountryBbox } from '@/services/country-geometry';
import type { FeatureCollection, Geometry } from 'geojson';
import { getTrayOpenPreference, setTrayOpenPreference } from '@/app/ui-preferences';

export type TimeRange = '1h' | '6h' | '24h' | '48h' | '7d' | 'all';
export type DeckMapView = 'global' | 'america' | 'mena' | 'eu' | 'asia' | 'latam' | 'africa' | 'oceania';
type MapInteractionMode = 'flat' | '3d';

// ─── Custom categories ────────────────────────────────────────────────────────
interface CustomCategory {
  id: string;
  name: string;
  layers: (keyof MapLayers)[];
}

const CC_STORAGE_KEY = 'wm-custom-categories';

function loadCustomCategories(): CustomCategory[] {
  try {
    const raw = localStorage.getItem(CC_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomCategory[]) : [];
  } catch { return []; }
}

function saveCustomCategories(cats: CustomCategory[]): void {
  try { localStorage.setItem(CC_STORAGE_KEY, JSON.stringify(cats)); } catch { /* ignore */ }
}

export interface CountryClickPayload {
  lat: number;
  lon: number;
  code?: string;
  name?: string;
}

interface DeckMapState {
  zoom: number;
  pan: { x: number; y: number };
  view: DeckMapView;
  layers: MapLayers;
  timeRange: TimeRange;
}

interface HotspotWithBreaking extends Hotspot {
  hasBreaking?: boolean;
}

interface TechEventMarker {
  id: string;
  title: string;
  location: string;
  lat: number;
  lng: number;
  country: string;
  startDate: string;
  endDate: string;
  url: string | null;
  daysUntil: number;
}

// View presets with longitude, latitude, zoom
const VIEW_PRESETS: Record<DeckMapView, { longitude: number; latitude: number; zoom: number }> = {
  global: { longitude: 0, latitude: 20, zoom: 1.5 },
  america: { longitude: -95, latitude: 38, zoom: 3 },
  mena: { longitude: 45, latitude: 28, zoom: 3.5 },
  eu: { longitude: 15, latitude: 50, zoom: 3.5 },
  asia: { longitude: 105, latitude: 35, zoom: 3 },
  latam: { longitude: -60, latitude: -15, zoom: 3 },
  africa: { longitude: 20, latitude: 5, zoom: 3 },
  oceania: { longitude: 135, latitude: -25, zoom: 3.5 },
};

const MAP_INTERACTION_MODE: MapInteractionMode =
  import.meta.env.VITE_MAP_INTERACTION_MODE === 'flat' ? 'flat' : '3d';

const HAPPY_DARK_STYLE = '/map-styles/happy-dark.json';
const HAPPY_LIGHT_STYLE = '/map-styles/happy-light.json';
const isHappyVariant = SITE_VARIANT === 'happy';

// Zoom thresholds for layer visibility and labels (matches old Map.ts)
// Zoom-dependent layer visibility and labels
const LAYER_ZOOM_THRESHOLDS: Partial<Record<keyof MapLayers, { minZoom: number; showLabels?: number }>> = {
  conflicts: { minZoom: 1, showLabels: 3 },
  natural: { minZoom: 1, showLabels: 2 },
  bases: { minZoom: 1, showLabels: 5 },
  gulfInvestments: { minZoom: 1, showLabels: 5 },
};
// Export for external use
export { LAYER_ZOOM_THRESHOLDS };

// Theme-aware overlay color function — refreshed each buildLayers() call
function getOverlayColors() {
  const isLight = getCurrentTheme() === 'light';
  return {
    // Threat dots: IDENTICAL in both modes (user locked decision)
    hotspotHigh: [255, 68, 68, 200] as [number, number, number, number],
    hotspotElevated: [255, 165, 0, 200] as [number, number, number, number],
    hotspotLow: [255, 255, 0, 180] as [number, number, number, number],

    // Conflict zone fills: more transparent in light mode
    conflict: isLight
      ? [255, 0, 0, 60] as [number, number, number, number]
      : [255, 0, 0, 100] as [number, number, number, number],

    // Infrastructure/category markers: darker variants in light mode for map readability
    base: [0, 150, 255, 200] as [number, number, number, number],
    nuclear: isLight
      ? [180, 120, 0, 220] as [number, number, number, number]
      : [255, 215, 0, 200] as [number, number, number, number],
    datacenter: isLight
      ? [13, 148, 136, 200] as [number, number, number, number]
      : [0, 255, 200, 180] as [number, number, number, number],
    cable: [0, 200, 255, 150] as [number, number, number, number],
    cableHighlight: [255, 100, 100, 200] as [number, number, number, number],
    cableFault: [255, 50, 50, 220] as [number, number, number, number],
    cableDegraded: [255, 165, 0, 200] as [number, number, number, number],
    earthquake: [255, 100, 50, 200] as [number, number, number, number],
    vesselMilitary: [255, 100, 100, 220] as [number, number, number, number],
    flightMilitary: [255, 50, 50, 220] as [number, number, number, number],
    protest: [255, 150, 0, 200] as [number, number, number, number],
    outage: [255, 50, 50, 180] as [number, number, number, number],
    weather: [100, 150, 255, 180] as [number, number, number, number],
    startupHub: isLight
      ? [22, 163, 74, 220] as [number, number, number, number]
      : [0, 255, 150, 200] as [number, number, number, number],
    techHQ: [100, 200, 255, 200] as [number, number, number, number],
    accelerator: isLight
      ? [180, 120, 0, 220] as [number, number, number, number]
      : [255, 200, 0, 200] as [number, number, number, number],
    cloudRegion: [150, 100, 255, 180] as [number, number, number, number],
    stockExchange: isLight
      ? [20, 120, 200, 220] as [number, number, number, number]
      : [80, 200, 255, 210] as [number, number, number, number],
    financialCenter: isLight
      ? [0, 150, 110, 215] as [number, number, number, number]
      : [0, 220, 150, 200] as [number, number, number, number],
    centralBank: isLight
      ? [180, 120, 0, 220] as [number, number, number, number]
      : [255, 210, 80, 210] as [number, number, number, number],
    commodityHub: isLight
      ? [190, 95, 40, 220] as [number, number, number, number]
      : [255, 150, 80, 200] as [number, number, number, number],
    gulfInvestmentSA: [0, 168, 107, 220] as [number, number, number, number],
    gulfInvestmentUAE: [255, 0, 100, 220] as [number, number, number, number],
    ucdpStateBased: [255, 50, 50, 200] as [number, number, number, number],
    ucdpNonState: [255, 165, 0, 200] as [number, number, number, number],
    ucdpOneSided: [255, 255, 0, 200] as [number, number, number, number],
  };
}
// Cached overlay colors — only recomputed when the theme actually changes
let COLORS = getOverlayColors();
let _colorsTheme = getCurrentTheme();
function refreshColorsIfThemeChanged(): void {
  const theme = getCurrentTheme();
  if (theme !== _colorsTheme) {
    _colorsTheme = theme;
    COLORS = getOverlayColors();
  }
}

const SHARED_LAYER_ICON_MAPPING = { marker: { x: 0, y: 0, width: 32, height: 32, mask: false } };
const SHARED_LAYER_ICON_ATLAS_CACHE = new Map<string, string>();

// AIS vessel icon — ship silhouette (white, for mask-mode tinting by ship type)
const AIS_VESSEL_ICON_MAPPING = { ship: { x: 0, y: 0, width: 64, height: 64, mask: true } };
const AIS_VESSEL_ICON_ATLAS = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg viewBox="0 0 24 24" width="64" height="64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h16"/><path d="M7 14V9h10v5"/><path d="M3 17c1.2 1 2.4 1.5 3.5 1.5S8.8 18 10 17c1.2 1 2.4 1.5 3.5 1.5S15.8 18 17 17c1.2 1 2.4 1.5 3.5 1.5"/><path d="M12 5v4"/></svg>'
)}`;

// Port icon — anchor (white, for mask-mode tinting by port type)
const AIS_PORT_ICON_MAPPING = { anchor: { x: 0, y: 0, width: 64, height: 64, mask: true } };
const AIS_PORT_ICON_ATLAS = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg viewBox="0 0 24 24" width="64" height="64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10"/><circle cx="12" cy="4" r="1.5" fill="white"/><path d="M7 12a5 5 0 0 0 10 0"/><path d="M5 14a7 7 0 0 0 14 0"/></svg>'
)}`;

const AVIATION_AIRPORT_ICON_MAPPING = { airport: { x: 0, y: 0, width: 512, height: 512, mask: false } };
const AVIATION_AIRPORT_ICON_ATLAS = '/icons/airport.png';

const AVIATION_PLANE_ICON_MAPPING = { plane: { x: 0, y: 0, width: 512, height: 512, mask: false } };
const AVIATION_PLANE_ICON_ATLAS = '/icons/plane.png';

function getThemeMode(): 'light' | 'dark' {
  return getCurrentTheme() === 'light' ? 'light' : 'dark';
}

function getSharedLayerIconAtlas(layer: keyof MapLayers, theme: 'light' | 'dark' = getThemeMode()): string {
  const cacheKey = `${layer}:${theme}`;
  const cached = SHARED_LAYER_ICON_ATLAS_CACHE.get(cacheKey);
  if (cached) return cached;

  const color = resolveLayerAccentColor(layer, theme);
  const markup = resolveLayerIcon(layer);
  const svg = markup.replace(
    '<svg ',
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" style="color:${color}" `,
  );
  const atlas = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  SHARED_LAYER_ICON_ATLAS_CACHE.set(cacheKey, atlas);
  return atlas;
}

const CONFLICT_ZONES_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: CONFLICT_ZONES.map(zone => ({
    type: 'Feature' as const,
    properties: { id: zone.id, name: zone.name, intensity: zone.intensity },
    geometry: { type: 'Polygon' as const, coordinates: [zone.coords] },
  })),
};


export class DeckGLMap {
  private static readonly MAX_CLUSTER_LEAVES = 200;

  private container: HTMLElement;
  private deckOverlay: MapboxOverlay | null = null;
  private maplibreMap: maplibregl.Map | null = null;
  private state: DeckMapState;
  private popup: MapPopup;
  private isResizing = false;
  private savedTopLat: number | null = null;
  private correctingCenter = false;

  // Data stores
  private hotspots: HotspotWithBreaking[];
  private earthquakes: Earthquake[] = [];
  private weatherAlerts: WeatherAlert[] = [];
  private outages: InternetOutage[] = [];
  private cyberThreats: CyberThreat[] = [];
  private iranEvents: IranEvent[] = [];
  private aisDisruptions: AisDisruptionEvent[] = [];
  private aisDensity: AisDensityZone[] = [];
  private aisVessels: Map<string, AisPositionData> = new Map();
  private aisLiveCallback: ((data: AisPositionData[]) => void) | null = null;
  private cableAdvisories: CableAdvisory[] = [];
  private repairShips: RepairShip[] = [];
  private healthByCableId: Record<string, CableHealthRecord> = {};
  private protests: SocialUnrestEvent[] = [];
  private militaryFlights: MilitaryFlight[] = [];
  private militaryFlightClusters: MilitaryFlightCluster[] = [];
  private militaryVessels: MilitaryVessel[] = [];
  private militaryVesselClusters: MilitaryVesselCluster[] = [];
  private serverBases: MilitaryBaseEnriched[] = [];
  private serverBaseClusters: ServerBaseCluster[] = [];
  private serverBasesLoaded = false;
  private naturalEvents: NaturalEvent[] = [];
  private firmsFireData: Array<{ lat: number; lon: number; brightness: number; frp: number; confidence: number; region: string; acq_date: string; daynight: string }> = [];
  private techEvents: TechEventMarker[] = [];
  private flightDelays: AirportDelayAlert[] = [];
  private aircraftPositions: PositionSample[] = [];
  private aircraftHistory = new Map<string, [number, number][]>();
  private readonly AIRCRAFT_HISTORY_MAX = 20;
  private selectedAircraftIcao: string | null = null;
  private selectedAircraftType: 'commercial' | 'military' | null = null;
  private aircraftFetchTimer: ReturnType<typeof setInterval> | null = null;
  private news: NewsItem[] = [];
  private newsLocations: Array<{ lat: number; lon: number; title: string; threatLevel: string; timestamp?: Date }> = [];
  private newsLocationFirstSeen = new Map<string, number>();
  private ucdpEvents: UcdpGeoEvent[] = [];
  private displacementFlows: DisplacementFlow[] = [];
  private gpsJammingHexes: GpsJamHex[] = [];
  private climateAnomalies: ClimateAnomaly[] = [];
  private tradeRouteSegments: TradeRouteSegment[] = resolveTradeRouteSegments();
  private positiveEvents: PositiveGeoEvent[] = [];
  private kindnessPoints: KindnessPoint[] = [];

  // Phase 8 overlay data
  private happinessScores: Map<string, number> = new Map();
  private happinessYear = 0;
  private happinessSource = '';
  private speciesRecoveryZones: Array<SpeciesRecovery & { recoveryZone: { name: string; lat: number; lon: number } }> = [];
  private renewableInstallations: RenewableInstallation[] = [];
  private countriesGeoJsonData: FeatureCollection<Geometry> | null = null;

  // CII choropleth data
  private ciiScoresMap: Map<string, { score: number; level: string }> = new Map();
  private ciiScoresVersion = 0;

  // Country highlight state
  private countryGeoJsonLoaded = false;
  private countryHoverSetup = false;
  private highlightedCountryCode: string | null = null;

  // Callbacks
  private onHotspotClick?: (hotspot: Hotspot) => void;
  private onTimeRangeChange?: (range: TimeRange) => void;
  private onCountryClick?: (country: CountryClickPayload) => void;
  private onEntityClick?: (type: string, data: unknown) => void;
  private entityClickConsumedAt = 0;
  private onLayerChange?: (layer: keyof MapLayers, enabled: boolean, source: 'user' | 'programmatic') => void;
  private onStateChange?: (state: DeckMapState) => void;
  private onAircraftPositionsUpdate?: (positions: PositionSample[]) => void;
  private legendEl: HTMLElement | null = null;
  private ciiLegendEl: HTMLElement | null = null;

  // Highlighted assets
  private highlightedAssets: Record<AssetType, Set<string>> = {
    pipeline: new Set(),
    cable: new Set(),
    datacenter: new Set(),
    base: new Set(),
    nuclear: new Set(),
  };

  private renderScheduled = false;
  private renderPaused = false;
  private renderPending = false;
  private webglLost = false;
  private customCategories: CustomCategory[] = loadCustomCategories();
  private usedFallbackStyle = false;
  private _globeProjection = false;
  private _globeNativeSources: string[] = [];
  private _globeNativeLayers: string[] = [];
  private _globeNativeImages: string[] = [];
  // [layerId, event, handler] tuples for cleanup
  private _globeNativeListeners: Array<[string, string, (e: maplibregl.MapLayerMouseEvent) => void]> = [];
  private styleLoadTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private tileMonitorGeneration = 0;


  private layerCache: Map<string, Layer> = new Map();
  private lastZoomThreshold = 0;
  private protestSC: Supercluster | null = null;
  private techHQSC: Supercluster | null = null;
  private techEventSC: Supercluster | null = null;
  private datacenterSC: Supercluster | null = null;
  private datacenterSCSource: AIDataCenter[] = [];
  private protestClusters: MapProtestCluster[] = [];
  private techHQClusters: MapTechHQCluster[] = [];
  private techEventClusters: MapTechEventCluster[] = [];
  private datacenterClusters: MapDatacenterCluster[] = [];
  private lastSCZoom = -1;
  private lastSCBoundsKey = '';
  private lastSCMask = '';
  private protestSuperclusterSource: SocialUnrestEvent[] = [];
  private newsPulseIntervalId: ReturnType<typeof setInterval> | null = null;
  private dayNightIntervalId: ReturnType<typeof setInterval> | null = null;
  private cachedNightPolygon: [number, number][] | null = null;
  private readonly startupTime = Date.now();
  private lastCableHighlightSignature = '';
  private lastCableHealthSignature = '';
  private lastPipelineHighlightSignature = '';
  private debouncedRebuildLayers: (() => void) & { cancel(): void };
  private debouncedFetchBases: (() => void) & { cancel(): void };
  private debouncedFetchAircraft: (() => void) & { cancel(): void };
  private rafUpdateLayers: (() => void) & { cancel(): void };
  private handleThemeChange: () => void;
  private handleMapThemeChange: () => void;
  private moveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastAircraftFetchCenter: [number, number] | null = null;
  private lastAircraftFetchZoom = -1;
  private aircraftFetchSeq = 0;

  constructor(container: HTMLElement, initialState: DeckMapState) {
    this.container = container;
    this.state = initialState;
    this.hotspots = [...INTEL_HOTSPOTS];

    this.debouncedRebuildLayers = debounce(() => {
      if (this.renderPaused || this.webglLost || !this.maplibreMap) return;
      this.maplibreMap.resize();
      try { this.deckOverlay?.setProps({ layers: this.buildLayers() }); } catch { /* map mid-teardown */ }
      this.maplibreMap.triggerRepaint();
    }, 150);
    this.debouncedFetchBases = debounce(() => this.fetchServerBases(), 300);
    this.debouncedFetchAircraft = debounce(() => this.fetchViewportAircraft(), 500);
    this.rafUpdateLayers = rafSchedule(() => {
      if (this.renderPaused || this.webglLost || !this.maplibreMap) return;
      try { this.deckOverlay?.setProps({ layers: this.buildLayers() }); } catch { /* map mid-teardown */ }
      this.maplibreMap?.triggerRepaint();
    });

    this.setupDOM();
    this.popup = new MapPopup(container);

    this.handleThemeChange = () => {
      if (isHappyVariant) {
        this.refreshLegend();
        this.switchBasemap();
        return;
      }
      const { theme: mapTheme } = resolveUnifiedTheme(getUnifiedTheme());
      const paintTheme = isLightMapTheme(mapTheme) ? 'light' as const : 'dark' as const;
      this.updateCountryLayerPaint(paintTheme);
      this.refreshLegend();
      this.render();
    };
    window.addEventListener('theme-changed', this.handleThemeChange);

    this.handleMapThemeChange = () => {
      this.switchBasemap();
    };
    window.addEventListener('map-theme-changed', this.handleMapThemeChange);

    this.initMapLibre();

    this.maplibreMap?.on('load', () => {
      localizeMapLabels(this.maplibreMap);
      this.applyThemeLayerOverrides();
      this.rebuildTechHQSupercluster();
      this.rebuildDatacenterSupercluster();
      this.initDeck();
      this.loadCountryBoundaries();
      this.fetchServerBases();
      this.render();
    });

    this.createControls();
    this.createTimeSlider();
    this.createLayerToggles();
    this.createLegend();

    // Start day/night timer only if layer is initially enabled
    if (this.state.layers.dayNight) {
      this.startDayNightTimer();
    }
  }

  private startDayNightTimer(): void {
    if (this.dayNightIntervalId) return;
    this.cachedNightPolygon = this.computeNightPolygon();
    this.dayNightIntervalId = setInterval(() => {
      this.cachedNightPolygon = this.computeNightPolygon();
      this.render();
    }, 30 * 60 * 1000);
  }

  private stopDayNightTimer(): void {
    if (this.dayNightIntervalId) {
      clearInterval(this.dayNightIntervalId);
      this.dayNightIntervalId = null;
    }
    this.cachedNightPolygon = null;
  }

  private setupDOM(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'deckgl-map-wrapper';
    wrapper.id = 'deckglMapWrapper';
    wrapper.style.cssText = 'position: relative; width: 100%; height: 100%; overflow: hidden;';

    // MapLibre container - deck.gl renders directly into MapLibre via MapboxOverlay
    const mapContainer = document.createElement('div');
    mapContainer.id = 'deckgl-basemap';
    mapContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
    wrapper.appendChild(mapContainer);

    this.container.appendChild(wrapper);
  }

  private initMapLibre(): void {
    if (maplibregl.getRTLTextPluginStatus() === 'unavailable') {
      maplibregl.setRTLTextPlugin(
        '/mapbox-gl-rtl-text.min.js',
        true,
      );
    }

    const initialUnified = getUnifiedTheme();
    const { provider: initialProvider, theme: initialMapTheme } = isHappyVariant
      ? { provider: 'openfreemap' as const, theme: 'positron' }
      : resolveUnifiedTheme(initialUnified);
    if (initialProvider === 'pmtiles' || initialProvider === 'auto') registerPMTilesProtocol();

    const preset = VIEW_PRESETS[this.state.view];
    const primaryStyle = isHappyVariant
      ? (getCurrentTheme() === 'light' ? HAPPY_LIGHT_STYLE : HAPPY_DARK_STYLE)
      : getStyleForProvider(initialProvider, initialMapTheme);
    if (!isHappyVariant && typeof primaryStyle === 'string' && !primaryStyle.includes('pmtiles')) {
      this.usedFallbackStyle = true;
      const attr = this.container.querySelector('.map-attribution');
      if (attr) attr.innerHTML = '© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    }

    this.maplibreMap = new maplibregl.Map({
      container: 'deckgl-basemap',
      style: primaryStyle,
      center: [preset.longitude, preset.latitude],
      zoom: preset.zoom,
      renderWorldCopies: false,
      attributionControl: false,
      interactive: true,
      ...(MAP_INTERACTION_MODE === 'flat'
        ? {
          maxPitch: 0,
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
        }
        : {}),
    });

    const recreateWithFallback = () => {
      if (this.usedFallbackStyle) return;
      this.usedFallbackStyle = true;
      const fallback = isLightMapTheme(initialMapTheme) ? FALLBACK_LIGHT_STYLE : FALLBACK_DARK_STYLE;
      console.warn(`[DeckGLMap] Primary basemap failed, recreating with fallback: ${fallback}`);
      const attr = this.container.querySelector('.map-attribution');
      if (attr) attr.innerHTML = '© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
      this.maplibreMap?.remove();
      this.maplibreMap = new maplibregl.Map({
        container: 'deckgl-basemap',
        style: fallback,
        center: [preset.longitude, preset.latitude],
        zoom: preset.zoom,
        renderWorldCopies: false,
        attributionControl: false,
        interactive: true,
        ...(MAP_INTERACTION_MODE === 'flat'
          ? {
            maxPitch: 0,
            pitchWithRotate: false,
            dragRotate: false,
            touchPitch: false,
          }
          : {}),
      });
      this.maplibreMap.on('load', () => {
        localizeMapLabels(this.maplibreMap);
        this.applyCanvasFilter();
        this.rebuildTechHQSupercluster();
        this.rebuildDatacenterSupercluster();
        this.initDeck();
        this.loadCountryBoundaries();
        this.fetchServerBases();
        this.render();
      });
    };

    let tileLoadOk = false;
    let tileErrorCount = 0;

    this.maplibreMap.on('error', (e: { error?: Error; message?: string }) => {
      const msg = e.error?.message ?? e.message ?? '';
      console.warn('[DeckGLMap] map error:', msg);
      if (msg.includes('Failed to fetch') || msg.includes('AJAXError') || msg.includes('CORS') || msg.includes('NetworkError') || msg.includes('403') || msg.includes('Forbidden')) {
        tileErrorCount++;
        if (!tileLoadOk && tileErrorCount >= 2) {
          recreateWithFallback();
        }
      }
    });

    this.maplibreMap.on('data', (e: { dataType?: string }) => {
      if (e.dataType === 'source') {
        tileLoadOk = true;
        if (this.styleLoadTimeoutId) {
          clearTimeout(this.styleLoadTimeoutId);
          this.styleLoadTimeoutId = null;
        }
      }
    });

    this.styleLoadTimeoutId = setTimeout(() => {
      this.styleLoadTimeoutId = null;
      if (!tileLoadOk) recreateWithFallback();
    }, 10000);

    const canvas = this.maplibreMap.getCanvas();
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.webglLost = true;
      console.warn('[DeckGLMap] WebGL context lost — will restore when browser recovers');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.webglLost = false;
      console.info('[DeckGLMap] WebGL context restored');
      this.maplibreMap?.triggerRepaint();
    });

    // Pin top edge during drag-resize: correct center shift synchronously
    // inside MapLibre's own resize() call (before it renders the frame).
    this.maplibreMap.on('move', () => {
      if (this.correctingCenter || !this.isResizing || !this.maplibreMap) return;
      if (this.savedTopLat === null) return;

      const w = this.maplibreMap.getCanvas().clientWidth;
      if (w <= 0) return;
      const currentTop = this.maplibreMap.unproject([w / 2, 0]).lat;
      const delta = this.savedTopLat - currentTop;

      if (Math.abs(delta) > 1e-6) {
        this.correctingCenter = true;
        const c = this.maplibreMap.getCenter();
        const clampedLat = Math.max(-90, Math.min(90, c.lat + delta));
        this.maplibreMap.jumpTo({ center: [c.lng, clampedLat] });
        this.correctingCenter = false;
        // Do NOT update savedTopLat — keep the original mousedown position
        // so every frame targets the exact same geographic anchor.
      }
    });
  }

  private initDeck(): void {
    if (!this.maplibreMap) return;

    this.deckOverlay = new MapboxOverlay({
      interleaved: true,
      layers: this.buildLayers(),
      // Disable tiny hover tooltips; use full popup on hover instead of click
      getTooltip: () => null,
      onHover: (info: PickingInfo) => {
        // Show rich popup when hovering an object; clear when leaving
        if (info.object) {
          this.handleClick(info);
        } else {
          this.popup.hide();
        }
      },
      onClick: (info: PickingInfo) => {
        if (info.object) {
          this.handleEntityClick(info);
        } else {
          // Empty map click — clear any active aircraft trajectory
          if (this.selectedAircraftIcao) {
            this.selectedAircraftIcao = null;
            this.selectedAircraftType = null;
            this.render();
          }
          if (info.coordinate && this.onCountryClick) {
            const [lon, lat] = info.coordinate as [number, number];
            const country = this.resolveCountryFromCoordinate(lon, lat);
            this.onCountryClick({ lat, lon, ...(country ? { code: country.code, name: country.name } : {}) });
          }
        }
      },
      pickingRadius: 10,
      useDevicePixels: window.devicePixelRatio > 2 ? 2 : true,
      onError: (error: Error) => console.warn('[DeckGLMap] Render error (non-fatal):', error.message),
    });

    this.maplibreMap.addControl(this.deckOverlay as unknown as maplibregl.IControl);

    this.maplibreMap.on('movestart', () => {
      if (this.moveTimeoutId) {
        clearTimeout(this.moveTimeoutId);
        this.moveTimeoutId = null;
      }
    });

    this.maplibreMap.on('moveend', () => {
      this.lastSCZoom = -1;
      this.rafUpdateLayers();
      this.debouncedFetchBases();
      this.debouncedFetchAircraft();
      this.state.zoom = this.maplibreMap?.getZoom() ?? this.state.zoom;
      this.onStateChange?.(this.state);
    });

    this.maplibreMap.on('move', () => {
      if (this.moveTimeoutId) clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = setTimeout(() => {
        this.lastSCZoom = -1;
        this.rafUpdateLayers();
      }, 100);
    });

    this.maplibreMap.on('zoom', () => {
      if (this.moveTimeoutId) clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = setTimeout(() => {
        this.lastSCZoom = -1;
        this.rafUpdateLayers();
      }, 100);
    });

    this.maplibreMap.on('zoomend', () => {
      const currentZoom = Math.floor(this.maplibreMap?.getZoom() || 2);
      const thresholdCrossed = Math.abs(currentZoom - this.lastZoomThreshold) >= 1;
      if (thresholdCrossed) {
        this.lastZoomThreshold = currentZoom;
        this.debouncedRebuildLayers();
      }
      this.state.zoom = this.maplibreMap?.getZoom() ?? this.state.zoom;
      this.onStateChange?.(this.state);
    });
  }

  public setIsResizing(value: boolean): void {
    this.isResizing = value;
    if (value && this.maplibreMap) {
      const w = this.maplibreMap.getCanvas().clientWidth;
      if (w > 0) {
        this.savedTopLat = this.maplibreMap.unproject([w / 2, 0]).lat;
      }
    } else {
      this.savedTopLat = null;
    }
  }

  public resize(): void {
    this.maplibreMap?.resize();
  }

  private getSetSignature(set: Set<string>): string {
    return [...set].sort().join('|');
  }

  private hasRecentNews(now = Date.now()): boolean {
    for (const ts of this.newsLocationFirstSeen.values()) {
      if (now - ts < 30_000) return true;
    }
    return false;
  }

  private getTimeRangeMs(range: TimeRange = this.state.timeRange): number {
    const ranges: Record<TimeRange, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '48h': 48 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      'all': Infinity,
    };
    return ranges[range];
  }

  private parseTime(value: Date | string | number | undefined | null): number | null {
    if (value == null) return null;
    const ts = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  private filterByTime<T>(
    items: T[],
    getTime: (item: T) => Date | string | number | undefined | null
  ): T[] {
    if (this.state.timeRange === 'all') return items;
    const cutoff = Date.now() - this.getTimeRangeMs();
    return items.filter((item) => {
      const ts = this.parseTime(getTime(item));
      return ts == null ? true : ts >= cutoff;
    });
  }

  private getFilteredProtests(): SocialUnrestEvent[] {
    return this.filterByTime(this.protests, (event) => event.time);
  }

  private filterMilitaryFlightClustersByTime(clusters: MilitaryFlightCluster[]): MilitaryFlightCluster[] {
    return clusters
      .map((cluster) => {
        const flights = this.filterByTime(cluster.flights ?? [], (flight) => flight.lastSeen);
        if (flights.length === 0) return null;
        return {
          ...cluster,
          flights,
          flightCount: flights.length,
        };
      })
      .filter((cluster): cluster is MilitaryFlightCluster => cluster !== null);
  }

  private filterMilitaryVesselClustersByTime(clusters: MilitaryVesselCluster[]): MilitaryVesselCluster[] {
    return clusters
      .map((cluster) => {
        const vessels = this.filterByTime(cluster.vessels ?? [], (vessel) => vessel.lastAisUpdate);
        if (vessels.length === 0) return null;
        return {
          ...cluster,
          vessels,
          vesselCount: vessels.length,
        };
      })
      .filter((cluster): cluster is MilitaryVesselCluster => cluster !== null);
  }

  private rebuildProtestSupercluster(source: SocialUnrestEvent[] = this.getFilteredProtests()): void {
    this.protestSuperclusterSource = source;
    const points = source.map((p, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] as [number, number] },
      properties: {
        index: i,
        country: p.country,
        severity: p.severity,
        eventType: p.eventType,
        sourceType: p.sourceType,
        validated: Boolean(p.validated),
        fatalities: Number.isFinite(p.fatalities) ? Number(p.fatalities) : 0,
        timeMs: p.time.getTime(),
      },
    }));
    this.protestSC = new Supercluster({
      radius: 60,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => ({
        index: Number(props.index ?? 0),
        country: String(props.country ?? ''),
        maxSeverityRank: props.severity === 'high' ? 2 : props.severity === 'medium' ? 1 : 0,
        riotCount: props.eventType === 'riot' ? 1 : 0,
        highSeverityCount: props.severity === 'high' ? 1 : 0,
        verifiedCount: props.validated ? 1 : 0,
        totalFatalities: Number(props.fatalities ?? 0) || 0,
        riotTimeMs: props.eventType === 'riot' && props.sourceType !== 'gdelt' && Number.isFinite(Number(props.timeMs)) ? Number(props.timeMs) : 0,
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.maxSeverityRank = Math.max(Number(acc.maxSeverityRank ?? 0), Number(props.maxSeverityRank ?? 0));
        acc.riotCount = Number(acc.riotCount ?? 0) + Number(props.riotCount ?? 0);
        acc.highSeverityCount = Number(acc.highSeverityCount ?? 0) + Number(props.highSeverityCount ?? 0);
        acc.verifiedCount = Number(acc.verifiedCount ?? 0) + Number(props.verifiedCount ?? 0);
        acc.totalFatalities = Number(acc.totalFatalities ?? 0) + Number(props.totalFatalities ?? 0);
        const accRiot = Number(acc.riotTimeMs ?? 0);
        const propRiot = Number(props.riotTimeMs ?? 0);
        acc.riotTimeMs = Number.isFinite(propRiot) ? Math.max(accRiot, propRiot) : accRiot;
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.protestSC.load(points);
    this.lastSCZoom = -1;
  }

  private rebuildTechHQSupercluster(): void {
    const points = TECH_HQS.map((h, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [h.lon, h.lat] as [number, number] },
      properties: {
        index: i,
        city: h.city,
        country: h.country,
        type: h.type,
      },
    }));
    this.techHQSC = new Supercluster({
      radius: 50,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => ({
        index: Number(props.index ?? 0),
        city: String(props.city ?? ''),
        country: String(props.country ?? ''),
        faangCount: props.type === 'faang' ? 1 : 0,
        unicornCount: props.type === 'unicorn' ? 1 : 0,
        publicCount: props.type === 'public' ? 1 : 0,
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.faangCount = Number(acc.faangCount ?? 0) + Number(props.faangCount ?? 0);
        acc.unicornCount = Number(acc.unicornCount ?? 0) + Number(props.unicornCount ?? 0);
        acc.publicCount = Number(acc.publicCount ?? 0) + Number(props.publicCount ?? 0);
        if (!acc.city && props.city) acc.city = props.city;
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.techHQSC.load(points);
    this.lastSCZoom = -1;
  }

  private rebuildTechEventSupercluster(): void {
    const points = this.techEvents.map((e, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [e.lng, e.lat] as [number, number] },
      properties: {
        index: i,
        location: e.location,
        country: e.country,
        daysUntil: e.daysUntil,
      },
    }));
    this.techEventSC = new Supercluster({
      radius: 50,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => {
        const daysUntil = Number(props.daysUntil ?? Number.MAX_SAFE_INTEGER);
        return {
          index: Number(props.index ?? 0),
          location: String(props.location ?? ''),
          country: String(props.country ?? ''),
          soonestDaysUntil: Number.isFinite(daysUntil) ? daysUntil : Number.MAX_SAFE_INTEGER,
          soonCount: Number.isFinite(daysUntil) && daysUntil <= 14 ? 1 : 0,
        };
      },
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.soonestDaysUntil = Math.min(
          Number(acc.soonestDaysUntil ?? Number.MAX_SAFE_INTEGER),
          Number(props.soonestDaysUntil ?? Number.MAX_SAFE_INTEGER),
        );
        acc.soonCount = Number(acc.soonCount ?? 0) + Number(props.soonCount ?? 0);
        if (!acc.location && props.location) acc.location = props.location;
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.techEventSC.load(points);
    this.lastSCZoom = -1;
  }

  private rebuildDatacenterSupercluster(): void {
    const activeDCs = AI_DATA_CENTERS.filter(dc => dc.status !== 'decommissioned');
    this.datacenterSCSource = activeDCs;
    const points = activeDCs.map((dc, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [dc.lon, dc.lat] as [number, number] },
      properties: {
        index: i,
        country: dc.country,
        chipCount: dc.chipCount,
        powerMW: dc.powerMW ?? 0,
        status: dc.status,
      },
    }));
    this.datacenterSC = new Supercluster({
      radius: 70,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => ({
        index: Number(props.index ?? 0),
        country: String(props.country ?? ''),
        totalChips: Number(props.chipCount ?? 0) || 0,
        totalPowerMW: Number(props.powerMW ?? 0) || 0,
        existingCount: props.status === 'existing' ? 1 : 0,
        plannedCount: props.status === 'planned' ? 1 : 0,
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.totalChips = Number(acc.totalChips ?? 0) + Number(props.totalChips ?? 0);
        acc.totalPowerMW = Number(acc.totalPowerMW ?? 0) + Number(props.totalPowerMW ?? 0);
        acc.existingCount = Number(acc.existingCount ?? 0) + Number(props.existingCount ?? 0);
        acc.plannedCount = Number(acc.plannedCount ?? 0) + Number(props.plannedCount ?? 0);
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.datacenterSC.load(points);
    this.lastSCZoom = -1;
  }

  private updateClusterData(): void {
    const zoom = Math.floor(this.maplibreMap?.getZoom() ?? 2);
    const bounds = this.maplibreMap?.getBounds();
    if (!bounds) return;
    const bbox: [number, number, number, number] = [
      bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
    ];
    const boundsKey = `${bbox[0].toFixed(4)}:${bbox[1].toFixed(4)}:${bbox[2].toFixed(4)}:${bbox[3].toFixed(4)}`;
    const layers = this.state.layers;
    const useProtests = layers.protests && this.protestSuperclusterSource.length > 0;
    const useTechHQ = SITE_VARIANT === 'tech' && layers.techHQs;
    const useTechEvents = SITE_VARIANT === 'tech' && layers.techEvents && this.techEvents.length > 0;
    const useDatacenterClusters = layers.datacenters && zoom < 5;
    const layerMask = `${Number(useProtests)}${Number(useTechHQ)}${Number(useTechEvents)}${Number(useDatacenterClusters)}`;
    if (zoom === this.lastSCZoom && boundsKey === this.lastSCBoundsKey && layerMask === this.lastSCMask) return;
    this.lastSCZoom = zoom;
    this.lastSCBoundsKey = boundsKey;
    this.lastSCMask = layerMask;

    if (useProtests && this.protestSC) {
      this.protestClusters = this.protestSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const maxSeverityRank = Number(props.maxSeverityRank ?? 0);
          const maxSev = maxSeverityRank >= 2 ? 'high' : maxSeverityRank === 1 ? 'medium' : 'low';
          const riotCount = Number(props.riotCount ?? 0);
          const highSeverityCount = Number(props.highSeverityCount ?? 0);
          const verifiedCount = Number(props.verifiedCount ?? 0);
          const totalFatalities = Number(props.totalFatalities ?? 0);
          const clusterCount = Number(f.properties.point_count ?? 0);
          const riotTimeMs = Number(props.riotTimeMs ?? 0);
          return {
            id: `pc-${f.properties.cluster_id}`,
            _clusterId: f.properties.cluster_id!,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items: [] as SocialUnrestEvent[],
            country: String(props.country ?? ''),
            maxSeverity: maxSev as 'low' | 'medium' | 'high',
            hasRiot: riotCount > 0,
            latestRiotEventTimeMs: riotTimeMs || undefined,
            totalFatalities,
            riotCount,
            highSeverityCount,
            verifiedCount,
            sampled: clusterCount > DeckGLMap.MAX_CLUSTER_LEAVES,
          };
        }
        const item = this.protestSuperclusterSource[f.properties.index]!;
        return {
          id: `pp-${f.properties.index}`, lat: item.lat, lon: item.lon,
          count: 1, items: [item], country: item.country,
          maxSeverity: item.severity, hasRiot: item.eventType === 'riot',
          latestRiotEventTimeMs:
            item.eventType === 'riot' && item.sourceType !== 'gdelt' && Number.isFinite(item.time.getTime())
              ? item.time.getTime()
              : undefined,
          totalFatalities: item.fatalities ?? 0,
          riotCount: item.eventType === 'riot' ? 1 : 0,
          highSeverityCount: item.severity === 'high' ? 1 : 0,
          verifiedCount: item.validated ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.protestClusters = [];
    }

    if (useTechHQ && this.techHQSC) {
      this.techHQClusters = this.techHQSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const faangCount = Number(props.faangCount ?? 0);
          const unicornCount = Number(props.unicornCount ?? 0);
          const publicCount = Number(props.publicCount ?? 0);
          const clusterCount = Number(f.properties.point_count ?? 0);
          const primaryType = faangCount >= unicornCount && faangCount >= publicCount
            ? 'faang'
            : unicornCount >= publicCount
              ? 'unicorn'
              : 'public';
          return {
            id: `hc-${f.properties.cluster_id}`,
            _clusterId: f.properties.cluster_id!,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items: [] as import('@/config/tech-geo').TechHQ[],
            city: String(props.city ?? ''),
            country: String(props.country ?? ''),
            primaryType,
            faangCount,
            unicornCount,
            publicCount,
            sampled: clusterCount > DeckGLMap.MAX_CLUSTER_LEAVES,
          };
        }
        const item = TECH_HQS[f.properties.index]!;
        return {
          id: `hp-${f.properties.index}`, lat: item.lat, lon: item.lon,
          count: 1, items: [item], city: item.city, country: item.country,
          primaryType: item.type,
          faangCount: item.type === 'faang' ? 1 : 0,
          unicornCount: item.type === 'unicorn' ? 1 : 0,
          publicCount: item.type === 'public' ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.techHQClusters = [];
    }

    if (useTechEvents && this.techEventSC) {
      this.techEventClusters = this.techEventSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const clusterCount = Number(f.properties.point_count ?? 0);
          const soonestDaysUntil = Number(props.soonestDaysUntil ?? Number.MAX_SAFE_INTEGER);
          const soonCount = Number(props.soonCount ?? 0);
          return {
            id: `ec-${f.properties.cluster_id}`,
            _clusterId: f.properties.cluster_id!,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items: [] as TechEventMarker[],
            location: String(props.location ?? ''),
            country: String(props.country ?? ''),
            soonestDaysUntil: Number.isFinite(soonestDaysUntil) ? soonestDaysUntil : Number.MAX_SAFE_INTEGER,
            soonCount,
            sampled: clusterCount > DeckGLMap.MAX_CLUSTER_LEAVES,
          };
        }
        const item = this.techEvents[f.properties.index]!;
        return {
          id: `ep-${f.properties.index}`, lat: item.lat, lon: item.lng,
          count: 1, items: [item], location: item.location, country: item.country,
          soonestDaysUntil: item.daysUntil,
          soonCount: item.daysUntil <= 14 ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.techEventClusters = [];
    }

    if (useDatacenterClusters && this.datacenterSC) {
      const activeDCs = this.datacenterSCSource;
      this.datacenterClusters = this.datacenterSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const clusterCount = Number(f.properties.point_count ?? 0);
          const existingCount = Number(props.existingCount ?? 0);
          const plannedCount = Number(props.plannedCount ?? 0);
          const totalChips = Number(props.totalChips ?? 0);
          const totalPowerMW = Number(props.totalPowerMW ?? 0);
          return {
            id: `dc-${f.properties.cluster_id}`,
            _clusterId: f.properties.cluster_id!,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items: [] as AIDataCenter[],
            region: String(props.country ?? ''),
            country: String(props.country ?? ''),
            totalChips,
            totalPowerMW,
            majorityExisting: existingCount >= Math.max(1, clusterCount / 2),
            existingCount,
            plannedCount,
            sampled: clusterCount > DeckGLMap.MAX_CLUSTER_LEAVES,
          };
        }
        const item = activeDCs[f.properties.index]!;
        return {
          id: `dp-${f.properties.index}`, lat: item.lat, lon: item.lon,
          count: 1, items: [item], region: item.country, country: item.country,
          totalChips: item.chipCount, totalPowerMW: item.powerMW ?? 0,
          majorityExisting: item.status === 'existing',
          existingCount: item.status === 'existing' ? 1 : 0,
          plannedCount: item.status === 'planned' ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.datacenterClusters = [];
    }
  }




  private isLayerVisible(layerKey: keyof MapLayers): boolean {
    const threshold = LAYER_ZOOM_THRESHOLDS[layerKey];
    if (!threshold) return true;
    const zoom = this.maplibreMap?.getZoom() || 2;
    return zoom >= threshold.minZoom;
  }

  private buildLayers(): LayersList {
    const startTime = performance.now();
    refreshColorsIfThemeChanged();
    const layers: (Layer | null | false)[] = [];
    const { layers: mapLayers } = this.state;
    const filteredEarthquakes = mapLayers.natural ? this.filterByTime(this.earthquakes, (eq) => eq.occurredAt) : [];
    const filteredNaturalEvents = mapLayers.natural ? this.filterByTime(this.naturalEvents, (event) => event.date) : [];
    const filteredWeatherAlerts = mapLayers.weather ? this.filterByTime(this.weatherAlerts, (alert) => alert.onset) : [];
    const filteredOutages = mapLayers.outages ? this.filterByTime(this.outages, (outage) => outage.pubDate) : [];
    const filteredCableAdvisories = mapLayers.cables ? this.filterByTime(this.cableAdvisories, (advisory) => advisory.reported) : [];
    const filteredFlightDelays = mapLayers.flights ? this.filterByTime(this.flightDelays, (delay) => delay.updatedAt) : [];
    const filteredMilitaryFlights = mapLayers.military ? this.filterByTime(this.militaryFlights, (flight) => flight.lastSeen) : [];
    const filteredMilitaryVessels = mapLayers.military ? this.filterByTime(this.militaryVessels, (vessel) => vessel.lastAisUpdate) : [];
    const filteredMilitaryFlightClusters = mapLayers.military ? this.filterMilitaryFlightClustersByTime(this.militaryFlightClusters) : [];
    const filteredMilitaryVesselClusters = mapLayers.military ? this.filterMilitaryVesselClustersByTime(this.militaryVesselClusters) : [];
    // UCDP is a historical dataset (events aged months); time-range filter always zeroes it out
    const filteredUcdpEvents = mapLayers.ucdpEvents ? this.ucdpEvents : [];

    // Day/night overlay (rendered first as background)
    if (mapLayers.dayNight) {
      if (!this.dayNightIntervalId) this.startDayNightTimer();
      layers.push(this.createDayNightLayer());
    } else {
      if (this.dayNightIntervalId) this.stopDayNightTimer();
      this.layerCache.delete('day-night-layer');
    }

    // Undersea cables layer
    if (mapLayers.cables) {
      layers.push(this.createCablesLayer());
    } else {
      this.layerCache.delete('cables-layer');
    }

    // Pipelines layer
    if (mapLayers.pipelines) {
      layers.push(this.createPipelinesLayer());
    } else {
      this.layerCache.delete('pipelines-layer');
    }

    // Conflict zones layer
    if (mapLayers.conflicts) {
      layers.push(this.createConflictZonesLayer());
    }


    // Military bases layer — clusters at low zoom, individual markers at high zoom
    const basesZoom = this.maplibreMap?.getZoom() || 2;
    if (mapLayers.bases && this.isLayerVisible('bases')) {
      if (basesZoom >= 5) {
        layers.push(this.createBasesLayer());
      } else {
        layers.push(...this.createBasesClusterLayer());
      }
    }
    layers.push(this.createEmptyGhost('bases-layer'));

    // Nuclear facilities layer — hidden at low zoom
    if (mapLayers.nuclear && this.isLayerVisible('nuclear')) {
      layers.push(this.createNuclearLayer());
    }
    layers.push(this.createEmptyGhost('nuclear-layer'));

    // Gamma irradiators layer — hidden at low zoom
    if (mapLayers.irradiators && this.isLayerVisible('irradiators')) {
      layers.push(this.createIrradiatorsLayer());
    }

    // Spaceports layer — hidden at low zoom
    if (mapLayers.spaceports && this.isLayerVisible('spaceports')) {
      layers.push(this.createSpaceportsLayer());
    }

    // Hotspots layer (all hotspots including high/breaking, with pulse + ghost)
    if (mapLayers.hotspots) {
      layers.push(...this.createHotspotsLayers());
    }

    // Datacenters layer - SQUARE icons at zoom >= 5, cluster dots at zoom < 5
    const currentZoom = this.maplibreMap?.getZoom() || 2;
    if (mapLayers.datacenters) {
      if (currentZoom >= 5) {
        layers.push(this.createDatacentersLayer());
      } else {
        layers.push(...this.createDatacenterClusterLayers());
      }
    }

    // Earthquakes layer
    if (mapLayers.natural && filteredEarthquakes.length > 0) {
      layers.push(this.createEarthquakesLayer(filteredEarthquakes));
    }
    layers.push(this.createEmptyGhost('earthquakes-layer'));

    // Natural events layer
    if (mapLayers.natural && filteredNaturalEvents.length > 0) {
      layers.push(this.createNaturalEventsLayer(filteredNaturalEvents));
    }

    // Satellite fires layer (NASA FIRMS)
    if (mapLayers.fires && this.firmsFireData.length > 0) {
      layers.push(this.createFiresLayer());
    }

    // Iran events layer
    if (mapLayers.iranAttacks && this.iranEvents.length > 0) {
      layers.push(this.createIranEventsLayer());
      layers.push(this.createGhostLayer('iran-events-layer', this.iranEvents, d => [d.longitude, d.latitude], { radiusMinPixels: 12 }));
    }

    // Weather alerts layer
    if (mapLayers.weather && filteredWeatherAlerts.length > 0) {
      layers.push(this.createWeatherLayer(filteredWeatherAlerts));
    }

    // Internet outages layer
    if (mapLayers.outages && filteredOutages.length > 0) {
      layers.push(this.createOutagesLayer(filteredOutages));
    }
    layers.push(this.createEmptyGhost('outages-layer'));

    // Cyber threat IOC layer
    if (mapLayers.cyberThreats && this.cyberThreats.length > 0) {
      layers.push(this.createCyberThreatsLayer());
    }
    layers.push(this.createEmptyGhost('cyber-threats-layer'));

    // AIS density layer
    if (mapLayers.ais && this.aisDensity.length > 0) {
      layers.push(this.createAisDensityLayer());
    }

    // AIS disruptions layer (spoofing/jamming)
    if (mapLayers.ais && this.aisDisruptions.length > 0) {
      layers.push(this.createAisDisruptionsLayer());
    }

    // AIS live vessel positions
    if (mapLayers.ais && this.aisVessels.size > 0) {
      layers.push(this.createAisVesselsLayer());
    }

    // GPS/GNSS jamming layer
    if (mapLayers.gpsJamming && this.gpsJammingHexes.length > 0) {
      layers.push(this.createGpsJammingLayer());
    }

    // Strategic ports layer (shown with AIS)
    if (mapLayers.ais) {
      layers.push(this.createPortsLayer());
    }

    // Cable advisories layer (shown with cables)
    if (mapLayers.cables && filteredCableAdvisories.length > 0) {
      layers.push(this.createCableAdvisoriesLayer(filteredCableAdvisories));
    }

    // Repair ships layer (shown with cables)
    if (mapLayers.cables && this.repairShips.length > 0) {
      layers.push(this.createRepairShipsLayer());
    }

    // Flight delays layer
    if (mapLayers.flights && filteredFlightDelays.length > 0) {
      layers.push(this.createFlightDelaysLayer(filteredFlightDelays));
    }

    // Aircraft trajectory (trail + heading) for selected aircraft — rendered under icons
    layers.push(...this.createAircraftTrajectoryLayers());

    // Aircraft positions layer (live tracking, under flights toggle)
    if (mapLayers.flights && this.aircraftPositions.length > 0) {
      layers.push(this.createAircraftPositionsLayer());
    }

    // Protests layer (Supercluster-based deck.gl layers)
    if (mapLayers.protests && this.protests.length > 0) {
      layers.push(...this.createProtestClusterLayers());
    }

    // Military vessels layer
    if (mapLayers.military && filteredMilitaryVessels.length > 0) {
      layers.push(this.createMilitaryVesselsLayer(filteredMilitaryVessels));
    }

    // Military vessel clusters layer
    if (mapLayers.military && filteredMilitaryVesselClusters.length > 0) {
      layers.push(this.createMilitaryVesselClustersLayer(filteredMilitaryVesselClusters));
    }

    // Military flights layer
    if (mapLayers.military && filteredMilitaryFlights.length > 0) {
      layers.push(this.createMilitaryFlightsLayer(filteredMilitaryFlights));
    }

    // Military flight clusters layer
    if (mapLayers.military && filteredMilitaryFlightClusters.length > 0) {
      layers.push(this.createMilitaryFlightClustersLayer(filteredMilitaryFlightClusters));
    }

    // Strategic waterways layer
    if (mapLayers.waterways) {
      layers.push(this.createWaterwaysLayer());
    }

    // Economic centers layer — hidden at low zoom
    if (mapLayers.economic && this.isLayerVisible('economic')) {
      layers.push(this.createEconomicCentersLayer());
    }

    // Finance variant layers
    if (mapLayers.stockExchanges) {
      layers.push(this.createStockExchangesLayer());
    }
    if (mapLayers.financialCenters) {
      layers.push(this.createFinancialCentersLayer());
    }
    if (mapLayers.centralBanks) {
      layers.push(this.createCentralBanksLayer());
    }
    if (mapLayers.commodityHubs) {
      layers.push(this.createCommodityHubsLayer());
    }

    // Critical minerals layer
    if (mapLayers.minerals) {
      layers.push(this.createMineralsLayer());
    }

    // Commodity variant layers — mine sites, processing plants, export ports
    if (mapLayers.miningSites) {
      layers.push(this.createMiningSitesLayer());
    }
    if (mapLayers.processingPlants) {
      layers.push(this.createProcessingPlantsLayer());
    }
    if (mapLayers.commodityPorts) {
      layers.push(this.createCommodityPortsLayer());
    }

    // APT Groups layer (tied to aptGroups layer toggle)
    if (mapLayers.aptGroups) {
      layers.push(this.createAPTGroupsLayer());
    }

    // UCDP georeferenced events layer
    if (mapLayers.ucdpEvents && filteredUcdpEvents.length > 0) {
      layers.push(this.createUcdpEventsLayer(filteredUcdpEvents));
    }

    // Displacement flows arc layer
    if (mapLayers.displacement && this.displacementFlows.length > 0) {
      layers.push(this.createDisplacementArcsLayer());
    }

    // Climate anomalies heatmap layer
    if (mapLayers.climate && this.climateAnomalies.length > 0) {
      layers.push(this.createClimateHeatmapLayer());
    }

    // Trade routes layer
    if (mapLayers.tradeRoutes) {
      layers.push(this.createTradeRoutesLayer());
      layers.push(this.createTradeChokepointsLayer());
    } else {
      this.layerCache.delete('trade-routes-layer');
      this.layerCache.delete('trade-chokepoints-layer');
    }

    // Tech variant layers (Supercluster-based deck.gl layers for HQs and events)
    if (SITE_VARIANT === 'tech') {
      if (mapLayers.startupHubs) {
        layers.push(this.createStartupHubsLayer());
      }
      if (mapLayers.techHQs) {
        layers.push(...this.createTechHQClusterLayers());
      }
      if (mapLayers.accelerators) {
        layers.push(this.createAcceleratorsLayer());
      }
      if (mapLayers.cloudRegions) {
        layers.push(this.createCloudRegionsLayer());
      }
      if (mapLayers.techEvents && this.techEvents.length > 0) {
        layers.push(...this.createTechEventClusterLayers());
      }
    }

    // Gulf FDI investments layer
    if (mapLayers.gulfInvestments) {
      layers.push(this.createGulfInvestmentsLayer());
    }

    // Positive events layer (happy variant)
    if (mapLayers.positiveEvents && this.positiveEvents.length > 0) {
      layers.push(...this.createPositiveEventsLayers());
    }

    // Kindness layer (happy variant -- green baseline pulses + real kindness events)
    if (mapLayers.kindness && this.kindnessPoints.length > 0) {
      layers.push(...this.createKindnessLayers());
    }

    // Phase 8: Happiness choropleth (rendered below point markers)
    if (mapLayers.happiness) {
      const choropleth = this.createHappinessChoroplethLayer();
      if (choropleth) layers.push(choropleth);
    }
    // CII choropleth (country instability heat-map)
    if (mapLayers.ciiChoropleth) {
      const ciiLayer = this.createCIIChoroplethLayer();
      if (ciiLayer) layers.push(ciiLayer);
    }
    // Phase 8: Species recovery zones
    if (mapLayers.speciesRecovery && this.speciesRecoveryZones.length > 0) {
      layers.push(this.createSpeciesRecoveryLayer());
    }
    // Phase 8: Renewable energy installations
    if (mapLayers.renewableInstallations && this.renewableInstallations.length > 0) {
      layers.push(this.createRenewableInstallationsLayer());
    }

    // News geo-locations (tied to conflicts layer)
    if (mapLayers.conflicts && this.newsLocations.length > 0) {
      layers.push(...this.createNewsLocationsLayer());
    }

    const result = layers.filter(Boolean) as LayersList;
    const elapsed = performance.now() - startTime;
    if (import.meta.env.DEV && elapsed > 16) {
      console.warn(`[DeckGLMap] buildLayers took ${elapsed.toFixed(2)}ms (>16ms budget), ${result.length} layers`);
    }
    return result;
  }

  // Layer creation methods
  private createCablesLayer(): PathLayer {
    const highlightedCables = this.highlightedAssets.cable;
    const cacheKey = 'cables-layer';
    const cached = this.layerCache.get(cacheKey) as PathLayer | undefined;
    const highlightSignature = this.getSetSignature(highlightedCables);
    const healthSignature = Object.keys(this.healthByCableId).sort().join(',');
    if (cached && highlightSignature === this.lastCableHighlightSignature && healthSignature === this.lastCableHealthSignature) return cached;

    const health = this.healthByCableId;
    const layer = new PathLayer({
      id: cacheKey,
      data: UNDERSEA_CABLES,
      getPath: (d) => d.points,
      getColor: (d) => {
        if (highlightedCables.has(d.id)) return COLORS.cableHighlight;
        const h = health[d.id];
        if (h?.status === 'fault') return COLORS.cableFault;
        if (h?.status === 'degraded') return COLORS.cableDegraded;
        return COLORS.cable;
      },
      getWidth: (d) => {
        if (highlightedCables.has(d.id)) return 3;
        const h = health[d.id];
        if (h?.status === 'fault') return 2.5;
        if (h?.status === 'degraded') return 2;
        return 1;
      },
      widthMinPixels: 1,
      widthMaxPixels: 5,
      pickable: true,
      updateTriggers: { highlighted: highlightSignature, health: healthSignature },
    });

    this.lastCableHighlightSignature = highlightSignature;
    this.lastCableHealthSignature = healthSignature;
    this.layerCache.set(cacheKey, layer);
    return layer;
  }

  private createPipelinesLayer(): PathLayer {
    const highlightedPipelines = this.highlightedAssets.pipeline;
    const cacheKey = 'pipelines-layer';
    const cached = this.layerCache.get(cacheKey) as PathLayer | undefined;
    const highlightSignature = this.getSetSignature(highlightedPipelines);
    if (cached && highlightSignature === this.lastPipelineHighlightSignature) return cached;

    const layer = new PathLayer({
      id: cacheKey,
      data: PIPELINES,
      getPath: (d) => d.points,
      getColor: (d) => {
        if (highlightedPipelines.has(d.id)) {
          return [255, 100, 100, 200] as [number, number, number, number];
        }
        const colorKey = d.type as keyof typeof PIPELINE_COLORS;
        const hex = PIPELINE_COLORS[colorKey] || '#666666';
        return this.hexToRgba(hex, 150);
      },
      getWidth: (d) => highlightedPipelines.has(d.id) ? 3 : 1.5,
      widthMinPixels: 1,
      widthMaxPixels: 4,
      pickable: true,
      updateTriggers: { highlighted: highlightSignature },
    });

    this.lastPipelineHighlightSignature = highlightSignature;
    this.layerCache.set(cacheKey, layer);
    return layer;
  }

  private createConflictZonesLayer(): GeoJsonLayer {
    const cacheKey = 'conflict-zones-layer';

    const layer = new GeoJsonLayer({
      id: cacheKey,
      data: CONFLICT_ZONES_GEOJSON,
      filled: true,
      stroked: true,
      getFillColor: () => COLORS.conflict,
      getLineColor: () => getCurrentTheme() === 'light'
        ? [255, 0, 0, 120] as [number, number, number, number]
        : [255, 0, 0, 180] as [number, number, number, number],
      getLineWidth: 2,
      lineWidthMinPixels: 1,
      pickable: true,
    });
    return layer;
  }


  private getBasesData(): MilitaryBaseEnriched[] {
    return this.serverBasesLoaded ? this.serverBases : MILITARY_BASES as MilitaryBaseEnriched[];
  }

  private getBaseColor(type: string, a: number): [number, number, number, number] {
    switch (type) {
      case 'us-nato': return [68, 136, 255, a];
      case 'russia': return [255, 68, 68, a];
      case 'china': return [255, 136, 68, a];
      case 'uk': return [68, 170, 255, a];
      case 'france': return [0, 85, 164, a];
      case 'india': return [255, 153, 51, a];
      case 'japan': return [188, 0, 45, a];
      default: return [136, 136, 136, a];
    }
  }

  private createBasesLayer(): IconLayer {
    const highlightedBases = this.highlightedAssets.base;
    const zoom = this.maplibreMap?.getZoom() || 3;
    const alphaScale = Math.min(1, (zoom - 2.5) / 2.5);
    const a = Math.round(160 * Math.max(0.3, alphaScale));
    const data = this.getBasesData();

    return new IconLayer({
      id: 'bases-layer',
      data,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'base',
      iconAtlas: '/icons/military-base.png',
      iconMapping: { base: { x: 0, y: 0, width: 512, height: 512, mask: false } },
      getSize: (d) => highlightedBases.has(d.id) ? 28 : 22,
      sizeScale: 1,
      sizeMinPixels: 10,
      sizeMaxPixels: 32,
      pickable: true,
    });
  }

  private createBasesClusterLayer(): Layer[] {
    if (this.serverBaseClusters.length === 0) return [];
    const zoom = this.maplibreMap?.getZoom() || 3;
    const alphaScale = Math.min(1, (zoom - 2.5) / 2.5);
    const a = Math.round(180 * Math.max(0.3, alphaScale));

    const scatterLayer = new ScatterplotLayer<ServerBaseCluster>({
      id: 'bases-cluster-layer',
      data: this.serverBaseClusters,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => Math.max(8000, Math.log2(d.count) * 6000),
      getFillColor: (d) => this.getBaseColor(d.dominantType, a),
      radiusMinPixels: 10,
      radiusMaxPixels: 40,
      pickable: true,
    });

    const textLayer = new TextLayer<ServerBaseCluster>({
      id: 'bases-cluster-text',
      data: this.serverBaseClusters,
      getPosition: (d) => [d.longitude, d.latitude],
      getText: (d) => String(d.count),
      getSize: 12,
      getColor: [255, 255, 255, 220],
      fontWeight: 'bold',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
    });

    return [scatterLayer, textLayer];
  }

  private createNuclearLayer(): IconLayer {
    const highlightedNuclear = this.highlightedAssets.nuclear;
    const data = NUCLEAR_FACILITIES.filter(f => f.status !== 'decommissioned');

    // Nuclear: HEXAGON icons - yellow/orange color, semi-transparent
    return new IconLayer({
      id: 'nuclear-layer',
      data,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'nuclear',
      iconAtlas: '/icons/nuclear.png',
      iconMapping: { nuclear: { x: 0, y: 0, width: 512, height: 512, mask: false } },
      getSize: (d) => highlightedNuclear.has(d.id) ? 28 : 22,
      sizeScale: 1,
      sizeMinPixels: 10,
      sizeMaxPixels: 32,
      pickable: true,
    });
  }

  private createIrradiatorsLayer(): IconLayer {
    return new IconLayer({
      id: 'irradiators-layer',
      data: GAMMA_IRRADIATORS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'radiation',
      iconAtlas: '/icons/radiation.png',
      iconMapping: { radiation: { x: 0, y: 0, width: 512, height: 512, mask: false } },
      getSize: 22,
      sizeMinPixels: 10,
      sizeMaxPixels: 28,
      pickable: true,
      billboard: true,
    });
  }

  private createSpaceportsLayer(): IconLayer {
    return new IconLayer({
      id: 'spaceports-layer',
      data: SPACEPORTS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'rocket',
      iconAtlas: 'https://cdn-icons-png.flaticon.com/512/1086/1086091.png',
      iconMapping: { rocket: { x: 0, y: 0, width: 512, height: 512, mask: false } },
      getSize: () => 28,
      sizeMinPixels: 14,
      sizeMaxPixels: 36,
      pickable: true,
      billboard: true,
    });
  }

  private createPortsLayer(): IconLayer {
    return new IconLayer({
      id: 'ports-layer',
      data: PORTS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'anchor',
      iconAtlas: AIS_PORT_ICON_ATLAS,
      iconMapping: AIS_PORT_ICON_MAPPING,
      getSize: 14,
      getColor: (d) => {
        switch (d.type) {
          case 'naval':     return [100, 150, 255, 220] as [number, number, number, number];
          case 'oil':       return [255, 140, 0, 220] as [number, number, number, number];
          case 'lng':       return [255, 200, 50, 220] as [number, number, number, number];
          case 'container': return [0, 200, 255, 200] as [number, number, number, number];
          case 'mixed':     return [150, 200, 150, 200] as [number, number, number, number];
          case 'bulk':      return [180, 150, 120, 200] as [number, number, number, number];
          default:          return [0, 200, 255, 180] as [number, number, number, number];
        }
      },
      sizeMinPixels: 8,
      sizeMaxPixels: 16,
      sizeScale: 1,
      pickable: true,
    });
  }

  private createFlightDelaysLayer(delays: AirportDelayAlert[]): IconLayer {
    return new IconLayer({
      id: 'flight-delays-layer',
      data: delays,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'airport',
      iconAtlas: AVIATION_AIRPORT_ICON_ATLAS,
      iconMapping: AVIATION_AIRPORT_ICON_MAPPING,
      getSize: 22,
      sizeMinPixels: 12,
      sizeMaxPixels: 32,
      pickable: true,
      billboard: true,
    });
  }

  private createAircraftPositionsLayer(): IconLayer<PositionSample> {
    return new IconLayer<PositionSample>({
      id: 'aircraft-positions-layer',
      data: this.aircraftPositions,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'plane',
      iconAtlas: AVIATION_PLANE_ICON_ATLAS,
      iconMapping: AVIATION_PLANE_ICON_MAPPING,
      getSize: (d) => d.onGround ? 18 : 24,
      getAngle: (d) => -d.trackDeg,
      sizeMinPixels: 10,
      sizeMaxPixels: 36,
      sizeScale: 1,
      pickable: true,
      billboard: false,
    });
  }

  private createAircraftTrajectoryLayers(): Layer[] {
    const layers: Layer[] = [];
    if (!this.selectedAircraftIcao || !this.selectedAircraftType) return layers;

    if (this.selectedAircraftType === 'commercial') {
      const aircraft = this.aircraftPositions.find(a => a.icao24 === this.selectedAircraftIcao);
      if (!aircraft) return layers;

      // History trail
      const hist = this.aircraftHistory.get(this.selectedAircraftIcao) ?? [];
      if (hist.length > 1) {
        layers.push(new PathLayer({
          id: 'aircraft-trail-layer',
          data: [{ path: hist }],
          getPath: (d: { path: [number, number][] }) => d.path,
          getColor: [255, 165, 0, 200] as [number, number, number, number],
          getWidth: 2,
          widthMinPixels: 2,
          widthMaxPixels: 4,
          pickable: false,
        }));
      }

      // Heading projection (~500 km forward)
      const headingRad = (aircraft.trackDeg * Math.PI) / 180;
      const distDeg = 4.5;
      const fwdLon = aircraft.lon + Math.sin(headingRad) * distDeg / Math.cos((aircraft.lat * Math.PI) / 180);
      const fwdLat = aircraft.lat + Math.cos(headingRad) * distDeg;
      layers.push(new PathLayer({
        id: 'aircraft-heading-layer',
        data: [{ path: [[aircraft.lon, aircraft.lat], [fwdLon, fwdLat]] as [number, number][] }],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: [100, 210, 255, 160] as [number, number, number, number],
        getWidth: 1.5,
        widthMinPixels: 1,
        widthMaxPixels: 3,
        pickable: false,
      }));
    }

    if (this.selectedAircraftType === 'military') {
      const flight = this.militaryFlights.find(f => f.hexCode === this.selectedAircraftIcao);
      if (!flight) return layers;

      // History trail from track data (stored as [lat, lon], deck.gl needs [lon, lat])
      if (flight.track && flight.track.length > 1) {
        const path = flight.track.map(([lat, lon]) => [lon, lat] as [number, number]);
        layers.push(new PathLayer({
          id: 'aircraft-trail-layer',
          data: [{ path }],
          getPath: (d: { path: [number, number][] }) => d.path,
          getColor: [255, 100, 100, 200] as [number, number, number, number],
          getWidth: 2,
          widthMinPixels: 2,
          widthMaxPixels: 4,
          pickable: false,
        }));
      }

      // Heading projection
      const headingRad = (flight.heading * Math.PI) / 180;
      const distDeg = 4.5;
      const fwdLon = flight.lon + Math.sin(headingRad) * distDeg / Math.cos((flight.lat * Math.PI) / 180);
      const fwdLat = flight.lat + Math.cos(headingRad) * distDeg;
      layers.push(new PathLayer({
        id: 'aircraft-heading-layer',
        data: [{ path: [[flight.lon, flight.lat], [fwdLon, fwdLat]] as [number, number][] }],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: [255, 160, 100, 160] as [number, number, number, number],
        getWidth: 1.5,
        widthMinPixels: 1,
        widthMaxPixels: 3,
        pickable: false,
      }));
    }

    return layers;
  }

  private createGhostLayer<T>(id: string, data: T[], getPosition: (d: T) => [number, number], opts: { radiusMinPixels?: number } = {}): ScatterplotLayer<T> {
    return new ScatterplotLayer<T>({
      id: `${id}-ghost`,
      data,
      getPosition,
      getRadius: 1,
      radiusMinPixels: opts.radiusMinPixels ?? 12,
      getFillColor: [0, 0, 0, 0],
      pickable: true,
    });
  }

  /** Empty sentinel layer — keeps a stable layer ID for deck.gl interleaved mode without rendering anything. */
  private createEmptyGhost(id: string): ScatterplotLayer {
    return new ScatterplotLayer({ id: `${id}-ghost`, data: [], getPosition: () => [0, 0], visible: false });
  }


  private createDatacentersLayer(): IconLayer {
    const highlightedDC = this.highlightedAssets.datacenter;
    const data = AI_DATA_CENTERS.filter(dc => dc.status !== 'decommissioned');

    return new IconLayer({
      id: 'datacenters-layer',
      data,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('datacenters'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => highlightedDC.has(d.id) ? 14 : 10,
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 14,
      pickable: true,
      billboard: true,
    });
  }

  private createEarthquakesLayer(earthquakes: Earthquake[]): IconLayer {
    return new IconLayer({
      id: 'earthquakes-layer',
      data: earthquakes,
      getPosition: (d) => [d.location?.longitude ?? 0, d.location?.latitude ?? 0],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('natural'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d: Earthquake) => {
        const mag = d.magnitude;
        if (mag >= 6) return 22;
        if (mag >= 5) return 18;
        return 14;
      },
      sizeMinPixels: 10,
      sizeMaxPixels: 26,
      getColor: (d: Earthquake) => {
        const mag = d.magnitude;
        if (mag >= 6) return [255, 0, 0, 230] as [number, number, number, number];
        if (mag >= 5) return [255, 120, 0, 220] as [number, number, number, number];
        return COLORS.earthquake;
      },
      pickable: true,
      billboard: true,
    });
  }

  private createNaturalEventsLayer(events: NaturalEvent[]): IconLayer {
    return new IconLayer({
      id: 'natural-events-layer',
      data: events,
      getPosition: (d: NaturalEvent) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('natural'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d: NaturalEvent) => d.title.startsWith('🔴') ? 20 : d.title.startsWith('🟠') ? 17 : 14,
      sizeMinPixels: 10,
      sizeMaxPixels: 26,
      pickable: true,
      billboard: true,
    });
  }

  private createFiresLayer(): IconLayer {
    return new IconLayer({
      id: 'fires-layer',
      data: this.firmsFireData,
      getPosition: (d: (typeof this.firmsFireData)[0]) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('fires'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d: (typeof this.firmsFireData)[0]) => d.brightness > 400 ? 17 : d.brightness > 350 ? 15 : 13,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createIranEventsLayer(): IconLayer {
    return new IconLayer({
      id: 'iran-events-layer',
      data: this.iranEvents,
      getPosition: (d: IranEvent) => [d.longitude, d.latitude],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('iranAttacks'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d: IranEvent) => d.severity === 'high' ? 17 : d.severity === 'medium' ? 15 : 13,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createWeatherLayer(alerts: WeatherAlert[]): IconLayer {
    // Filter weather alerts that have centroid coordinates
    const alertsWithCoords = alerts.filter(a => a.centroid && a.centroid.length === 2);

    return new IconLayer({
      id: 'weather-layer',
      data: alertsWithCoords,
      getPosition: (d) => d.centroid as [number, number],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('weather'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => d.severity === 'Extreme' ? 18 : d.severity === 'Severe' ? 16 : 14,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createOutagesLayer(outages: InternetOutage[]): IconLayer {
    return new IconLayer({
      id: 'outages-layer',
      data: outages,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('outages'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: 15,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createCyberThreatsLayer(): IconLayer<CyberThreat> {
    return new IconLayer<CyberThreat>({
      id: 'cyber-threats-layer',
      data: this.cyberThreats,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('cyberThreats'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => d.severity === 'critical' ? 18 : d.severity === 'high' ? 16 : 14,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createAisDensityLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'ais-density-layer',
      data: this.aisDensity,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 4000 + d.intensity * 8000,
      getFillColor: (d) => {
        const intensity = Math.min(Math.max(d.intensity, 0.15), 1);
        const isCongested = (d.deltaPct || 0) >= 15;
        const alpha = Math.round(40 + intensity * 160);
        // Orange for congested areas, cyan for normal traffic
        if (isCongested) {
          return [255, 183, 3, alpha] as [number, number, number, number]; // #ffb703
        }
        return [0, 209, 255, alpha] as [number, number, number, number]; // #00d1ff
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createGpsJammingLayer(): H3HexagonLayer {
    return new H3HexagonLayer({
      id: 'gps-jamming-layer',
      data: this.gpsJammingHexes,
      getHexagon: (d: GpsJamHex) => d.h3,
      getFillColor: (d: GpsJamHex) => {
        if (d.level === 'high') return [255, 80, 80, 180] as [number, number, number, number];
        return [255, 180, 50, 140] as [number, number, number, number];
      },
      getElevation: 0,
      extruded: false,
      filled: true,
      stroked: true,
      getLineColor: [255, 255, 255, 80] as [number, number, number, number],
      getLineWidth: 1,
      lineWidthMinPixels: 1,
      pickable: true,
    });
  }

  private createAisDisruptionsLayer(): ScatterplotLayer {
    // AIS spoofing/jamming events
    return new ScatterplotLayer({
      id: 'ais-disruptions-layer',
      data: this.aisDisruptions,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 12000,
      getFillColor: (d) => {
        // Color by severity/type
        if (d.severity === 'high' || d.type === 'spoofing') {
          return [255, 50, 50, 220] as [number, number, number, number]; // Red
        }
        if (d.severity === 'medium') {
          return [255, 150, 0, 200] as [number, number, number, number]; // Orange
        }
        return [255, 200, 100, 180] as [number, number, number, number]; // Yellow
      },
      radiusMinPixels: 6,
      radiusMaxPixels: 14,
      pickable: true,
      stroked: true,
      getLineColor: [255, 255, 255, 150] as [number, number, number, number],
      lineWidthMinPixels: 1,
    });
  }

  private createAisVesselsLayer(): IconLayer<AisPositionData> {
    const vessels = Array.from(this.aisVessels.values());
    return new IconLayer<AisPositionData>({
      id: 'ais-vessels-layer',
      data: vessels,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'ship',
      iconAtlas: AIS_VESSEL_ICON_ATLAS,
      iconMapping: AIS_VESSEL_ICON_MAPPING,
      getSize: 16,
      getColor: () => [200, 200, 200, 210] as [number, number, number, number],
      getAngle: (d) => {
        if (d.heading != null && d.heading >= 0 && d.heading <= 360) return -d.heading;
        if (d.course != null && d.course >= 0 && d.course < 360) return -d.course;
        return 0;
      },
      sizeMinPixels: 6,
      sizeMaxPixels: 18,
      sizeScale: 1,
      pickable: true,
      billboard: false,
    });
  }

  private createCableAdvisoriesLayer(advisories: CableAdvisory[]): ScatterplotLayer {
    // Cable fault/maintenance advisories
    return new ScatterplotLayer({
      id: 'cable-advisories-layer',
      data: advisories,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 10000,
      getFillColor: (d) => {
        if (d.severity === 'fault') {
          return [255, 50, 50, 220] as [number, number, number, number]; // Red for faults
        }
        return [255, 200, 0, 200] as [number, number, number, number]; // Yellow for maintenance
      },
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      pickable: true,
      stroked: true,
      getLineColor: [0, 200, 255, 200] as [number, number, number, number], // Cyan outline (cable color)
      lineWidthMinPixels: 2,
    });
  }

  private createRepairShipsLayer(): ScatterplotLayer {
    // Cable repair ships
    return new ScatterplotLayer({
      id: 'repair-ships-layer',
      data: this.repairShips,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8000,
      getFillColor: [0, 255, 200, 200] as [number, number, number, number], // Teal
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
    });
  }

  private createMilitaryVesselsLayer(vessels: MilitaryVessel[]): IconLayer {
    return new IconLayer({
      id: 'military-vessels-layer',
      data: vessels,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'vessel',
      iconAtlas: 'https://cdn-icons-png.flaticon.com/512/6175/6175141.png',
      iconMapping: { vessel: { x: 0, y: 0, width: 512, height: 512, mask: false } },
      getSize: 24,
      sizeMinPixels: 12,
      sizeMaxPixels: 32,
      pickable: true,
      billboard: true,
    });
  }

  private createMilitaryVesselClustersLayer(clusters: MilitaryVesselCluster[]): IconLayer {
    return new IconLayer({
      id: 'military-vessel-clusters-layer',
      data: clusters,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'vessel',
      iconAtlas: 'https://cdn-icons-png.flaticon.com/512/6175/6175141.png',
      iconMapping: { vessel: { x: 0, y: 0, width: 512, height: 512, mask: false } },
      getSize: (d: MilitaryVesselCluster) => 24 + Math.min(8, (d.vesselCount || 1) * 0.7),
      sizeMinPixels: 14,
      sizeMaxPixels: 36,
      pickable: true,
      billboard: true,
    });
  }

  private createMilitaryFlightsLayer(flights: MilitaryFlight[]): IconLayer {
    return new IconLayer({
      id: 'military-flights-layer',
      data: flights,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'plane',
      iconAtlas: AVIATION_PLANE_ICON_ATLAS,
      iconMapping: AVIATION_PLANE_ICON_MAPPING,
      getSize: 16,
      sizeMinPixels: 10,
      sizeMaxPixels: 24,
      getColor: () => [220, 50, 50, 230] as [number, number, number, number],
      getAngle: (d) => -d.heading,
      pickable: true,
      billboard: false,
    });
  }

  private createMilitaryFlightClustersLayer(clusters: MilitaryFlightCluster[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'military-flight-clusters-layer',
      data: clusters,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 15000 + (d.flightCount || 1) * 3000,
      getFillColor: (d) => {
        const activity = d.activityType || 'unknown';
        if (activity === 'exercise' || activity === 'patrol') return [100, 150, 255, 200] as [number, number, number, number];
        if (activity === 'transport') return [255, 200, 100, 180] as [number, number, number, number];
        return [150, 150, 200, 160] as [number, number, number, number];
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 25,
      pickable: true,
    });
  }

  private createWaterwaysLayer(): IconLayer {
    return new IconLayer({
      id: 'waterways-layer',
      data: STRATEGIC_WATERWAYS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('waterways'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: () => 16,
      sizeMinPixels: 10,
      sizeMaxPixels: 22,
      pickable: true,
      billboard: true,
    });
  }

  private createEconomicCentersLayer(): IconLayer {
    return new IconLayer({
      id: 'economic-centers-layer',
      data: ECONOMIC_CENTERS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('economic'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: () => 14,
      sizeMinPixels: 8,
      sizeMaxPixels: 18,
      pickable: true,
      billboard: true,
    });
  }

  private createStockExchangesLayer(): IconLayer {
    return new IconLayer({
      id: 'stock-exchanges-layer',
      data: STOCK_EXCHANGES,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('stockExchanges'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => d.tier === 'mega' ? 17 : d.tier === 'major' ? 15 : 13,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createFinancialCentersLayer(): IconLayer {
    return new IconLayer({
      id: 'financial-centers-layer',
      data: FINANCIAL_CENTERS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('financialCenters'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => d.type === 'global' ? 16 : d.type === 'regional' ? 14 : 12,
      sizeMinPixels: 8,
      sizeMaxPixels: 18,
      pickable: true,
      billboard: true,
    });
  }

  private createCentralBanksLayer(): IconLayer {
    return new IconLayer({
      id: 'central-banks-layer',
      data: CENTRAL_BANKS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('centralBanks'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => d.type === 'supranational' ? 17 : d.type === 'major' ? 15 : 13,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createCommodityHubsLayer(): IconLayer {
    return new IconLayer({
      id: 'commodity-hubs-layer',
      data: COMMODITY_HUBS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('commodityHubs'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => d.type === 'exchange' ? 15 : d.type === 'port' ? 14 : 13,
      sizeMinPixels: 8,
      sizeMaxPixels: 18,
      pickable: true,
      billboard: true,
    });
  }

  private createAPTGroupsLayer(): IconLayer {
    // APT Groups - cyber threat actor markers (geopolitical variant only)
    return new IconLayer({
      id: 'apt-groups-layer',
      data: APT_GROUPS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('aptGroups'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: 13,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createMineralsLayer(): IconLayer {
    return new IconLayer({
      id: 'minerals-layer',
      data: CRITICAL_MINERALS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'mineral',
      iconAtlas: '/icons/minerals.png',
      iconMapping: { mineral: { x: 0, y: 0, width: 512, height: 512, mask: false } },
      getSize: 22,
      sizeMinPixels: 10,
      sizeMaxPixels: 28,
      pickable: true,
      billboard: true,
    });
  }

  // Commodity variant layers
  private createMiningSitesLayer(): IconLayer {
    return new IconLayer({
      id: 'mining-sites-layer',
      data: MINING_SITES,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'mineral',
      iconAtlas: '/icons/minerals.png',
      iconMapping: { mineral: { x: 0, y: 0, width: 512, height: 512, mask: false } },
      getSize: (d) => d.status === 'producing' ? 26 : d.status === 'development' ? 22 : 18,
      sizeMinPixels: 10,
      sizeMaxPixels: 32,
      pickable: true,
      billboard: true,
    });
  }

  private createProcessingPlantsLayer(): IconLayer {
    return new IconLayer({
      id: 'processing-plants-layer',
      data: PROCESSING_PLANTS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'mineral',
      iconAtlas: '/icons/minerals.png',
      iconMapping: { mineral: { x: 0, y: 0, width: 512, height: 512, mask: false } },
      getSize: 22,
      sizeMinPixels: 10,
      sizeMaxPixels: 28,
      pickable: true,
      billboard: true,
    });
  }

  private createCommodityPortsLayer(): IconLayer {
    return new IconLayer({
      id: 'commodity-ports-layer',
      data: COMMODITY_GEO_PORTS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('commodityPorts'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: 15,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  // Tech variant layers
  private createStartupHubsLayer(): IconLayer {
    return new IconLayer({
      id: 'startup-hubs-layer',
      data: STARTUP_HUBS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('startupHubs'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => d.tier === 'mega' ? 17 : d.tier === 'major' ? 15 : 13,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createAcceleratorsLayer(): IconLayer {
    return new IconLayer({
      id: 'accelerators-layer',
      data: ACCELERATORS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('accelerators'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => d.type === 'accelerator' ? 14 : d.type === 'incubator' ? 13 : 12,
      sizeMinPixels: 7,
      sizeMaxPixels: 16,
      pickable: true,
      billboard: true,
    });
  }

  private createCloudRegionsLayer(): IconLayer {
    return new IconLayer({
      id: 'cloud-regions-layer',
      data: CLOUD_REGIONS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('cloudRegions'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => d.provider === 'aws' ? 16 : d.provider === 'azure' ? 15 : 14,
      sizeMinPixels: 8,
      sizeMaxPixels: 18,
      pickable: true,
      billboard: true,
    });
  }

  private createProtestClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];

    layers.push(new IconLayer<MapProtestCluster>({
      id: 'protest-clusters-layer',
      data: this.protestClusters,
      getPosition: d => [d.lon, d.lat],
      getIcon: () => 'protest',
      iconAtlas: '/icons/protest.png',
      iconMapping: { protest: { x: 0, y: 0, width: 512, height: 512, mask: false } },
      getSize: d => d.count > 1 ? Math.min(36, 22 + d.count * 1.5) : 22,
      sizeMinPixels: 12,
      sizeMaxPixels: 40,
      pickable: true,
      billboard: true,
      updateTriggers: { getSize: this.lastSCZoom },
    }));

    const multiClusters = this.protestClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapProtestCluster>({
        id: 'protest-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    const pulseClusters = this.protestClusters.filter(c => c.maxSeverity === 'high' || c.hasRiot);
    if (pulseClusters.length > 0) {
      const pulse = 1.0 + 0.8 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 400));
      layers.push(new ScatterplotLayer<MapProtestCluster>({
        id: 'protest-clusters-pulse',
        data: pulseClusters,
        getPosition: d => [d.lon, d.lat],
        getRadius: d => 15000 + d.count * 2000,
        radiusScale: pulse,
        radiusMinPixels: 8,
        radiusMaxPixels: 30,
        stroked: true,
        filled: false,
        getLineColor: d => d.hasRiot ? [220, 40, 40, 120] as [number, number, number, number] : [255, 80, 60, 100] as [number, number, number, number],
        lineWidthMinPixels: 1.5,
        pickable: false,
        updateTriggers: { radiusScale: this.pulseTime },
      }));
    }

    layers.push(this.createEmptyGhost('protest-clusters-layer'));
    return layers;
  }

  private createTechHQClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];
    const zoom = this.maplibreMap?.getZoom() || 2;

    layers.push(new IconLayer<MapTechHQCluster>({
      id: 'tech-hq-clusters-layer',
      data: this.techHQClusters,
      getPosition: d => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('techHQs'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: d => d.count > 1 ? Math.min(24, 13 + d.count) : d.primaryType === 'faang' ? 16 : d.primaryType === 'unicorn' ? 15 : 14,
      sizeMinPixels: 8,
      sizeMaxPixels: 24,
      pickable: true,
      billboard: true,
      updateTriggers: { getSize: this.lastSCZoom },
    }));

    const multiClusters = this.techHQClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapTechHQCluster>({
        id: 'tech-hq-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    if (zoom >= 3) {
      const singles = this.techHQClusters.filter(c => c.count === 1);
      if (singles.length > 0) {
        layers.push(new TextLayer<MapTechHQCluster>({
          id: 'tech-hq-clusters-label',
          data: singles,
          getText: d => d.items[0]?.company ?? '',
          getPosition: d => [d.lon, d.lat],
          getSize: 11,
          getColor: [220, 220, 220, 200],
          getPixelOffset: [0, 12],
          pickable: false,
          fontFamily: 'system-ui, sans-serif',
        }));
      }
    }

    layers.push(this.createEmptyGhost('tech-hq-clusters-layer'));
    return layers;
  }

  private createTechEventClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];

    layers.push(new IconLayer<MapTechEventCluster>({
      id: 'tech-event-clusters-layer',
      data: this.techEventClusters,
      getPosition: d => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('techEvents'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: d => d.count > 1 ? Math.min(24, 13 + d.count) : d.soonestDaysUntil <= 14 ? 16 : 14,
      sizeMinPixels: 8,
      sizeMaxPixels: 24,
      pickable: true,
      billboard: true,
      updateTriggers: { getSize: this.lastSCZoom },
    }));

    const multiClusters = this.techEventClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapTechEventCluster>({
        id: 'tech-event-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    layers.push(this.createEmptyGhost('tech-event-clusters-layer'));
    return layers;
  }

  private createDatacenterClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];

    layers.push(new IconLayer<MapDatacenterCluster>({
      id: 'datacenter-clusters-layer',
      data: this.datacenterClusters,
      getPosition: d => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('datacenters'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: d => d.count > 1 ? Math.min(24, 14 + d.count) : 14,
      sizeMinPixels: 8,
      sizeMaxPixels: 24,
      pickable: true,
      billboard: true,
      updateTriggers: { getSize: this.lastSCZoom },
    }));

    const multiClusters = this.datacenterClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapDatacenterCluster>({
        id: 'datacenter-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    layers.push(this.createEmptyGhost('datacenter-clusters-layer'));
    return layers;
  }

  private createHotspotsLayers(): Layer[] {
    const zoom = this.maplibreMap?.getZoom() || 2;
    const zoomScale = Math.min(1, (zoom - 1) / 3);
    const maxPx = 6 + Math.round(14 * zoomScale);
    const baseOpacity = zoom < 2.5 ? 0.5 : zoom < 4 ? 0.7 : 1.0;
    const layers: Layer[] = [];

    layers.push(new IconLayer({
      id: 'hotspots-layer',
      data: this.hotspots,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('hotspots'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => {
        const score = d.escalationScore || 1;
        return 10 + score * 3;
      },
      sizeMinPixels: 6,
      sizeMaxPixels: maxPx,
      pickable: true,
      billboard: true,
    }));

    const highHotspots = this.hotspots.filter(h => h.level === 'high' || h.hasBreaking);
    if (highHotspots.length > 0) {
      const pulse = 1.0 + 0.8 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 400));
      layers.push(new ScatterplotLayer({
        id: 'hotspots-pulse',
        data: highHotspots,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => {
          const score = d.escalationScore || 1;
          return 10000 + score * 5000;
        },
        radiusScale: pulse,
        radiusMinPixels: 6,
        radiusMaxPixels: 30,
        stroked: true,
        filled: false,
        getLineColor: (d) => {
          const a = Math.round(120 * baseOpacity);
          return d.hasBreaking ? [255, 50, 50, a] as [number, number, number, number] : [255, 165, 0, a] as [number, number, number, number];
        },
        lineWidthMinPixels: 1.5,
        pickable: false,
        updateTriggers: { radiusScale: this.pulseTime },
      }));

    }

    layers.push(this.createEmptyGhost('hotspots-layer'));
    return layers;
  }

  private createGulfInvestmentsLayer(): IconLayer<GulfInvestment> {
    return new IconLayer<GulfInvestment>({
      id: 'gulf-investments-layer',
      data: GULF_INVESTMENTS,
      getPosition: (d: GulfInvestment) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('gulfInvestments'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d: GulfInvestment) => {
        if (!d.investmentUSD) return 13;
        if (d.investmentUSD >= 50000) return 20;
        if (d.investmentUSD >= 10000) return 17;
        if (d.investmentUSD >= 1000) return 15;
        return 13;
      },
      sizeMinPixels: 8,
      sizeMaxPixels: 24,
      pickable: true,
      billboard: true,
    });
  }

  private pulseTime = 0;

  private canPulse(now = Date.now()): boolean {
    return now - this.startupTime > 60_000;
  }

  private hasRecentRiot(now = Date.now(), windowMs = 2 * 60 * 60 * 1000): boolean {
    const hasRecentClusterRiot = this.protestClusters.some(c =>
      c.hasRiot && c.latestRiotEventTimeMs != null && (now - c.latestRiotEventTimeMs) < windowMs
    );
    if (hasRecentClusterRiot) return true;

    // Fallback to raw protests because syncPulseAnimation can run before cluster data refreshes.
    return this.protests.some((p) => {
      if (p.eventType !== 'riot' || p.sourceType === 'gdelt') return false;
      const ts = p.time.getTime();
      return Number.isFinite(ts) && (now - ts) < windowMs;
    });
  }

  private needsPulseAnimation(now = Date.now()): boolean {
    return this.hasRecentNews(now)
      || this.hasRecentRiot(now)
      || this.hotspots.some(h => h.hasBreaking)
      || this.positiveEvents.some(e => e.count > 10)
      || this.kindnessPoints.some(p => p.type === 'real');
  }

  private syncPulseAnimation(now = Date.now()): void {
    if (this.renderPaused) {
      if (this.newsPulseIntervalId !== null) this.stopPulseAnimation();
      return;
    }
    const shouldPulse = this.canPulse(now) && this.needsPulseAnimation(now);
    if (shouldPulse && this.newsPulseIntervalId === null) {
      this.startPulseAnimation();
    } else if (!shouldPulse && this.newsPulseIntervalId !== null) {
      this.stopPulseAnimation();
    }
  }

  private startPulseAnimation(): void {
    if (this.newsPulseIntervalId !== null) return;
    const PULSE_UPDATE_INTERVAL_MS = 500;

    this.newsPulseIntervalId = setInterval(() => {
      const now = Date.now();
      if (!this.needsPulseAnimation(now)) {
        this.pulseTime = now;
        this.stopPulseAnimation();
        this.rafUpdateLayers();
        return;
      }
      this.pulseTime = now;
      this.rafUpdateLayers();
    }, PULSE_UPDATE_INTERVAL_MS);
  }

  private stopPulseAnimation(): void {
    if (this.newsPulseIntervalId !== null) {
      clearInterval(this.newsPulseIntervalId);
      this.newsPulseIntervalId = null;
    }
  }

  private createNewsLocationsLayer(): ScatterplotLayer[] {
    const zoom = this.maplibreMap?.getZoom() || 2;
    const alphaScale = zoom < 2.5 ? 0.4 : zoom < 4 ? 0.7 : 1.0;
    const filteredNewsLocations = this.filterByTime(this.newsLocations, (location) => location.timestamp);
    const THREAT_RGB: Record<string, [number, number, number]> = {
      critical: [239, 68, 68],
      high: [249, 115, 22],
      medium: [234, 179, 8],
      low: [34, 197, 94],
      info: [59, 130, 246],
    };
    const THREAT_ALPHA: Record<string, number> = {
      critical: 220,
      high: 190,
      medium: 160,
      low: 120,
      info: 80,
    };

    const now = this.pulseTime || Date.now();
    const PULSE_DURATION = 30_000;

    const layers: ScatterplotLayer[] = [
      new ScatterplotLayer({
        id: 'news-locations-layer',
        data: filteredNewsLocations,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 18000,
        getFillColor: (d) => {
          const rgb = THREAT_RGB[d.threatLevel] || [59, 130, 246];
          const a = Math.round((THREAT_ALPHA[d.threatLevel] || 120) * alphaScale);
          return [...rgb, a] as [number, number, number, number];
        },
        radiusMinPixels: 3,
        radiusMaxPixels: 12,
        pickable: true,
      }),
    ];

    const recentNews = filteredNewsLocations.filter(d => {
      const firstSeen = this.newsLocationFirstSeen.get(d.title);
      return firstSeen && (now - firstSeen) < PULSE_DURATION;
    });

    if (recentNews.length > 0) {
      const pulse = 1.0 + 1.5 * (0.5 + 0.5 * Math.sin(now / 318));

      layers.push(new ScatterplotLayer({
        id: 'news-pulse-layer',
        data: recentNews,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 18000,
        radiusScale: pulse,
        radiusMinPixels: 6,
        radiusMaxPixels: 30,
        pickable: false,
        stroked: true,
        filled: false,
        getLineColor: (d) => {
          const rgb = THREAT_RGB[d.threatLevel] || [59, 130, 246];
          const firstSeen = this.newsLocationFirstSeen.get(d.title) || now;
          const age = now - firstSeen;
          const fadeOut = Math.max(0, 1 - age / PULSE_DURATION);
          const a = Math.round(150 * fadeOut * alphaScale);
          return [...rgb, a] as [number, number, number, number];
        },
        lineWidthMinPixels: 1.5,
        updateTriggers: { pulseTime: now },
      }));
    }

    return layers;
  }

  private createPositiveEventsLayers(): Layer[] {
    const layers: Layer[] = [];

    const getCategoryColor = (category: string): [number, number, number, number] => {
      switch (category) {
        case 'nature-wildlife':
        case 'humanity-kindness':
          return [34, 197, 94, 200]; // green
        case 'science-health':
        case 'innovation-tech':
        case 'climate-wins':
          return [234, 179, 8, 200]; // gold
        case 'culture-community':
          return [139, 92, 246, 200]; // purple
        default:
          return [34, 197, 94, 200]; // green default
      }
    };

    // Dot layer (tooltip on hover via getTooltip)
    layers.push(new IconLayer({
      id: 'positive-events-layer',
      data: this.positiveEvents,
      getPosition: (d: PositiveGeoEvent) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('positiveEvents'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d: PositiveGeoEvent) => d.count > 8 ? 17 : 14,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    }));

    // Gentle pulse ring for significant events (count > 8)
    const significantEvents = this.positiveEvents.filter(e => e.count > 8);
    if (significantEvents.length > 0) {
      const pulse = 1.0 + 0.4 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 800));
      layers.push(new ScatterplotLayer({
        id: 'positive-events-pulse',
        data: significantEvents,
        getPosition: (d: PositiveGeoEvent) => [d.lon, d.lat],
        getRadius: 15000,
        radiusScale: pulse,
        radiusMinPixels: 8,
        radiusMaxPixels: 24,
        stroked: true,
        filled: false,
        getLineColor: (d: PositiveGeoEvent) => getCategoryColor(d.category),
        lineWidthMinPixels: 1.5,
        pickable: false,
        updateTriggers: { radiusScale: this.pulseTime },
      }));
    }

    return layers;
  }

  private createKindnessLayers(): Layer[] {
    const layers: Layer[] = [];
    if (this.kindnessPoints.length === 0) return layers;

    // Dot layer (tooltip on hover via getTooltip)
    layers.push(new IconLayer<KindnessPoint>({
      id: 'kindness-layer',
      data: this.kindnessPoints,
      getPosition: (d: KindnessPoint) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('kindness'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: 14,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    }));

    // Pulse for real events
    const pulse = 1.0 + 0.4 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 800));
    layers.push(new ScatterplotLayer<KindnessPoint>({
      id: 'kindness-pulse',
      data: this.kindnessPoints,
      getPosition: (d: KindnessPoint) => [d.lon, d.lat],
      getRadius: 14000,
      radiusScale: pulse,
      radiusMinPixels: 6,
      radiusMaxPixels: 18,
      stroked: true,
      filled: false,
      getLineColor: [74, 222, 128, 80] as [number, number, number, number],
      lineWidthMinPixels: 1,
      pickable: false,
      updateTriggers: { radiusScale: this.pulseTime },
    }));

    return layers;
  }

  private createHappinessChoroplethLayer(): GeoJsonLayer | null {
    if (!this.countriesGeoJsonData || this.happinessScores.size === 0) return null;
    const scores = this.happinessScores;
    return new GeoJsonLayer({
      id: 'happiness-choropleth-layer',
      data: this.countriesGeoJsonData,
      filled: true,
      stroked: true,
      getFillColor: (feature: { properties?: Record<string, unknown> }) => {
        const code = feature.properties?.['ISO3166-1-Alpha-2'] as string | undefined;
        const score = code ? scores.get(code) : undefined;
        if (score == null) return [0, 0, 0, 0] as [number, number, number, number];
        const t = score / 10;
        return [
          Math.round(40 + (1 - t) * 180),
          Math.round(180 + t * 60),
          Math.round(40 + (1 - t) * 100),
          140,
        ] as [number, number, number, number];
      },
      getLineColor: [100, 100, 100, 60] as [number, number, number, number],
      getLineWidth: 1,
      lineWidthMinPixels: 0.5,
      pickable: true,
      updateTriggers: { getFillColor: [scores.size] },
    });
  }

  private static readonly CII_LEVEL_COLORS: Record<string, [number, number, number, number]> = {
    low:      [40, 180, 60, 130],
    normal:   [220, 200, 50, 135],
    elevated: [240, 140, 30, 145],
    high:     [220, 50, 20, 155],
    critical: [140, 10, 0, 170],
  };

  private static readonly CII_LEVEL_HEX: Record<string, string> = {
    critical: '#b91c1c', high: '#dc2626', elevated: '#f59e0b', normal: '#eab308', low: '#22c55e',
  };

  private createCIIChoroplethLayer(): GeoJsonLayer | null {
    if (!this.countriesGeoJsonData || this.ciiScoresMap.size === 0) return null;
    const scores = this.ciiScoresMap;
    const colors = DeckGLMap.CII_LEVEL_COLORS;
    return new GeoJsonLayer({
      id: 'cii-choropleth-layer',
      data: this.countriesGeoJsonData,
      filled: true,
      stroked: true,
      getFillColor: (feature: { properties?: Record<string, unknown> }) => {
        const code = feature.properties?.['ISO3166-1-Alpha-2'] as string | undefined;
        const entry = code ? scores.get(code) : undefined;
        return entry ? (colors[entry.level] ?? [0, 0, 0, 0]) : [0, 0, 0, 0];
      },
      getLineColor: [80, 80, 80, 80] as [number, number, number, number],
      getLineWidth: 1,
      lineWidthMinPixels: 0.5,
      pickable: true,
      updateTriggers: { getFillColor: [this.ciiScoresVersion] },
    });
  }

  private createSpeciesRecoveryLayer(): IconLayer {
    return new IconLayer({
      id: 'species-recovery-layer',
      data: this.speciesRecoveryZones.filter(d => d.recoveryZone),
      getPosition: (d: (typeof this.speciesRecoveryZones)[number]) => [d.recoveryZone!.lon, d.recoveryZone!.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('speciesRecovery'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: 15,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createRenewableInstallationsLayer(): IconLayer {
    return new IconLayer({
      id: 'renewable-installations-layer',
      data: this.renewableInstallations,
      getPosition: (d: RenewableInstallation) => [d.lon, d.lat],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('renewableInstallations'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d: RenewableInstallation) => d.capacityMW >= 1000 ? 17 : d.capacityMW >= 100 ? 15 : 13,
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  public getTooltip(info: PickingInfo): { html: string } | null {
    if (!info.object) return null;

    const rawLayerId = info.layer?.id || '';
    const layerId = rawLayerId.endsWith('-ghost') ? rawLayerId.slice(0, -6) : rawLayerId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = info.object as any;
    const text = (value: unknown): string => escapeHtml(String(value ?? ''));

    switch (layerId) {
      case 'hotspots-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.subtext)}</div>` };
      case 'earthquakes-layer':
        return { html: `<div class="deckgl-tooltip"><strong>M${(obj.magnitude || 0).toFixed(1)} ${t('components.deckgl.tooltip.earthquake')}</strong><br/>${text(obj.place)}</div>` };
      case 'military-vessels-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.operatorCountry)}</div>` };
      case 'military-flights-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.callsign || obj.registration || t('components.deckgl.tooltip.militaryAircraft'))}</strong><br/>${text(obj.type)}</div>` };
      case 'military-vessel-clusters-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name || t('components.deckgl.tooltip.vesselCluster'))}</strong><br/>${obj.vesselCount || 0} ${t('components.deckgl.tooltip.vessels')}<br/>${text(obj.activityType)}</div>` };
      case 'military-flight-clusters-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name || t('components.deckgl.tooltip.flightCluster'))}</strong><br/>${obj.flightCount || 0} ${t('components.deckgl.tooltip.aircraft')}<br/>${text(obj.activityType)}</div>` };
      case 'protests-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.title)}</strong><br/>${text(obj.country)}</div>` };
      case 'protest-clusters-layer':
        if (obj.count === 1) {
          const item = obj.items?.[0];
          return { html: `<div class="deckgl-tooltip"><strong>${text(item?.title || t('components.deckgl.tooltip.protest'))}</strong><br/>${text(item?.city || item?.country || '')}</div>` };
        }
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.tooltip.protestsCount', { count: String(obj.count) })}</strong><br/>${text(obj.country)}</div>` };
      case 'tech-hq-clusters-layer':
        if (obj.count === 1) {
          const hq = obj.items?.[0];
          return { html: `<div class="deckgl-tooltip"><strong>${text(hq?.company || '')}</strong><br/>${text(hq?.city || '')}</div>` };
        }
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.tooltip.techHQsCount', { count: String(obj.count) })}</strong><br/>${text(obj.city)}</div>` };
      case 'tech-event-clusters-layer':
        if (obj.count === 1) {
          const ev = obj.items?.[0];
          return { html: `<div class="deckgl-tooltip"><strong>${text(ev?.title || '')}</strong><br/>${text(ev?.location || '')}</div>` };
        }
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.tooltip.techEventsCount', { count: String(obj.count) })}</strong><br/>${text(obj.location)}</div>` };
      case 'datacenter-clusters-layer':
        if (obj.count === 1) {
          const dc = obj.items?.[0];
          return { html: `<div class="deckgl-tooltip"><strong>${text(dc?.name || '')}</strong><br/>${text(dc?.owner || '')}</div>` };
        }
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.tooltip.dataCentersCount', { count: String(obj.count) })}</strong><br/>${text(obj.country)}</div>` };
      case 'bases-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.country)}${obj.kind ? ` · ${text(obj.kind)}` : ''}</div>` };
      case 'bases-cluster-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${obj.count} bases</strong></div>` };
      case 'nuclear-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.type)}</div>` };
      case 'datacenters-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.owner)}</div>` };
      case 'cables-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${t('components.deckgl.tooltip.underseaCable')}</div>` };
      case 'pipelines-layer': {
        const pipelineType = String(obj.type || '').toLowerCase();
        const pipelineTypeLabel = pipelineType === 'oil'
          ? t('popups.pipeline.types.oil')
          : pipelineType === 'gas'
            ? t('popups.pipeline.types.gas')
            : pipelineType === 'products'
              ? t('popups.pipeline.types.products')
              : `${text(obj.type)} ${t('components.deckgl.tooltip.pipeline')}`;
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${pipelineTypeLabel}</div>` };
      }
      case 'conflict-zones-layer': {
        const props = obj.properties || obj;
        return { html: `<div class="deckgl-tooltip"><strong>${text(props.name)}</strong><br/>${t('components.deckgl.tooltip.conflictZone')}</div>` };
      }

      case 'natural-events-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.title)}</strong><br/>${text(obj.category || t('components.deckgl.tooltip.naturalEvent'))}</div>` };
      case 'ais-vessels-layer': {
        const shipTypeLabel = (() => {
          const st = obj.shipType ?? 0;
          if (st >= 80 && st <= 89) return 'Tanker';
          if (st >= 70 && st <= 79) return 'Cargo';
          if (st >= 60 && st <= 69) return 'Passenger';
          if (st >= 35 && st <= 36) return 'Military';
          if (st >= 30 && st <= 34) return 'Fishing';
          if (st >= 50 && st <= 59) return 'Service';
          if (st > 0) return `Type ${st}`;
          return 'Vessel';
        })();
        const speedStr = obj.speed != null ? `${Number(obj.speed).toFixed(1)} kn` : '';
        const hdgStr = obj.heading != null && obj.heading >= 0 && obj.heading <= 360
          ? `${Math.round(obj.heading)}°`
          : obj.course != null ? `${Math.round(obj.course)}°` : '';
        const details = [speedStr, hdgStr].filter(Boolean).join(' · ');
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name || obj.mmsi)}</strong><br/>${shipTypeLabel}${details ? `<br/>${details}` : ''}</div>` };
      }
      case 'ais-density-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.layers.shipTraffic')}</strong><br/>${t('popups.intensity')}: ${text(obj.intensity)}</div>` };
      case 'waterways-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${t('components.deckgl.layers.strategicWaterways')}</div>` };
      case 'economic-centers-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.country)}</div>` };
      case 'stock-exchanges-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.shortName)}</strong><br/>${text(obj.city)}, ${text(obj.country)}</div>` };
      case 'financial-centers-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.type)} ${t('components.deckgl.tooltip.financialCenter')}</div>` };
      case 'central-banks-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.shortName)}</strong><br/>${text(obj.city)}, ${text(obj.country)}</div>` };
      case 'commodity-hubs-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.type)} · ${text(obj.city)}</div>` };
      case 'startup-hubs-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.city)}</strong><br/>${text(obj.country)}</div>` };
      case 'tech-hqs-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.company)}</strong><br/>${text(obj.city)}</div>` };
      case 'accelerators-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.city)}</div>` };
      case 'cloud-regions-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.provider)}</strong><br/>${text(obj.region)}</div>` };
      case 'tech-events-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.title)}</strong><br/>${text(obj.location)}</div>` };
      case 'irradiators-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.type || t('components.deckgl.layers.gammaIrradiators'))}</div>` };
      case 'spaceports-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.country || t('components.deckgl.layers.spaceports'))}</div>` };
      case 'ports-layer': {
        const typeIcon = obj.type === 'naval' ? '⚓' : obj.type === 'oil' || obj.type === 'lng' ? '🛢️' : '🏭';
        return { html: `<div class="deckgl-tooltip"><strong>${typeIcon} ${text(obj.name)}</strong><br/>${text(obj.type || t('components.deckgl.tooltip.port'))} - ${text(obj.country)}</div>` };
      }
      case 'flight-delays-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)} (${text(obj.iata)})</strong><br/>${text(obj.severity)}: ${text(obj.reason)}</div>` };
      case 'aircraft-positions-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.callsign || obj.icao24)}</strong><br/>${obj.altitudeFt?.toLocaleString() ?? 0} ft · ${obj.groundSpeedKts ?? 0} kts · ${Math.round(obj.trackDeg ?? 0)}°</div>` };
      case 'apt-groups-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.aka)}<br/>${t('popups.sponsor')}: ${text(obj.sponsor)}</div>` };
      case 'minerals-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.mineral)} - ${text(obj.country)}<br/>${text(obj.operator)}</div>` };
      case 'mining-sites-layer': {
        const statusLabel = obj.status === 'producing' ? '⛏️ Producing' : obj.status === 'development' ? '🔧 Development' : '🔍 Exploration';
        const outputStr = obj.annualOutput ? `<br/><span style="opacity:.75">${text(obj.annualOutput)}</span>` : '';
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.mineral)} · ${text(obj.country)}<br/>${statusLabel}${outputStr}</div>` };
      }
      case 'processing-plants-layer': {
        const typeLabel = obj.type === 'smelter' ? '🏭 Smelter' : obj.type === 'refinery' ? '⚗️ Refinery' : obj.type === 'separation' ? '🧪 Separation' : '🏗️ Processing';
        const capacityStr = obj.capacityTpa ? `<br/><span style="opacity:.75">${text(String((obj.capacityTpa / 1000).toFixed(0)))}k t/yr</span>` : '';
        const mineralLabel = obj.mineral ?? (Array.isArray(obj.materials) ? obj.materials.join(', ') : '');
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(mineralLabel)} · ${text(obj.country)}<br/>${typeLabel}${capacityStr}</div>` };
      }
      case 'commodity-ports-layer': {
        const commoditiesStr = Array.isArray(obj.commodities) ? obj.commodities.join(', ') : '';
        const volumeStr = obj.annualVolumeMt ? `<br/><span style="opacity:.75">${text(String(obj.annualVolumeMt))}Mt/yr</span>` : '';
        return { html: `<div class="deckgl-tooltip"><strong>⚓ ${text(obj.name)}</strong><br/>${text(obj.country)}<br/>${text(commoditiesStr)}${volumeStr}</div>` };
      }
      case 'ais-disruptions-layer':
        return { html: `<div class="deckgl-tooltip"><strong>AIS ${text(obj.type || t('components.deckgl.tooltip.disruption'))}</strong><br/>${text(obj.severity)} ${t('popups.severity')}<br/>${text(obj.description)}</div>` };
      case 'gps-jamming-layer':
        return { html: `<div class="deckgl-tooltip"><strong>GPS Jamming</strong><br/>${text(obj.level)} interference (${obj.pct}%)<br/>H3: ${text(obj.h3)}</div>` };
      case 'cable-advisories-layer': {
        const cableName = UNDERSEA_CABLES.find(c => c.id === obj.cableId)?.name || obj.cableId;
        return { html: `<div class="deckgl-tooltip"><strong>${text(cableName)}</strong><br/>${text(obj.severity || t('components.deckgl.tooltip.advisory'))}<br/>${text(obj.description)}</div>` };
      }
      case 'repair-ships-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name || t('components.deckgl.tooltip.repairShip'))}</strong><br/>${text(obj.status)}</div>` };
      case 'weather-layer': {
        const areaDesc = typeof obj.areaDesc === 'string' ? obj.areaDesc : '';
        const area = areaDesc ? `<br/><small>${text(areaDesc.slice(0, 50))}${areaDesc.length > 50 ? '...' : ''}</small>` : '';
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.event || t('components.deckgl.layers.weatherAlerts'))}</strong><br/>${text(obj.severity)}${area}</div>` };
      }
      case 'outages-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.asn || t('components.deckgl.tooltip.internetOutage'))}</strong><br/>${text(obj.country)}</div>` };
      case 'cyber-threats-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${t('popups.cyberThreat.title')}</strong><br/>${text(obj.severity || t('components.deckgl.tooltip.medium'))} · ${text(obj.country || t('popups.unknown'))}</div>` };
      case 'iran-events-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.layers.iranAttacks')}: ${text(obj.category || '')}</strong><br/>${text((obj.title || '').slice(0, 80))}</div>` };
      case 'news-locations-layer':
        return { html: `<div class="deckgl-tooltip"><strong>📰 ${t('components.deckgl.tooltip.news')}</strong><br/>${text(obj.title?.slice(0, 80) || '')}</div>` };
      case 'positive-events-layer': {
        const catLabel = obj.category ? obj.category.replace(/-/g, ' & ') : 'Positive Event';
        const countInfo = obj.count > 1 ? `<br/><span style="opacity:.7">${obj.count} sources reporting</span>` : '';
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/><span style="text-transform:capitalize">${text(catLabel)}</span>${countInfo}</div>` };
      }
      case 'kindness-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong></div>` };
      case 'happiness-choropleth-layer': {
        const hcName = obj.properties?.name ?? 'Unknown';
        const hcCode = obj.properties?.['ISO3166-1-Alpha-2'];
        const hcScore = hcCode ? this.happinessScores.get(hcCode as string) : undefined;
        const hcScoreStr = hcScore != null ? hcScore.toFixed(1) : 'No data';
        return { html: `<div class="deckgl-tooltip"><strong>${text(hcName)}</strong><br/>Happiness: ${hcScoreStr}/10${hcScore != null ? `<br/><span style="opacity:.7">${text(this.happinessSource)} (${this.happinessYear})</span>` : ''}</div>` };
      }
      case 'cii-choropleth-layer': {
        const ciiName = obj.properties?.name ?? 'Unknown';
        const ciiCode = obj.properties?.['ISO3166-1-Alpha-2'];
        const ciiEntry = ciiCode ? this.ciiScoresMap.get(ciiCode as string) : undefined;
        if (!ciiEntry) return { html: `<div class="deckgl-tooltip"><strong>${text(ciiName)}</strong><br/><span style="opacity:.7">No CII data</span></div>` };
        const levelColor = DeckGLMap.CII_LEVEL_HEX[ciiEntry.level] ?? '#888';
        return { html: `<div class="deckgl-tooltip"><strong>${text(ciiName)}</strong><br/>CII: <span style="color:${levelColor};font-weight:600">${ciiEntry.score}/100</span><br/><span style="text-transform:capitalize;opacity:.7">${text(ciiEntry.level)}</span></div>` };
      }
      case 'species-recovery-layer': {
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.commonName)}</strong><br/>${text(obj.recoveryZone?.name ?? obj.region)}<br/><span style="opacity:.7">Status: ${text(obj.recoveryStatus)}</span></div>` };
      }
      case 'renewable-installations-layer': {
        const riTypeLabel = obj.type ? String(obj.type).charAt(0).toUpperCase() + String(obj.type).slice(1) : 'Renewable';
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${riTypeLabel} &middot; ${obj.capacityMW?.toLocaleString() ?? '?'} MW<br/><span style="opacity:.7">${text(obj.country)} &middot; ${obj.year}</span></div>` };
      }
      case 'trade-routes-layer': {
        const seg = obj as TradeRouteSegment;
        const statusLabel = seg.status === 'disrupted' ? '⚠ Disrupted' : seg.status === 'high_risk' ? '⚠ High Risk' : 'Active';
        return { html: `<div class="deckgl-tooltip"><strong>${text(seg.routeName)}</strong><br/>${text(seg.category)} · ${text(seg.volumeDesc)}<br/><span style="opacity:.7">${statusLabel}</span></div>` };
      }
      case 'gulf-investments-layer': {
        const inv = obj as GulfInvestment;
        const flag = inv.investingCountry === 'SA' ? '🇸🇦' : '🇦🇪';
        const usd = inv.investmentUSD != null
          ? (inv.investmentUSD >= 1000 ? `$${(inv.investmentUSD / 1000).toFixed(1)}B` : `$${inv.investmentUSD}M`)
          : t('components.deckgl.tooltip.undisclosed');
        const stake = inv.stakePercent != null ? `<br/>${text(String(inv.stakePercent))}% ${t('components.deckgl.tooltip.stake')}` : '';
        return {
          html: `<div class="deckgl-tooltip">
            <strong>${flag} ${text(inv.assetName)}</strong><br/>
            <em>${text(inv.investingEntity)}</em><br/>
            ${text(inv.targetCountry)} · ${text(inv.sector)}<br/>
            <strong>${usd}</strong>${stake}<br/>
            <span style="text-transform:capitalize">${text(inv.status)}</span>
          </div>`,
        };
      }
      case 'fires-layer': {
        const frpStr = obj.frp ? ` · FRP ${obj.frp.toFixed(0)}` : '';
        return { html: `<div class="deckgl-tooltip"><strong>🔥 ${text(obj.region || 'Fire')}</strong><br/>Brightness: ${obj.brightness?.toFixed(0) ?? '?'}K${frpStr}</div>` };
      }
      case 'ucdp-events-layer': {
        const deaths = obj.deaths_best > 0 ? `<br/><span style="opacity:.7">${obj.deaths_best} estimated deaths</span>` : '';
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.side_a)} vs ${text(obj.side_b)}</strong><br/>${text(obj.country)} · ${text(obj.type_of_violence?.replace(/-/g, ' '))}${deaths}</div>` };
      }
      default:
        return null;
    }
  }

  private handleClick(info: PickingInfo): void {
    if (!info.object) {
      // Empty map click → country detection
      if (info.coordinate && this.onCountryClick) {
        const [lon, lat] = info.coordinate as [number, number];
        const country = this.resolveCountryFromCoordinate(lon, lat);
        this.onCountryClick({
          lat,
          lon,
          ...(country ? { code: country.code, name: country.name } : {}),
        });
      }
      return;
    }

    const rawClickLayerId = info.layer?.id || '';
    const layerId = rawClickLayerId.endsWith('-ghost') ? rawClickLayerId.slice(0, -6) : rawClickLayerId;

    // Hotspots show popup with related news
    if (layerId === 'hotspots-layer') {
      const hotspot = info.object as Hotspot;
      const relatedNews = this.getRelatedNews(hotspot);
      this.popup.show({
        type: 'hotspot',
        data: hotspot,
        relatedNews,
        x: info.x,
        y: info.y,
      });
      this.popup.loadHotspotGdeltContext(hotspot);
      this.onHotspotClick?.(hotspot);
      return;
    }

    // Handle cluster layers with single/multi logic
    if (layerId === 'protest-clusters-layer') {
      const cluster = info.object as MapProtestCluster;
      if (cluster.items.length === 0 && cluster._clusterId != null && this.protestSC) {
        try {
          const leaves = this.protestSC.getLeaves(cluster._clusterId, DeckGLMap.MAX_CLUSTER_LEAVES);
          cluster.items = leaves.map(l => this.protestSuperclusterSource[l.properties.index]).filter((x): x is SocialUnrestEvent => !!x);
          cluster.sampled = cluster.items.length < cluster.count;
        } catch (e) {
          console.warn('[DeckGLMap] stale protest cluster', cluster._clusterId, e);
          return;
        }
      }
      if (cluster.count === 1 && cluster.items[0]) {
        this.popup.show({ type: 'protest', data: cluster.items[0], x: info.x, y: info.y });
      } else {
        this.popup.show({
          type: 'protestCluster',
          data: {
            items: cluster.items,
            country: cluster.country,
            count: cluster.count,
            riotCount: cluster.riotCount,
            highSeverityCount: cluster.highSeverityCount,
            verifiedCount: cluster.verifiedCount,
            totalFatalities: cluster.totalFatalities,
            sampled: cluster.sampled,
          },
          x: info.x,
          y: info.y,
        });
      }
      return;
    }
    if (layerId === 'tech-hq-clusters-layer') {
      const cluster = info.object as MapTechHQCluster;
      if (cluster.items.length === 0 && cluster._clusterId != null && this.techHQSC) {
        try {
          const leaves = this.techHQSC.getLeaves(cluster._clusterId, DeckGLMap.MAX_CLUSTER_LEAVES);
          cluster.items = leaves.map(l => TECH_HQS[l.properties.index]).filter(Boolean) as typeof TECH_HQS;
          cluster.sampled = cluster.items.length < cluster.count;
        } catch (e) {
          console.warn('[DeckGLMap] stale techHQ cluster', cluster._clusterId, e);
          return;
        }
      }
      if (cluster.count === 1 && cluster.items[0]) {
        this.popup.show({ type: 'techHQ', data: cluster.items[0], x: info.x, y: info.y });
      } else {
        this.popup.show({
          type: 'techHQCluster',
          data: {
            items: cluster.items,
            city: cluster.city,
            country: cluster.country,
            count: cluster.count,
            faangCount: cluster.faangCount,
            unicornCount: cluster.unicornCount,
            publicCount: cluster.publicCount,
            sampled: cluster.sampled,
          },
          x: info.x,
          y: info.y,
        });
      }
      return;
    }
    if (layerId === 'tech-event-clusters-layer') {
      const cluster = info.object as MapTechEventCluster;
      if (cluster.items.length === 0 && cluster._clusterId != null && this.techEventSC) {
        try {
          const leaves = this.techEventSC.getLeaves(cluster._clusterId, DeckGLMap.MAX_CLUSTER_LEAVES);
          cluster.items = leaves.map(l => this.techEvents[l.properties.index]).filter((x): x is TechEventMarker => !!x);
          cluster.sampled = cluster.items.length < cluster.count;
        } catch (e) {
          console.warn('[DeckGLMap] stale techEvent cluster', cluster._clusterId, e);
          return;
        }
      }
      if (cluster.count === 1 && cluster.items[0]) {
        this.popup.show({ type: 'techEvent', data: cluster.items[0], x: info.x, y: info.y });
      } else {
        this.popup.show({
          type: 'techEventCluster',
          data: {
            items: cluster.items,
            location: cluster.location,
            country: cluster.country,
            count: cluster.count,
            soonCount: cluster.soonCount,
            sampled: cluster.sampled,
          },
          x: info.x,
          y: info.y,
        });
      }
      return;
    }
    if (layerId === 'datacenter-clusters-layer') {
      const cluster = info.object as MapDatacenterCluster;
      if (cluster.items.length === 0 && cluster._clusterId != null && this.datacenterSC) {
        try {
          const leaves = this.datacenterSC.getLeaves(cluster._clusterId, DeckGLMap.MAX_CLUSTER_LEAVES);
          cluster.items = leaves.map(l => this.datacenterSCSource[l.properties.index]).filter((x): x is AIDataCenter => !!x);
          cluster.sampled = cluster.items.length < cluster.count;
        } catch (e) {
          console.warn('[DeckGLMap] stale datacenter cluster', cluster._clusterId, e);
          return;
        }
      }
      if (cluster.count === 1 && cluster.items[0]) {
        this.popup.show({ type: 'datacenter', data: cluster.items[0], x: info.x, y: info.y });
      } else {
        this.popup.show({
          type: 'datacenterCluster',
          data: {
            items: cluster.items,
            region: cluster.region || cluster.country,
            country: cluster.country,
            count: cluster.count,
            totalChips: cluster.totalChips,
            totalPowerMW: cluster.totalPowerMW,
            existingCount: cluster.existingCount,
            plannedCount: cluster.plannedCount,
            sampled: cluster.sampled,
          },
          x: info.x,
          y: info.y,
        });
      }
      return;
    }

    // Map layer IDs to popup types
    const layerToPopupType: Record<string, PopupType> = {
      'conflict-zones-layer': 'conflict',

      'bases-layer': 'base',
      'nuclear-layer': 'nuclear',
      'irradiators-layer': 'irradiator',
      'datacenters-layer': 'datacenter',
      'cables-layer': 'cable',
      'pipelines-layer': 'pipeline',
      'earthquakes-layer': 'earthquake',
      'weather-layer': 'weather',
      'outages-layer': 'outage',
      'cyber-threats-layer': 'cyberThreat',
      'iran-events-layer': 'iranEvent',
      'protests-layer': 'protest',
      'military-flights-layer': 'militaryFlight',
      'military-vessels-layer': 'militaryVessel',
      'military-vessel-clusters-layer': 'militaryVesselCluster',
      'military-flight-clusters-layer': 'militaryFlightCluster',
      'natural-events-layer': 'natEvent',
      'waterways-layer': 'waterway',
      'economic-centers-layer': 'economic',
      'stock-exchanges-layer': 'stockExchange',
      'financial-centers-layer': 'financialCenter',
      'central-banks-layer': 'centralBank',
      'commodity-hubs-layer': 'commodityHub',
      'spaceports-layer': 'spaceport',
      'ports-layer': 'port',
      'flight-delays-layer': 'flight',
      'aircraft-positions-layer': 'aircraft',
      'startup-hubs-layer': 'startupHub',
      'tech-hqs-layer': 'techHQ',
      'accelerators-layer': 'accelerator',
      'cloud-regions-layer': 'cloudRegion',
      'tech-events-layer': 'techEvent',
      'apt-groups-layer': 'apt',
      'minerals-layer': 'mineral',
      'ais-disruptions-layer': 'ais',
      'ais-vessels-layer': 'aisVessel',
      'gps-jamming-layer': 'gpsJamming',
      'cable-advisories-layer': 'cable-advisory',
      'repair-ships-layer': 'repair-ship',
      'gulf-investments-layer': 'gulfInvestment',
      'trade-routes-layer': 'tradeRoute',
      'mining-sites-layer': 'mineral',
      'processing-plants-layer': 'mineral',
      'commodity-ports-layer': 'commodityPort',
      'fires-layer': 'fire',
      'positive-events-layer': 'positiveEvent',
      'kindness-layer': 'kindnessEvent',
      'ucdp-events-layer': 'ucdpEvent',
      'species-recovery-layer': 'speciesRecovery',
      'renewable-installations-layer': 'renewableInstallation',
    };

    const popupType = layerToPopupType[layerId];
    if (!popupType) return;

    // For GeoJSON layers, the data is in properties
    let data = info.object;
    if (layerId === 'conflict-zones-layer' && info.object.properties) {
      // Find the full conflict zone data from config
      const conflictId = info.object.properties.id;
      const fullConflict = CONFLICT_ZONES.find(c => c.id === conflictId);
      if (fullConflict) data = fullConflict;
    }

    // Enrich iran events with related events from same location
    if (popupType === 'iranEvent' && data.locationName) {
      const clickedId = data.id;
      const normalizedLoc = data.locationName.trim().toLowerCase();
      const related = this.iranEvents
        .filter(e => e.id !== clickedId && e.locationName && e.locationName.trim().toLowerCase() === normalizedLoc)
        .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
        .slice(0, 5);
      data = { ...data, relatedEvents: related };
    }

    // Get click coordinates relative to container
    const x = info.x ?? 0;
    const y = info.y ?? 0;

    this.popup.show({
      type: popupType,
      data: data,
      x,
      y,
    });
  }

  private handleEntityClick(info: PickingInfo): void {
    if (!info.object || !this.onEntityClick) return;

    const rawLayerId = info.layer?.id || '';
    const layerId = rawLayerId.endsWith('-ghost') ? rawLayerId.slice(0, -6) : rawLayerId;

    if (layerId === 'tech-hq-clusters-layer') {
      const cluster = info.object as MapTechHQCluster;
      if (cluster.items.length === 0 && cluster._clusterId != null && this.techHQSC) {
        try {
          const leaves = this.techHQSC.getLeaves(cluster._clusterId, DeckGLMap.MAX_CLUSTER_LEAVES);
          cluster.items = leaves.map(l => TECH_HQS[l.properties.index]).filter(Boolean) as typeof TECH_HQS;
          cluster.sampled = cluster.items.length < cluster.count;
        } catch (e) {
          console.warn('[DeckGLMap] stale techHQ cluster', cluster._clusterId, e);
          return;
        }
      }
      this.popup.hide();
      this.entityClickConsumedAt = Date.now();
      if (cluster.count === 1 && cluster.items[0]) {
        this.onEntityClick('techHQ', cluster.items[0]);
      } else {
        this.onEntityClick('techHQCluster', {
          items: cluster.items,
          city: cluster.city,
          country: cluster.country,
          count: cluster.count,
          faangCount: cluster.faangCount,
          unicornCount: cluster.unicornCount,
          publicCount: cluster.publicCount,
          sampled: cluster.sampled,
        });
      }
      return;
    }

    // Reuse the same layerToPopupType mapping
    const layerToPopupType: Record<string, string> = {
      'conflict-zones-layer': 'conflict',
      'bases-layer': 'base',
      'nuclear-layer': 'nuclear',
      'irradiators-layer': 'irradiator',
      'datacenters-layer': 'datacenter',
      'cables-layer': 'cable',
      'pipelines-layer': 'pipeline',
      'earthquakes-layer': 'earthquake',
      'weather-layer': 'weather',
      'outages-layer': 'outage',
      'cyber-threats-layer': 'cyberThreat',
      'iran-events-layer': 'iranEvent',
      'protests-layer': 'protest',
      'military-flights-layer': 'militaryFlight',
      'military-vessels-layer': 'militaryVessel',
      'military-vessel-clusters-layer': 'militaryVesselCluster',
      'military-flight-clusters-layer': 'militaryFlightCluster',
      'natural-events-layer': 'natEvent',
      'waterways-layer': 'waterway',
      'economic-centers-layer': 'economic',
      'stock-exchanges-layer': 'stockExchange',
      'financial-centers-layer': 'financialCenter',
      'central-banks-layer': 'centralBank',
      'commodity-hubs-layer': 'commodityHub',
      'spaceports-layer': 'spaceport',
      'ports-layer': 'port',
      'flight-delays-layer': 'flight',
      'aircraft-positions-layer': 'aircraft',
      'startup-hubs-layer': 'startupHub',
      'tech-hqs-layer': 'techHQ',
      'accelerators-layer': 'accelerator',
      'cloud-regions-layer': 'cloudRegion',
      'tech-events-layer': 'techEvent',
      'apt-groups-layer': 'apt',
      'minerals-layer': 'mineral',
      'ais-disruptions-layer': 'ais',
      'ais-vessels-layer': 'aisVessel',
      'gps-jamming-layer': 'gpsJamming',
      'cable-advisories-layer': 'cable-advisory',
      'repair-ships-layer': 'repair-ship',
      'mining-sites-layer': 'mineral',
      'processing-plants-layer': 'mineral',
      'commodity-ports-layer': 'commodityPort',
      'gulf-investments-layer': 'gulfInvestment',
      'trade-routes-layer': 'tradeRoute',
      'fires-layer': 'fire',
      'positive-events-layer': 'positiveEvent',
      'kindness-layer': 'kindnessEvent',
      'ucdp-events-layer': 'ucdpEvent',
      'species-recovery-layer': 'speciesRecovery',
      'renewable-installations-layer': 'renewableInstallation',
    };

    const popupType = layerToPopupType[layerId];
    if (!popupType) return;

    // Resolve data (same enrichment as handleClick)
    let data = info.object;
    if (layerId === 'conflict-zones-layer' && info.object.properties) {
      const conflictId = info.object.properties.id;
      const fullConflict = CONFLICT_ZONES.find(c => c.id === conflictId);
      if (fullConflict) data = fullConflict;
    }

    // Toggle trajectory on aircraft/military-flight click
    if (layerId === 'aircraft-positions-layer') {
      const aircraft = data as PositionSample;
      if (this.selectedAircraftIcao === aircraft.icao24 && this.selectedAircraftType === 'commercial') {
        this.selectedAircraftIcao = null;
        this.selectedAircraftType = null;
      } else {
        this.selectedAircraftIcao = aircraft.icao24;
        this.selectedAircraftType = 'commercial';
      }
      this.render();
    } else if (layerId === 'military-flights-layer') {
      const flight = data as MilitaryFlight;
      if (this.selectedAircraftIcao === flight.hexCode && this.selectedAircraftType === 'military') {
        this.selectedAircraftIcao = null;
        this.selectedAircraftType = null;
      } else {
        this.selectedAircraftIcao = flight.hexCode;
        this.selectedAircraftType = 'military';
      }
      this.render();
    } else {
      // Clicking any other entity clears the trajectory
      this.selectedAircraftIcao = null;
      this.selectedAircraftType = null;
    }

    // Dismiss the hover popup
    this.popup.hide();

    // Block the native MaplibreGL map.on('click') from also firing country panel
    this.entityClickConsumedAt = Date.now();

    this.onEntityClick(popupType, data);
  }

  // Utility methods
  private hexToRgba(hex: string, alpha: number): [number, number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result && result[1] && result[2] && result[3]) {
      return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        alpha,
      ];
    }
    return [100, 100, 100, alpha];
  }

  // UI Creation methods
  private createControls(): void {
    const controls = document.createElement('div');
    controls.className = 'map-controls deckgl-controls';

    // Build theme picker panel HTML
    const currentTheme = getUnifiedTheme();
    const groups: Record<string, typeof UNIFIED_THEME_OPTIONS> = {};
    for (const opt of UNIFIED_THEME_OPTIONS) {
      (groups[opt.group] ??= []).push(opt);
    }
    let pickerHtml = '<div class="mtp-header"><span class="mtp-header-title">Map Style</span></div>';
    for (const [group, opts] of Object.entries(groups)) {
      pickerHtml += `<div class="mtp-group-label">${group}</div>`;
      for (const opt of opts) {
        const active = opt.value === currentTheme ? ' mtp-item--active' : '';
        pickerHtml += `<button class="mtp-item${active}" data-theme="${opt.value}">${opt.label}</button>`;
      }
    }

    controls.innerHTML = `
      <div class="zoom-controls">
        <button class="map-btn zoom-in" aria-label="${t('components.deckgl.zoomIn')}">+</button>
        <button class="map-btn zoom-out" aria-label="${t('components.deckgl.zoomOut')}">-</button>
        <button class="map-btn zoom-reset" aria-label="${t('components.deckgl.resetView')}">&#8962;</button>
        <div class="map-theme-picker">
          <button class="map-btn map-theme-picker-btn" aria-label="Change map style" title="Map Style">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" stroke="none"/>
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" stroke="none"/>
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" stroke="none"/>
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" stroke="none"/>
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
            </svg>
          </button>
          <div class="map-theme-picker-panel">${pickerHtml}</div>
        </div>
      </div>
      <div class="view-selector">
        <select class="view-select">
          <option value="global">${t('components.deckgl.views.global')}</option>
          <option value="america">${t('components.deckgl.views.americas')}</option>
          <option value="mena">${t('components.deckgl.views.mena')}</option>
          <option value="eu">${t('components.deckgl.views.europe')}</option>
          <option value="asia">${t('components.deckgl.views.asia')}</option>
          <option value="latam">${t('components.deckgl.views.latam')}</option>
          <option value="africa">${t('components.deckgl.views.africa')}</option>
          <option value="oceania">${t('components.deckgl.views.oceania')}</option>
        </select>
      </div>
    `;

    this.container.appendChild(controls);

    // Zoom + reset buttons
    controls.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('zoom-in')) { this.zoomIn(); return; }
      if (target.classList.contains('zoom-out')) { this.zoomOut(); return; }
      if (target.classList.contains('zoom-reset')) { this.resetView(); return; }
    });

    // Theme picker toggle + item selection
    const picker = controls.querySelector('.map-theme-picker') as HTMLElement;
    const pickerBtn = controls.querySelector('.map-theme-picker-btn') as HTMLButtonElement;
    const pickerPanel = controls.querySelector('.map-theme-picker-panel') as HTMLElement;

    pickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      picker.classList.toggle('open');
    });

    pickerPanel.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.mtp-item');
      if (!btn) return;
      const value = btn.dataset.theme;
      if (!value) return;
      setUnifiedTheme(value);
      window.dispatchEvent(new CustomEvent('map-theme-changed'));
      // Update active state
      pickerPanel.querySelectorAll('.mtp-item').forEach(el => el.classList.remove('mtp-item--active'));
      btn.classList.add('mtp-item--active');
      picker.classList.remove('open');
    });

    document.addEventListener('click', (e) => {
      if (!picker.contains(e.target as Node)) picker.classList.remove('open');
    });

    const viewSelect = controls.querySelector('.view-select') as HTMLSelectElement;
    viewSelect.value = this.state.view;
    viewSelect.addEventListener('change', () => {
      this.setView(viewSelect.value as DeckMapView);
    });
  }

  private createTimeSlider(): void {
    const slider = document.createElement('div');
    slider.className = 'time-slider deckgl-time-slider';
    slider.innerHTML = `
      <div class="time-options">
        <button class="time-btn ${this.state.timeRange === '1h' ? 'active' : ''}" data-range="1h">1h</button>
        <button class="time-btn ${this.state.timeRange === '6h' ? 'active' : ''}" data-range="6h">6h</button>
        <button class="time-btn ${this.state.timeRange === '24h' ? 'active' : ''}" data-range="24h">24h</button>
        <button class="time-btn ${this.state.timeRange === '48h' ? 'active' : ''}" data-range="48h">48h</button>
        <button class="time-btn ${this.state.timeRange === '7d' ? 'active' : ''}" data-range="7d">7d</button>
        <button class="time-btn ${this.state.timeRange === 'all' ? 'active' : ''}" data-range="all">${t('components.deckgl.timeAll')}</button>
      </div>
    `;

    this.container.appendChild(slider);

    // Build layers row: [LAYERS toggle btn] [? help btn]
    const layersRow = document.createElement('div');
    layersRow.className = 'layers-row';

    const layersToggleBtn = document.createElement('button');
    layersToggleBtn.className = 'layers-toggle-btn';
    layersToggleBtn.id = 'layersToggleBtn';
    layersToggleBtn.title = 'Toggle Layers';
    layersToggleBtn.textContent = 'LAYERS';

    const layersClearBtn = document.createElement('button');
    layersClearBtn.className = 'layers-row-clear';
    layersClearBtn.title = 'Clear all layers';
    layersClearBtn.textContent = '✕';
    layersClearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearAllLayers();
    });

    const layersHelpBtn = document.createElement('button');
    layersHelpBtn.className = 'layer-help-btn layers-row-help';
    layersHelpBtn.title = t('components.deckgl.layerGuide');
    layersHelpBtn.textContent = '?';
    layersHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showLayerHelp();
    });

    layersRow.appendChild(layersToggleBtn);
    layersRow.appendChild(layersClearBtn);
    layersRow.appendChild(layersHelpBtn);
    slider.appendChild(layersRow);

    // Add layers panel container (will be populated by createLayerToggles)
    const layersPanel = document.createElement('div');
    layersPanel.className = 'layers-panel deckgl-layers-panel deckgl-layer-toggles';
    layersPanel.id = 'layersPanel';
    const layersOpen = getTrayOpenPreference('deckLayersOpen', false);
    layersPanel.style.display = layersOpen ? 'block' : 'none';
    layersToggleBtn.classList.toggle('active', layersOpen);
    layersRow.classList.toggle('active', layersOpen);
    slider.appendChild(layersPanel);

    slider.querySelectorAll('.time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const range = (btn as HTMLElement).dataset.range as TimeRange;
        this.setTimeRange(range);
      });
    });

    layersToggleBtn.addEventListener('click', () => {
      const panel = slider.querySelector('.layers-panel') as HTMLElement;
      if (panel) {
        const open = panel.style.display === 'none';
        panel.style.display = open ? 'block' : 'none';
        layersToggleBtn.classList.toggle('active', open);
        layersRow.classList.toggle('active', open);
        setTrayOpenPreference('deckLayersOpen', open);
      }
    });
  }

  private updateTimeSliderButtons(): void {
    const slider = this.container.querySelector('.deckgl-time-slider');
    if (!slider) return;
    slider.querySelectorAll('.time-btn').forEach((btn) => {
      const range = (btn as HTMLElement).dataset.range as TimeRange | undefined;
      btn.classList.toggle('active', range === this.state.timeRange);
    });
  }

  private createLayerToggles(): void {
    const layersPanel = this.container.querySelector('#layersPanel') as HTMLElement;
    if (!layersPanel) return;
    layersPanel.replaceChildren();

    const layerDefs = getLayersForVariant((SITE_VARIANT || 'full') as MapVariant, 'flat');
    const _wmKey = getSecretState('WORLDMONITOR_API_KEY').present;
    const layerConfig = layerDefs.map(def => ({
      key: def.key,
      label: resolveLayerLabel(def, t),
      icon: def.icon,
      premium: def.premium,
    }));

    const header = document.createElement('div');
    header.className = 'map-tray-header';
    const title = document.createElement('span');
    title.className = 'map-tray-title';
    title.textContent = 'Layer filters';
    const status = document.createElement('span');
    status.className = 'map-tray-status';
    header.append(title, status);
    layersPanel.appendChild(header);

    // Build layer list
    const list = document.createElement('div');
    list.className = 'toggle-list map-tray-body';
    list.style.maxHeight = '32vh';
    list.style.overflowY = 'auto';
    list.style.setProperty('scrollbar-width', 'thin');

    layerConfig.forEach(({ key, label, icon, premium }) => {
      const isLocked = premium === 'locked' && !_wmKey;
      const isEnhanced = premium === 'enhanced' && !_wmKey;

      const toggle = document.createElement('label');
      toggle.className = `layer-toggle${isLocked ? ' layer-toggle-locked' : ''}`;
      toggle.dataset.layer = key;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.state.layers[key as keyof MapLayers] || false;
      if (isLocked) checkbox.disabled = true;
      toggle.appendChild(checkbox);

      const iconSpan = document.createElement('span');
      iconSpan.className = 'toggle-icon';
      iconSpan.style.color = resolveLayerAccentColor(key, getCurrentTheme());
      iconSpan.innerHTML = icon;
      toggle.appendChild(iconSpan);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'toggle-label';
      labelSpan.textContent = label;
      if (isLocked) labelSpan.textContent += ' 🔒';
      if (isEnhanced) {
        const badge = document.createElement('span');
        badge.className = 'layer-pro-badge';
        badge.textContent = 'PRO';
        labelSpan.appendChild(badge);
      }
      toggle.appendChild(labelSpan);

      list.appendChild(toggle);
    });

    // Render existing custom categories
    this.renderCustomCategories(list, status, layersPanel, layerConfig);

    layersPanel.appendChild(list);

    // Keep reference for event binding below
    const toggles = layersPanel;

    // Bind toggle events
    toggles.querySelectorAll('.layer-toggle input').forEach(input => {
      input.addEventListener('change', () => {
        const layer = (input as HTMLInputElement).closest('.layer-toggle')?.getAttribute('data-layer') as keyof MapLayers;
        if (layer) {
          this.state.layers[layer] = (input as HTMLInputElement).checked;
          if (layer === 'flights') this.manageAircraftTimer((input as HTMLInputElement).checked);
          this.render();
          this.onLayerChange?.(layer, (input as HTMLInputElement).checked, 'user');
          if (layer === 'ciiChoropleth') {
            const ciiLeg = this.container.querySelector('#ciiChoroplethLegend') as HTMLElement | null;
            if (ciiLeg) ciiLeg.style.display = (input as HTMLInputElement).checked ? 'block' : 'none';
          }
          this.refreshLegend();
          this.enforceLayerLimit();
          status.textContent = `${layersPanel.querySelectorAll('.layer-toggle input:checked').length} active`;
        }
      });
    });
    this.enforceLayerLimit();
    status.textContent = `${layersPanel.querySelectorAll('.layer-toggle input:checked').length} active`;

    // Manual scroll: intercept wheel, prevent map zoom, scroll the list ourselves
    const toggleList = toggles.querySelector('.toggle-list');
    if (toggleList) {
      toggles.addEventListener('wheel', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleList.scrollTop += e.deltaY;
      }, { passive: false });
      toggles.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });
    }
  }

  /** Render custom category items into the toggle list */
  private renderCustomCategories(
    list: HTMLElement,
    status: HTMLElement,
    layersPanel: HTMLElement,
    layerConfig: Array<{ key: string; label: string; icon: string; premium?: string }>,
  ): void {
    // Remove existing custom category elements
    list.querySelectorAll('.custom-category-item, .custom-category-divider').forEach(el => el.remove());

    if (this.customCategories.length === 0) return;

    const divider = document.createElement('div');
    divider.className = 'custom-category-divider';
    divider.textContent = 'Custom';
    list.appendChild(divider);

    this.customCategories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'custom-category-item layer-toggle';
      item.dataset.catId = cat.id;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      const allEnabled = cat.layers.every(l => this.state.layers[l]);
      const anyEnabled = cat.layers.some(l => this.state.layers[l]);
      checkbox.checked = allEnabled;
      checkbox.indeterminate = !allEnabled && anyEnabled;
      item.appendChild(checkbox);

      const iconSpan = document.createElement('span');
      iconSpan.className = 'toggle-icon';
      iconSpan.style.color = 'var(--text-dim)';
      iconSpan.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
      item.appendChild(iconSpan);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'toggle-label';
      labelSpan.textContent = cat.name;
      item.appendChild(labelSpan);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'custom-category-delete-btn';
      deleteBtn.title = 'Delete category';
      deleteBtn.innerHTML = '&times;';
      item.appendChild(deleteBtn);

      // Toggle all constituent layers
      checkbox.addEventListener('change', () => {
        cat.layers.forEach(l => {
          this.state.layers[l] = checkbox.checked;
          if (l === 'flights') this.manageAircraftTimer(checkbox.checked);
          this.onLayerChange?.(l, checkbox.checked, 'user');
        });
        this.render();
        this.refreshLegend();
        this.enforceLayerLimit();
        status.textContent = `${layersPanel.querySelectorAll('.layer-toggle input:checked').length} active`;
        // Sync individual toggles in the panel
        cat.layers.forEach(l => {
          const cb = layersPanel.querySelector<HTMLInputElement>(`.layer-toggle[data-layer="${l}"] input`);
          if (cb) cb.checked = checkbox.checked;
        });
      });

      // 3-second hover to reveal delete button
      let hoverTimer: ReturnType<typeof setTimeout> | null = null;
      item.addEventListener('mouseenter', () => {
        hoverTimer = setTimeout(() => { item.classList.add('show-delete'); }, 3000);
      });
      item.addEventListener('mouseleave', () => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        item.classList.remove('show-delete');
      });

      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Disable all layers in the category before removing
        cat.layers.forEach(l => {
          this.state.layers[l] = false;
          this.onLayerChange?.(l, false, 'user');
          const cb = layersPanel.querySelector<HTMLInputElement>(`.layer-toggle[data-layer="${l}"] input`);
          if (cb) cb.checked = false;
        });
        this.customCategories = this.customCategories.filter(c => c.id !== cat.id);
        saveCustomCategories(this.customCategories);
        this.renderCustomCategories(list, status, layersPanel, layerConfig);
        this.render();
        this.refreshLegend();
        status.textContent = `${layersPanel.querySelectorAll('.layer-toggle input:checked').length} active`;
      });

      list.appendChild(item);
    });
  }

  /** Open the custom category creation modal */
  private openCustomCategoryModal(
    layerConfig: Array<{ key: string; label: string; icon: string; premium?: string }>,
    list: HTMLElement,
    status: HTMLElement,
    layersPanel: HTMLElement,
  ): void {
    // Remove any existing modal
    document.querySelector('.custom-category-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'custom-category-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'custom-category-modal';

    const title = document.createElement('div');
    title.className = 'custom-category-modal-title';
    title.textContent = 'New Custom Category';
    modal.appendChild(title);

    const nameLabel = document.createElement('label');
    nameLabel.className = 'custom-category-modal-label';
    nameLabel.textContent = 'Category name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'custom-category-modal-input';
    nameInput.placeholder = 'e.g. My Watch List';
    nameInput.maxLength = 40;
    nameLabel.appendChild(nameInput);
    modal.appendChild(nameLabel);

    const sourcesLabel = document.createElement('div');
    sourcesLabel.className = 'custom-category-modal-label';
    sourcesLabel.textContent = 'Select sources';
    modal.appendChild(sourcesLabel);

    const sourcesList = document.createElement('div');
    sourcesList.className = 'custom-category-modal-sources';
    modal.appendChild(sourcesList);

    // All available layers for this variant
    const allLayers = getLayersForVariant((SITE_VARIANT || 'full') as MapVariant, 'flat');
    allLayers.forEach(def => {
      const row = document.createElement('label');
      row.className = 'custom-category-source-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = def.key;
      const iconEl = document.createElement('span');
      iconEl.className = 'toggle-icon';
      iconEl.style.color = resolveLayerAccentColor(def.key, getCurrentTheme());
      iconEl.innerHTML = def.icon;
      const lbl = document.createElement('span');
      lbl.textContent = resolveLayerLabel(def, t);
      row.append(cb, iconEl, lbl);
      sourcesList.appendChild(row);
    });

    const actions = document.createElement('div');
    actions.className = 'custom-category-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'custom-category-modal-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const createBtn = document.createElement('button');
    createBtn.className = 'custom-category-modal-btn create';
    createBtn.textContent = 'Create';
    createBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const selectedLayers = Array.from(sourcesList.querySelectorAll<HTMLInputElement>('input:checked'))
        .map(cb => cb.value as keyof MapLayers);
      if (!name) { nameInput.focus(); return; }
      if (selectedLayers.length === 0) return;

      const newCat: CustomCategory = { id: Date.now().toString(), name, layers: selectedLayers };
      this.customCategories = [...this.customCategories, newCat];
      saveCustomCategories(this.customCategories);
      this.renderCustomCategories(list, status, layersPanel, layerConfig);
      overlay.remove();
    });

    actions.append(cancelBtn, createBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    nameInput.focus();
  }

  /** Clear all active layers */
  private clearAllLayers(): void {
    const layerDefs = getLayersForVariant((SITE_VARIANT || 'full') as MapVariant, 'flat');
    layerDefs.forEach(def => {
      const key = def.key as keyof MapLayers;
      if (this.state.layers[key]) {
        this.state.layers[key] = false;
        this.onLayerChange?.(key, false, 'programmatic');
      }
    });
    // Sync all checkboxes in the panel
    this.container.querySelectorAll<HTMLInputElement>('.layer-toggle input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
    // Hide CII legend if it was visible
    const ciiLeg = this.container.querySelector('#ciiChoroplethLegend') as HTMLElement | null;
    if (ciiLeg) ciiLeg.style.display = 'none';
    // Stop flights timer if running
    this.manageAircraftTimer(false);
    this.layerWarningShown = false;
    this.render();
    this.refreshLegend();
  }

  /** Show layer help popup explaining each layer */
  private showLayerHelp(): void {
    const existing = this.container.querySelector('.layer-help-popup');
    if (existing) {
      existing.remove();
      return;
    }

    const popup = document.createElement('div');
    popup.className = 'layer-help-popup';

    const label = (layerKey: string): string => t(`components.deckgl.layers.${layerKey}`).toUpperCase();
    const helpItem = (layerLabel: string, descriptionKey: string): string =>
      `<div class="layer-help-item"><span>${layerLabel}</span> ${t(`components.deckgl.layerHelp.descriptions.${descriptionKey}`)}</div>`;
    const helpSection = (titleKey: string, items: string[], noteKey?: string): string => `
      <div class="layer-help-section">
        <div class="layer-help-title">${t(`components.deckgl.layerHelp.sections.${titleKey}`)}</div>
        ${items.join('')}
        ${noteKey ? `<div class="layer-help-note">${t(`components.deckgl.layerHelp.notes.${noteKey}`)}</div>` : ''}
      </div>
    `;
    const helpHeader = `
      <div class="layer-help-header">
        <span>${t('components.deckgl.layerHelp.title')}</span>
        <button class="layer-help-close" aria-label="Close">×</button>
      </div>
    `;

    // ── TECH variant ─────────────────────────────────────────────────────────
    // Layers: startupHubs, techHQs, accelerators, cloudRegions,
    //         datacenters, cables, outages, cyberThreats, techEvents
    const techHelpContent = `
      ${helpHeader}
      <div class="layer-help-content">
        ${helpSection('techEcosystem', [
      helpItem(label('startupHubs'), 'techStartupHubs'),
      helpItem(label('techHQs'), 'techHQs'),
      helpItem(label('accelerators'), 'techAccelerators'),
      helpItem(label('cloudRegions'), 'techCloudRegions'),
      helpItem(label('techEvents'), 'techEvents'),
    ])}
        ${helpSection('infrastructure', [
      helpItem(label('aiDataCenters'), 'infraDatacenters'),
      helpItem(label('underseaCables'), 'infraCables'),
      helpItem(label('internetOutages'), 'infraOutages'),
      helpItem(label('cyberThreats'), 'techCyberThreats'),
    ])}
      </div>
    `;

    // ── FINANCE variant ───────────────────────────────────────────────────────
    // Layers: stockExchanges, financialCenters, centralBanks, commodityHubs,
    //         gulfInvestments, tradeRoutes, cables, pipelines,
    //         outages, weather, economic, waterways,
    //         natural, cyberThreats, dayNight
    const financeHelpContent = `
      ${helpHeader}
      <div class="layer-help-content">
        ${helpSection('financeCore', [
      helpItem(label('stockExchanges'), 'financeExchanges'),
      helpItem(label('financialCenters'), 'financeCenters'),
      helpItem(label('centralBanks'), 'financeCentralBanks'),
      helpItem(label('commodityHubs'), 'financeCommodityHubs'),
      helpItem(label('gulfInvestments'), 'financeGulfInvestments'),
    ])}
        ${helpSection('infrastructureRisk', [
      helpItem(label('tradeRoutes'), 'financeTradeRoutes'),
      helpItem(label('underseaCables'), 'financeCables'),
      helpItem(label('pipelines'), 'financePipelines'),
      helpItem(label('internetOutages'), 'financeOutages'),
      helpItem(label('cyberThreats'), 'financeCyberThreats'),
    ])}
        ${helpSection('macroContext', [
      helpItem(label('weatherAlerts'), 'weatherAlertsMarket'),
      helpItem(label('economicCenters'), 'economicCenters'),
      helpItem(label('strategicWaterways'), 'macroWaterways'),
      helpItem(label('naturalEvents'), 'financeNatural'),
      helpItem(label('dayNight'), 'dayNight'),
    ])}
      </div>
    `;

    // ── HAPPY variant ─────────────────────────────────────────────────────────
    // Layers: positiveEvents, kindness, happiness, speciesRecovery, renewableInstallations
    const happyHelpContent = `
      ${helpHeader}
      <div class="layer-help-content">
        ${helpSection('happyCore', [
      helpItem(label('positiveEvents'), 'happyPositiveEvents'),
      helpItem(label('kindness'), 'happyKindness'),
      helpItem(label('happiness'), 'happyHappiness'),
    ])}
        ${helpSection('happyEnvironment', [
      helpItem(label('speciesRecovery'), 'happySpecies'),
      helpItem(label('renewableInstallations'), 'happyRenewable'),
    ])}
      </div>
    `;

    // ── COMMODITY variant ─────────────────────────────────────────────────────
    // Layers: miningSites, processingPlants, commodityPorts, commodityHubs,
    //         minerals, pipelines, waterways, tradeRoutes,
    //         natural, weather, outages, dayNight
    const commodityHelpContent = `
      ${helpHeader}
      <div class="layer-help-content">
        ${helpSection('commodityAssets', [
      helpItem(label('miningSites'), 'commodityMining'),
      helpItem(label('processingPlants'), 'commodityProcessing'),
      helpItem(label('commodityPorts'), 'commodityPorts'),
      helpItem(label('commodityHubs'), 'commodityHubs'),
      helpItem(label('criticalMinerals'), 'commodityMinerals'),
    ])}
        ${helpSection('commodityRoutes', [
      helpItem(label('pipelines'), 'commodityPipelines'),
      helpItem(label('strategicWaterways'), 'commodityWaterways'),
      helpItem(label('tradeRoutes'), 'commodityTradeRoutes'),
    ])}
        ${helpSection('commodityContext', [
      helpItem(label('naturalEvents'), 'commodityNatural'),
      helpItem(label('weatherAlerts'), 'commodityWeather'),
      helpItem(label('internetOutages'), 'commodityOutages'),
      helpItem(label('dayNight'), 'dayNight'),
    ])}
      </div>
    `;

    // ── FULL / WORLD variant ──────────────────────────────────────────────────
    // Layers: iranAttacks, hotspots, conflicts, bases, nuclear, irradiators,
    //         spaceports, cables, pipelines, datacenters, military,
    //         ais, tradeRoutes, flights, protests, ucdpEvents, displacement,
    //         climate, weather, outages, cyberThreats, natural, fires,
    //         waterways, economic, minerals, gpsJamming, ciiChoropleth, dayNight
    const fullHelpContent = `
      ${helpHeader}
      <div class="layer-help-content">
        ${helpSection('timeFilter', [
      helpItem('1H / 6H / 24H', 'timeRecent'),
      helpItem('7D / ALL', 'timeExtended'),
    ], 'timeAffects')}
        ${helpSection('geopolitical', [
      helpItem(label('iranAttacks'), 'geoIranAttacks'),
      helpItem(label('intelHotspots'), 'geoHotspots'),
      helpItem(label('conflictZones'), 'geoConflicts'),
      helpItem(label('protests'), 'geoProtests'),
      helpItem(label('ucdpEvents'), 'geoUcdpEvents'),
      helpItem(label('displacementFlows'), 'geoDisplacement'),
    ])}
        ${helpSection('militaryStrategic', [
      helpItem(label('militaryBases'), 'militaryBases'),
      helpItem(label('nuclearSites'), 'militaryNuclear'),
      helpItem(label('gammaIrradiators'), 'militaryIrradiators'),
      helpItem(label('spaceports'), 'militarySpaceports'),
      helpItem(label('militaryActivity'), 'militaryActivity'),
    ])}
        ${helpSection('infrastructure', [
      helpItem(label('underseaCables'), 'infraCablesFull'),
      helpItem(label('pipelines'), 'infraPipelinesFull'),
      helpItem(label('aiDataCenters'), 'infraDatacentersFull'),
      helpItem(label('internetOutages'), 'infraOutages'),
      helpItem(label('cyberThreats'), 'infraCyberThreats'),
    ])}
        ${helpSection('transport', [
      helpItem(label('shipTraffic'), 'transportShipping'),
      helpItem(label('tradeRoutes'), 'tradeRoutes'),
      helpItem(label('flightDelays'), 'transportDelays'),
    ])}
        ${helpSection('naturalEconomic', [
      helpItem(label('naturalEvents'), 'naturalEventsFull'),
      helpItem(label('fires'), 'firesFull'),
      helpItem(label('weatherAlerts'), 'weatherAlerts'),
      helpItem(label('climateAnomalies'), 'climateAnomalies'),
      helpItem(label('economicCenters'), 'economicCenters'),
      helpItem(label('criticalMinerals'), 'mineralsFull'),
    ])}
        ${helpSection('overlays', [
      helpItem(label('ciiChoropleth'), 'ciiChoropleth'),
      helpItem(label('gpsJamming'), 'gpsJamming'),
      helpItem(label('dayNight'), 'dayNight'),
      helpItem(label('strategicWaterways'), 'waterwaysLabels'),
    ])}
      </div>
    `;

    popup.innerHTML = SITE_VARIANT === 'tech'
      ? techHelpContent
      : SITE_VARIANT === 'finance'
        ? financeHelpContent
        : SITE_VARIANT === 'happy'
          ? happyHelpContent
          : SITE_VARIANT === 'commodity'
            ? commodityHelpContent
            : fullHelpContent;

    popup.querySelector('.layer-help-close')?.addEventListener('click', () => popup.remove());

    // Prevent scroll events from propagating to map
    const content = popup.querySelector('.layer-help-content');
    if (content) {
      content.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
      content.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });
    }

    // Close on click outside
    setTimeout(() => {
      const closeHandler = (e: MouseEvent) => {
        if (!popup.contains(e.target as Node)) {
          popup.remove();
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 100);

    this.container.appendChild(popup);
  }

  private createLegend(): void {
    const legend = document.createElement('div');
    legend.className = 'map-legend deckgl-legend map-tray';
    legend.innerHTML = `
      <div class="map-tray-header">
        <span class="map-tray-title">${t('components.deckgl.legend.title')}</span>
        <span class="map-tray-status"></span>
      </div>
      <div class="legend-items map-tray-body"></div>
      <button type="button" class="map-tray-expand-handle" title="Expand/Collapse">
        <svg class="expand-handle-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      </button>
    `;

    // CII choropleth gradient legend (shown when layer is active)
    const ciiLegend = document.createElement('div');
    ciiLegend.className = 'cii-choropleth-legend';
    ciiLegend.id = 'ciiChoroplethLegend';
    ciiLegend.style.display = this.state.layers.ciiChoropleth ? 'block' : 'none';
    ciiLegend.innerHTML = `
      <span class="legend-label-title" style="font-size:9px;letter-spacing:0.5px;">CII SCALE</span>
      <div style="display:flex;align-items:center;gap:2px;margin-top:2px;">
        <div style="width:100%;height:8px;border-radius:3px;background:linear-gradient(to right,#28b33e,#dcc030,#e87425,#dc2626,#7f1d1d);"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:8px;opacity:0.7;margin-top:1px;">
        <span>0</span><span>31</span><span>51</span><span>66</span><span>81</span><span>100</span>
      </div>
    `;
    legend.appendChild(ciiLegend);
    this.legendEl = legend;
    this.ciiLegendEl = ciiLegend;
    const expandBtn = legend.querySelector('.map-tray-expand-handle') as HTMLButtonElement | null;
    const body = legend.querySelector('.map-tray-body') as HTMLElement | null;
    const applyCollapsedState = (collapsed: boolean) => {
      body?.classList.toggle('collapsed', collapsed);
      legend.classList.toggle('collapsed', collapsed);
      expandBtn?.classList.toggle('collapsed', collapsed);
      if (this.ciiLegendEl) this.ciiLegendEl.classList.toggle('collapsed', collapsed);
      setTrayOpenPreference('deckLegendCollapsed', collapsed);
    };
    expandBtn?.addEventListener('click', () => {
      applyCollapsedState(!(body?.classList.contains('collapsed') ?? false));
    });
    applyCollapsedState(getTrayOpenPreference('deckLegendCollapsed', false));
    this.refreshLegend();

    this.container.appendChild(legend);
  }

  private refreshLegend(): void {
    if (!this.legendEl) return;
    const itemsRoot = this.legendEl.querySelector('.legend-items') as HTMLElement | null;
    const status = this.legendEl.querySelector('.map-tray-status') as HTMLElement | null;
    if (!itemsRoot) return;

    const theme = getCurrentTheme() === 'light' ? 'light' : 'dark';
    const layerDefs = getLayersForVariant((SITE_VARIANT || 'full') as MapVariant, 'flat');
    const activeLayerDefs = layerDefs.filter(def => this.state.layers[def.key]);
    if (status) {
      status.textContent = activeLayerDefs.length === 0 ? 'No active layers' : `${activeLayerDefs.length} active`;
    }

    if (activeLayerDefs.length === 0) {
      itemsRoot.innerHTML = '<span class="legend-item"><span class="legend-label">No active layers</span></span>';
    } else {
      itemsRoot.innerHTML = activeLayerDefs
        .map((def) => {
          const color = resolveLayerAccentColor(def.key, theme);
          const label = resolveLayerLabel(def, t);
          return `<span class="legend-item"><span class="legend-icon" style="color:${color}">${def.icon}</span><span class="legend-label">${label}</span></span>`;
        })
        .join('');
    }

    if (this.ciiLegendEl) {
      const collapsed = this.legendEl.classList.contains('collapsed');
      this.ciiLegendEl.style.display = this.state.layers.ciiChoropleth && !collapsed ? 'block' : 'none';
    }
  }

  // Public API methods (matching MapComponent interface)
  public render(): void {
    if (this.renderPaused) {
      this.renderPending = true;
      return;
    }
    if (this.renderScheduled) return;
    this.renderScheduled = true;

    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.updateLayers();
    });
  }

  public setRenderPaused(paused: boolean): void {
    if (this.renderPaused === paused) return;
    this.renderPaused = paused;
    if (paused) {
      this.stopPulseAnimation();
      this.stopDayNightTimer();
      return;
    }

    this.syncPulseAnimation();
    if (this.state.layers.dayNight) this.startDayNightTimer();
    if (!paused && this.renderPending) {
      this.renderPending = false;
      this.render();
    }
  }

  private updateLayers(): void {
    if (this.renderPaused || this.webglLost || !this.maplibreMap) return;
    const startTime = performance.now();
    if (this._globeProjection) {
      // In globe mode, deck.gl can't project onto the sphere — use native MapLibre layers
      try { this.deckOverlay?.setProps({ layers: [] }); } catch { /* */ }
      this._addGlobeNativeLayers();
    } else {
      try {
        this.deckOverlay?.setProps({ layers: this.buildLayers() });
      } catch { /* map may be mid-teardown (null.getProjection) */ }
    }
    this.maplibreMap.triggerRepaint();
    const elapsed = performance.now() - startTime;
    if (import.meta.env.DEV && elapsed > 16) {
      console.warn(`[DeckGLMap] updateLayers took ${elapsed.toFixed(2)}ms (>16ms budget)`);
    }
    this.updateZoomHints();
  }

  private updateZoomHints(): void {
    const toggleList = this.container.querySelector('.deckgl-layer-toggles .toggle-list');
    if (!toggleList) return;
    for (const [key, enabled] of Object.entries(this.state.layers)) {
      const toggle = toggleList.querySelector(`.layer-toggle[data-layer="${key}"]`) as HTMLElement | null;
      if (!toggle) continue;
      const zoomHidden = !!enabled && !this.isLayerVisible(key as keyof MapLayers);
      toggle.classList.toggle('zoom-hidden', zoomHidden);
    }
  }

  public setView(view: DeckMapView): void {
    const preset = VIEW_PRESETS[view];
    if (!preset) return;
    this.state.view = view;

    if (this.maplibreMap) {
      this.maplibreMap.flyTo({
        center: [preset.longitude, preset.latitude],
        zoom: preset.zoom,
        duration: 1000,
      });
    }

    const viewSelect = this.container.querySelector('.view-select') as HTMLSelectElement;
    if (viewSelect) viewSelect.value = view;

    this.onStateChange?.(this.state);
  }

  public setZoom(zoom: number): void {
    this.state.zoom = zoom;
    if (this.maplibreMap) {
      this.maplibreMap.setZoom(zoom);
    }
  }

  public setCenter(lat: number, lon: number, zoom?: number): void {
    if (this.maplibreMap) {
      this.maplibreMap.flyTo({
        center: [lon, lat],
        ...(zoom != null && { zoom }),
        duration: 500,
      });
    }
  }

  public fitCountry(code: string): void {
    const bbox = getCountryBbox(code);
    if (!bbox || !this.maplibreMap) return;
    const [minLon, minLat, maxLon, maxLat] = bbox;
    this.maplibreMap.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
      padding: 40,
      duration: 800,
      maxZoom: 8,
    });
  }

  public getCenter(): { lat: number; lon: number } | null {
    if (this.maplibreMap) {
      const center = this.maplibreMap.getCenter();
      return { lat: center.lat, lon: center.lng };
    }
    return null;
  }

  public setTimeRange(range: TimeRange): void {
    this.state.timeRange = range;
    this.rebuildProtestSupercluster();
    this.onTimeRangeChange?.(range);
    this.updateTimeSliderButtons();
    this.render(); // Debounced
  }

  public getTimeRange(): TimeRange {
    return this.state.timeRange;
  }

  public setLayers(layers: MapLayers): void {
    this.state.layers = layers;
    this.manageAircraftTimer(layers.flights);
    this.render(); // Debounced

    // Update toggle checkboxes
    Object.entries(layers).forEach(([key, value]) => {
      const toggle = this.container.querySelector(`.layer-toggle[data-layer="${key}"] input`) as HTMLInputElement;
      if (toggle) toggle.checked = value;
    });
    this.refreshLegend();
  }

  public getState(): DeckMapState {
    return { ...this.state };
  }

  // Zoom controls - public for external access
  public zoomIn(): void {
    if (this.maplibreMap) {
      this.maplibreMap.zoomIn();
    }
  }

  public zoomOut(): void {
    if (this.maplibreMap) {
      this.maplibreMap.zoomOut();
    }
  }

  private resetView(): void {
    this.setView('global');
  }

  private createUcdpEventsLayer(events: UcdpGeoEvent[]): IconLayer<UcdpGeoEvent> {
    return new IconLayer<UcdpGeoEvent>({
      id: 'ucdp-events-layer',
      data: events,
      getPosition: (d) => [d.longitude, d.latitude],
      getIcon: () => 'marker',
      iconAtlas: getSharedLayerIconAtlas('ucdpEvents'),
      iconMapping: SHARED_LAYER_ICON_MAPPING,
      getSize: (d) => Math.min(18, Math.max(11, Math.sqrt(d.deaths_best || 1) * 2 + 11)),
      sizeMinPixels: 8,
      sizeMaxPixels: 20,
      pickable: true,
      billboard: true,
    });
  }

  private createDisplacementArcsLayer(): ArcLayer<DisplacementFlow> {
    const withCoords = this.displacementFlows.filter(f => f.originLat != null && f.asylumLat != null);
    const top50 = withCoords.slice(0, 50);
    const maxCount = Math.max(1, ...top50.map(f => f.refugees));
    return new ArcLayer<DisplacementFlow>({
      id: 'displacement-arcs-layer',
      data: top50,
      getSourcePosition: (d) => [d.originLon!, d.originLat!],
      getTargetPosition: (d) => [d.asylumLon!, d.asylumLat!],
      getSourceColor: getCurrentTheme() === 'light' ? [50, 80, 180, 220] : [100, 150, 255, 180],
      getTargetColor: getCurrentTheme() === 'light' ? [20, 150, 100, 220] : [100, 255, 200, 180],
      getWidth: (d) => Math.max(1, (d.refugees / maxCount) * 8),
      widthMinPixels: 1,
      widthMaxPixels: 8,
      pickable: false,
    });
  }

  private createClimateHeatmapLayer(): HeatmapLayer<ClimateAnomaly> {
    return new HeatmapLayer<ClimateAnomaly>({
      id: 'climate-heatmap-layer',
      data: this.climateAnomalies,
      getPosition: (d) => [d.lon, d.lat],
      getWeight: (d) => Math.abs(d.tempDelta) + Math.abs(d.precipDelta) * 0.1,
      radiusPixels: 40,
      intensity: 0.6,
      threshold: 0.15,
      opacity: 0.45,
      colorRange: [
        [68, 136, 255],
        [100, 200, 255],
        [255, 255, 100],
        [255, 200, 50],
        [255, 100, 50],
        [255, 50, 50],
      ],
      pickable: false,
    });
  }

  private createTradeRoutesLayer(): ArcLayer<TradeRouteSegment> {
    const active: [number, number, number, number] = getCurrentTheme() === 'light' ? [30, 100, 180, 200] : [100, 200, 255, 160];
    const disrupted: [number, number, number, number] = getCurrentTheme() === 'light' ? [200, 40, 40, 220] : [255, 80, 80, 200];
    const highRisk: [number, number, number, number] = getCurrentTheme() === 'light' ? [200, 140, 20, 200] : [255, 180, 50, 180];
    const colorFor = (status: string): [number, number, number, number] =>
      status === 'disrupted' ? disrupted : status === 'high_risk' ? highRisk : active;

    return new ArcLayer<TradeRouteSegment>({
      id: 'trade-routes-layer',
      data: this.tradeRouteSegments,
      getSourcePosition: (d) => d.sourcePosition,
      getTargetPosition: (d) => d.targetPosition,
      getSourceColor: (d) => colorFor(d.status),
      getTargetColor: (d) => colorFor(d.status),
      getWidth: (d) => d.category === 'energy' ? 3 : 2,
      widthMinPixels: 1,
      widthMaxPixels: 6,
      greatCircle: true,
      pickable: true,
    });
  }

  private createTradeChokepointsLayer(): ScatterplotLayer {
    const routeWaypointIds = new Set<string>();
    for (const seg of this.tradeRouteSegments) {
      const route = TRADE_ROUTES_LIST.find(r => r.id === seg.routeId);
      if (route) for (const wp of route.waypoints) routeWaypointIds.add(wp);
    }
    const chokepoints = STRATEGIC_WATERWAYS.filter(w => routeWaypointIds.has(w.id));
    const isLight = getCurrentTheme() === 'light';

    return new ScatterplotLayer({
      id: 'trade-chokepoints-layer',
      data: chokepoints,
      getPosition: (d: { lon: number; lat: number }) => [d.lon, d.lat],
      getFillColor: isLight ? [200, 140, 20, 200] : [255, 180, 50, 180],
      getLineColor: isLight ? [100, 70, 10, 255] : [255, 220, 120, 255],
      getRadius: 30000,
      stroked: true,
      lineWidthMinPixels: 1,
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: false,
    });
  }

  /**
   * Compute the solar terminator polygon (night side of the Earth).
   * Uses standard astronomical formulas to find the subsolar point,
   * then traces the terminator line and closes around the dark pole.
   */
  private computeNightPolygon(): [number, number][] {
    const now = new Date();
    const JD = now.getTime() / 86400000 + 2440587.5;
    const D = JD - 2451545.0; // Days since J2000.0

    // Solar mean anomaly (radians)
    const g = ((357.529 + 0.98560028 * D) % 360) * Math.PI / 180;

    // Solar ecliptic longitude (degrees)
    const q = (280.459 + 0.98564736 * D) % 360;
    const L = q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
    const LRad = L * Math.PI / 180;

    // Obliquity of ecliptic (radians)
    const eRad = (23.439 - 0.00000036 * D) * Math.PI / 180;

    // Solar declination (radians)
    const decl = Math.asin(Math.sin(eRad) * Math.sin(LRad));

    // Solar right ascension (radians)
    const RA = Math.atan2(Math.cos(eRad) * Math.sin(LRad), Math.cos(LRad));

    // Greenwich Mean Sidereal Time (degrees)
    const GMST = ((18.697374558 + 24.06570982441908 * D) % 24) * 15;

    // Sub-solar longitude (degrees, normalized to [-180, 180])
    let sunLng = RA * 180 / Math.PI - GMST;
    sunLng = ((sunLng % 360) + 540) % 360 - 180;

    // Trace terminator line (1° steps for smooth curve at high zoom)
    const tanDecl = Math.tan(decl);
    const points: [number, number][] = [];

    // Near equinox (|tanDecl| ≈ 0), the terminator is nearly a great circle
    // through the poles — use a vertical line at the subsolar meridian ±90°
    if (Math.abs(tanDecl) < 1e-6) {
      for (let lat = -90; lat <= 90; lat += 1) {
        points.push([sunLng + 90, lat]);
      }
      for (let lat = 90; lat >= -90; lat -= 1) {
        points.push([sunLng - 90, lat]);
      }
      return points;
    }

    for (let lng = -180; lng <= 180; lng += 1) {
      const ha = (lng - sunLng) * Math.PI / 180;
      const lat = Math.atan(-Math.cos(ha) / tanDecl) * 180 / Math.PI;
      points.push([lng, lat]);
    }

    // Close polygon around the dark pole
    const darkPoleLat = decl > 0 ? -90 : 90;
    points.push([180, darkPoleLat]);
    points.push([-180, darkPoleLat]);

    return points;
  }

  private createDayNightLayer(): PolygonLayer {
    const nightPolygon = this.cachedNightPolygon ?? (this.cachedNightPolygon = this.computeNightPolygon());
    const isLight = getCurrentTheme() === 'light';

    return new PolygonLayer({
      id: 'day-night-layer',
      data: [{ polygon: nightPolygon }],
      getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
      getFillColor: isLight ? [0, 0, 40, 35] : [0, 0, 20, 55],
      filled: true,
      stroked: true,
      getLineColor: isLight ? [100, 100, 100, 40] : [200, 200, 255, 25],
      getLineWidth: 1,
      lineWidthUnits: 'pixels' as const,
      pickable: false,
    });
  }

  // Data setters - all use render() for debouncing
  public setEarthquakes(earthquakes: Earthquake[]): void {
    this.earthquakes = earthquakes;
    this.render();
  }

  public setWeatherAlerts(alerts: WeatherAlert[]): void {
    this.weatherAlerts = alerts;
    this.render();
  }

  public setOutages(outages: InternetOutage[]): void {
    this.outages = outages;
    this.render();
  }

  public setCyberThreats(threats: CyberThreat[]): void {
    this.cyberThreats = threats;
    this.render();
  }

  public setIranEvents(events: IranEvent[]): void {
    this.iranEvents = events;
    this.render();
  }

  public setAisData(disruptions: AisDisruptionEvent[], density: AisDensityZone[]): void {
    this.aisDisruptions = disruptions;
    this.aisDensity = density;
    this.render();
  }

  public enableAisLiveTracking(): void {
    if (this.aisLiveCallback) return;
    this.aisLiveCallback = (batch: AisPositionData[]) => {
      for (const vessel of batch) {
        this.aisVessels.set(vessel.mmsi, vessel);
      }
      this.render();
    };
    registerAisCallback(this.aisLiveCallback);
  }

  public disableAisLiveTracking(): void {
    if (!this.aisLiveCallback) return;
    unregisterAisCallback(this.aisLiveCallback);
    this.aisLiveCallback = null;
    this.aisVessels.clear();
    this.render();
  }

  public setCableActivity(advisories: CableAdvisory[], repairShips: RepairShip[]): void {
    this.cableAdvisories = advisories;
    this.repairShips = repairShips;
    this.render();
  }

  public setCableHealth(healthMap: Record<string, CableHealthRecord>): void {
    this.healthByCableId = healthMap;
    this.layerCache.delete('cables-layer');
    this.render();
  }

  public setProtests(events: SocialUnrestEvent[]): void {
    this.protests = events;
    this.rebuildProtestSupercluster();
    this.render();
    this.syncPulseAnimation();
  }

  public setFlightDelays(delays: AirportDelayAlert[]): void {
    this.flightDelays = delays;
    this.render();
  }

  public setAircraftPositions(positions: PositionSample[]): void {
    for (const pos of positions) {
      const hist = this.aircraftHistory.get(pos.icao24) ?? [];
      const last = hist[hist.length - 1];
      if (!last || last[0] !== pos.lon || last[1] !== pos.lat) {
        hist.push([pos.lon, pos.lat]);
        if (hist.length > this.AIRCRAFT_HISTORY_MAX) hist.shift();
        this.aircraftHistory.set(pos.icao24, hist);
      }
    }
    this.aircraftPositions = positions;
    this.render();
  }

  public setMilitaryFlights(flights: MilitaryFlight[], clusters: MilitaryFlightCluster[] = []): void {
    this.militaryFlights = flights;
    this.militaryFlightClusters = clusters;
    this.render();
  }

  public setMilitaryVessels(vessels: MilitaryVessel[], clusters: MilitaryVesselCluster[] = []): void {
    this.militaryVessels = vessels;
    this.militaryVesselClusters = clusters;
    this.render();
  }

  private fetchServerBases(): void {
    if (!this.maplibreMap) return;
    const mapLayers = this.state.layers;
    if (!mapLayers.bases) return;
    const zoom = this.maplibreMap.getZoom();
    if (zoom < 3) return;
    const bounds = this.maplibreMap.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    fetchMilitaryBases(sw.lat, sw.lng, ne.lat, ne.lng, zoom).then((result) => {
      if (!result) return;
      this.serverBases = result.bases;
      this.serverBaseClusters = result.clusters;
      this.serverBasesLoaded = true;
      this.render();
    }).catch((err) => {
      console.error('[bases] fetch error', err);
    });
  }

  private manageAircraftTimer(enabled: boolean): void {
    if (enabled) {
      if (!this.aircraftFetchTimer) {
        this.aircraftFetchTimer = setInterval(() => {
          this.lastAircraftFetchCenter = null; // force refresh on poll
          this.fetchViewportAircraft();
        }, 120_000); // Match server cache TTL (120s anonymous OpenSky tier)
        this.debouncedFetchAircraft();
      }
    } else {
      if (this.aircraftFetchTimer) {
        clearInterval(this.aircraftFetchTimer);
        this.aircraftFetchTimer = null;
      }
      this.aircraftPositions = [];
    }
  }

  private hasAircraftViewportChanged(): boolean {
    if (!this.maplibreMap) return false;
    if (!this.lastAircraftFetchCenter) return true;
    const center = this.maplibreMap.getCenter();
    const zoom = this.maplibreMap.getZoom();
    if (Math.abs(zoom - this.lastAircraftFetchZoom) >= 1) return true;
    const [prevLng, prevLat] = this.lastAircraftFetchCenter;
    // Threshold scales with zoom — higher zoom = smaller movement triggers fetch
    const threshold = Math.max(0.1, 2 / Math.pow(2, Math.max(0, zoom - 3)));
    return Math.abs(center.lat - prevLat) > threshold || Math.abs(center.lng - prevLng) > threshold;
  }

  private fetchViewportAircraft(): void {
    if (!this.maplibreMap) return;
    if (!this.state.layers.flights) return;
    const zoom = this.maplibreMap.getZoom();
    if (zoom < 2) {
      if (this.aircraftPositions.length > 0) {
        this.aircraftPositions = [];
        this.render();
      }
      return;
    }
    if (!this.hasAircraftViewportChanged()) return;
    const bounds = this.maplibreMap.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const seq = ++this.aircraftFetchSeq;
    fetchAircraftPositions({
      swLat: sw.lat, swLon: sw.lng,
      neLat: ne.lat, neLon: ne.lng,
    }).then((positions) => {
      if (seq !== this.aircraftFetchSeq) return; // discard stale response
      this.aircraftPositions = positions;
      this.onAircraftPositionsUpdate?.(positions);
      const center = this.maplibreMap?.getCenter();
      if (center) {
        this.lastAircraftFetchCenter = [center.lng, center.lat];
        this.lastAircraftFetchZoom = this.maplibreMap!.getZoom();
      }
      this.render();
    }).catch((err) => {
      console.error('[aircraft] fetch error', err);
    });
  }

  public setNaturalEvents(events: NaturalEvent[]): void {
    this.naturalEvents = events;
    this.render();
  }

  public setFires(fires: Array<{ lat: number; lon: number; brightness: number; frp: number; confidence: number; region: string; acq_date: string; daynight: string }>): void {
    this.firmsFireData = fires;
    this.render();
  }

  public setTechEvents(events: TechEventMarker[]): void {
    this.techEvents = events;
    this.rebuildTechEventSupercluster();
    this.render();
  }

  public setUcdpEvents(events: UcdpGeoEvent[]): void {
    this.ucdpEvents = events;
    this.render();
  }

  public setDisplacementFlows(flows: DisplacementFlow[]): void {
    this.displacementFlows = flows;
    this.render();
  }

  public setClimateAnomalies(anomalies: ClimateAnomaly[]): void {
    this.climateAnomalies = anomalies;
    this.render();
  }

  public setGpsJamming(hexes: GpsJamHex[]): void {
    this.gpsJammingHexes = hexes;
    this.render();
  }

  public setNewsLocations(data: Array<{ lat: number; lon: number; title: string; threatLevel: string; timestamp?: Date }>): void {
    const now = Date.now();
    for (const d of data) {
      if (!this.newsLocationFirstSeen.has(d.title)) {
        this.newsLocationFirstSeen.set(d.title, now);
      }
    }
    for (const [key, ts] of this.newsLocationFirstSeen) {
      if (now - ts > 60_000) this.newsLocationFirstSeen.delete(key);
    }
    this.newsLocations = data;
    this.render();

    this.syncPulseAnimation(now);
  }

  public setPositiveEvents(events: PositiveGeoEvent[]): void {
    this.positiveEvents = events;
    this.syncPulseAnimation();
    this.render();
  }

  public setKindnessData(points: KindnessPoint[]): void {
    this.kindnessPoints = points;
    this.syncPulseAnimation();
    this.render();
  }

  public setHappinessScores(data: HappinessData): void {
    this.happinessScores = data.scores;
    this.happinessYear = data.year;
    this.happinessSource = data.source;
    this.render();
  }

  public setCIIScores(scores: Array<{ code: string; score: number; level: string }>): void {
    this.ciiScoresMap = new Map(scores.map(s => [s.code, { score: s.score, level: s.level }]));
    this.ciiScoresVersion++;
    this.render();
  }

  public setSpeciesRecoveryZones(species: SpeciesRecovery[]): void {
    this.speciesRecoveryZones = species.filter(
      (s): s is SpeciesRecovery & { recoveryZone: { name: string; lat: number; lon: number } } =>
        s.recoveryZone != null
    );
    this.render();
  }

  public setRenewableInstallations(installations: RenewableInstallation[]): void {
    this.renewableInstallations = installations;
    this.render();
  }

  public updateHotspotActivity(news: NewsItem[]): void {
    this.news = news; // Store for related news lookup

    // Update hotspot "breaking" indicators based on recent news
    const breakingKeywords = new Set<string>();
    const recentNews = news.filter(n =>
      Date.now() - n.pubDate.getTime() < 2 * 60 * 60 * 1000 // Last 2 hours
    );

    // Count matches per hotspot for escalation tracking
    const matchCounts = new Map<string, number>();

    recentNews.forEach(item => {
      const tokens = tokenizeForMatch(item.title);
      this.hotspots.forEach(hotspot => {
        if (matchesAnyKeyword(tokens, hotspot.keywords)) {
          breakingKeywords.add(hotspot.id);
          matchCounts.set(hotspot.id, (matchCounts.get(hotspot.id) || 0) + 1);
        }
      });
    });

    this.hotspots.forEach(h => {
      h.hasBreaking = breakingKeywords.has(h.id);
      const matchCount = matchCounts.get(h.id) || 0;
      // Calculate a simple velocity metric (matches per hour normalized)
      const velocity = matchCount > 0 ? matchCount / 2 : 0; // 2 hour window
      updateHotspotEscalation(h.id, matchCount, h.hasBreaking || false, velocity);
    });

    this.render();
    this.syncPulseAnimation();
  }

  /** Get news items related to a hotspot by keyword matching */
  private getRelatedNews(hotspot: Hotspot): NewsItem[] {
    const conflictTopics = ['gaza', 'ukraine', 'ukrainian', 'russia', 'russian', 'israel', 'israeli', 'iran', 'iranian', 'china', 'chinese', 'taiwan', 'taiwanese', 'korea', 'korean', 'syria', 'syrian'];

    return this.news
      .map((item) => {
        const tokens = tokenizeForMatch(item.title);
        const matchedKeywords = findMatchingKeywords(tokens, hotspot.keywords);

        if (matchedKeywords.length === 0) return null;

        const conflictMatches = conflictTopics.filter(t =>
          matchKeyword(tokens, t) && !hotspot.keywords.some(k => k.toLowerCase().includes(t))
        );

        if (conflictMatches.length > 0) {
          const strongLocalMatch = matchedKeywords.some(kw =>
            kw.toLowerCase() === hotspot.name.toLowerCase() ||
            hotspot.agencies?.some(a => matchKeyword(tokens, a))
          );
          if (!strongLocalMatch) return null;
        }

        const score = matchedKeywords.length;
        return { item, score };
      })
      .filter((x): x is { item: NewsItem; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => x.item);
  }

  public updateMilitaryForEscalation(flights: MilitaryFlight[], vessels: MilitaryVessel[]): void {
    setMilitaryData(flights, vessels);
  }

  public getHotspotDynamicScore(hotspotId: string) {
    return getHotspotEscalation(hotspotId);
  }

  /** Get military flight clusters for rendering/analysis */
  public getMilitaryFlightClusters(): MilitaryFlightCluster[] {
    return this.militaryFlightClusters;
  }

  /** Get military vessel clusters for rendering/analysis */
  public getMilitaryVesselClusters(): MilitaryVesselCluster[] {
    return this.militaryVesselClusters;
  }

  public highlightAssets(assets: RelatedAsset[] | null): void {
    // Clear previous highlights
    Object.values(this.highlightedAssets).forEach(set => set.clear());

    if (assets) {
      assets.forEach(asset => {
        if (asset?.type && this.highlightedAssets[asset.type]) {
          this.highlightedAssets[asset.type].add(asset.id);
        }
      });
    }

    this.render(); // Debounced
  }

  public setOnHotspotClick(callback: (hotspot: Hotspot) => void): void {
    this.onHotspotClick = callback;
  }

  public setOnTimeRangeChange(callback: (range: TimeRange) => void): void {
    this.onTimeRangeChange = callback;
  }

  public setOnLayerChange(callback: (layer: keyof MapLayers, enabled: boolean, source: 'user' | 'programmatic') => void): void {
    this.onLayerChange = callback;
  }

  public setOnStateChange(callback: (state: DeckMapState) => void): void {
    this.onStateChange = callback;
  }

  public setOnAircraftPositionsUpdate(callback: (positions: PositionSample[]) => void): void {
    this.onAircraftPositionsUpdate = callback;
  }

  public getHotspotLevels(): Record<string, string> {
    const levels: Record<string, string> = {};
    this.hotspots.forEach(h => {
      levels[h.name] = h.level || 'low';
    });
    return levels;
  }

  public setHotspotLevels(levels: Record<string, string>): void {
    this.hotspots.forEach(h => {
      if (levels[h.name]) {
        h.level = levels[h.name] as 'low' | 'elevated' | 'high';
      }
    });
    this.render(); // Debounced
  }

  public initEscalationGetters(): void {
    setCIIGetter(getCountryScore);
    setGeoAlertGetter(getAlertsNearLocation);
  }

  private layerWarningShown = false;

  private enforceLayerLimit(): void {
    const WARN_THRESHOLD = 10;
    const togglesEl = this.container.querySelector('.deckgl-layer-toggles');
    if (!togglesEl) return;
    const activeCount = Array.from(togglesEl.querySelectorAll<HTMLInputElement>('.layer-toggle input'))
      .filter(i => (i.closest('.layer-toggle') as HTMLElement)?.style.display !== 'none')
      .filter(i => i.checked).length;
    if (activeCount >= WARN_THRESHOLD && !this.layerWarningShown) {
      this.layerWarningShown = true;
      showLayerWarning(WARN_THRESHOLD);
    } else if (activeCount < WARN_THRESHOLD) {
      this.layerWarningShown = false;
    }
  }

  // UI visibility methods
  public hideLayerToggle(layer: keyof MapLayers): void {
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"]`);
    if (toggle) (toggle as HTMLElement).style.display = 'none';
  }

  public setLayerLoading(layer: keyof MapLayers, loading: boolean): void {
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"]`);
    if (toggle) toggle.classList.toggle('loading', loading);
  }

  public setLayerReady(layer: keyof MapLayers, hasData: boolean): void {
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"]`);
    if (!toggle) return;

    toggle.classList.remove('loading');
    // Match old Map.ts behavior: set 'active' only when layer enabled AND has data
    if (this.state.layers[layer] && hasData) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }

  public flashAssets(assetType: AssetType, ids: string[]): void {
    if (!this.highlightedAssets[assetType]) return;
    ids.forEach(id => this.highlightedAssets[assetType].add(id));
    this.render();

    setTimeout(() => {
      ids.forEach(id => this.highlightedAssets[assetType]?.delete(id));
      this.render();
    }, 3000);
  }

  // Enable layer programmatically
  public enableLayer(layer: keyof MapLayers): void {
    if (!this.state.layers[layer]) {
      this.state.layers[layer] = true;
      const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"] input`) as HTMLInputElement;
      if (toggle) toggle.checked = true;
      this.render();
      this.onLayerChange?.(layer, true, 'programmatic');
      this.enforceLayerLimit();
    }
  }

  // Toggle layer on/off programmatically
  public toggleLayer(layer: keyof MapLayers): void {
    this.state.layers[layer] = !this.state.layers[layer];
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"] input`) as HTMLInputElement;
    if (toggle) toggle.checked = this.state.layers[layer];
    this.render();
    this.onLayerChange?.(layer, this.state.layers[layer], 'programmatic');
    this.enforceLayerLimit();
  }

  // Get center coordinates for programmatic popup positioning
  private getContainerCenter(): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  // Project lat/lon to screen coordinates without moving the map
  private projectToScreen(lat: number, lon: number): { x: number; y: number } | null {
    if (!this.maplibreMap) return null;
    const point = this.maplibreMap.project([lon, lat]);
    return { x: point.x, y: point.y };
  }

  // Trigger click methods - show popup at item location without moving the map
  public triggerHotspotClick(id: string): void {
    const hotspot = this.hotspots.find(h => h.id === id);
    if (!hotspot) return;

    // Get screen position for popup
    const screenPos = this.projectToScreen(hotspot.lat, hotspot.lon);
    const { x, y } = screenPos || this.getContainerCenter();

    // Get related news and show popup
    const relatedNews = this.getRelatedNews(hotspot);
    this.popup.show({
      type: 'hotspot',
      data: hotspot,
      relatedNews,
      x,
      y,
    });
    this.popup.loadHotspotGdeltContext(hotspot);
    this.onHotspotClick?.(hotspot);
  }

  public triggerConflictClick(id: string): void {
    const conflict = CONFLICT_ZONES.find(c => c.id === id);
    if (conflict) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(conflict.center[1], conflict.center[0]);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'conflict', data: conflict, x, y });
    }
  }

  public triggerBaseClick(id: string): void {
    const base = this.serverBases.find(b => b.id === id) || MILITARY_BASES.find(b => b.id === id);
    if (base) {
      const screenPos = this.projectToScreen(base.lat, base.lon);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'base', data: base, x, y });
    }
  }

  public triggerPipelineClick(id: string): void {
    const pipeline = PIPELINES.find(p => p.id === id);
    if (pipeline && pipeline.points.length > 0) {
      const midIdx = Math.floor(pipeline.points.length / 2);
      const midPoint = pipeline.points[midIdx];
      // Don't pan - show popup at projected screen position or center
      const screenPos = midPoint ? this.projectToScreen(midPoint[1], midPoint[0]) : null;
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'pipeline', data: pipeline, x, y });
    }
  }

  public triggerCableClick(id: string): void {
    const cable = UNDERSEA_CABLES.find(c => c.id === id);
    if (cable && cable.points.length > 0) {
      const midIdx = Math.floor(cable.points.length / 2);
      const midPoint = cable.points[midIdx];
      // Don't pan - show popup at projected screen position or center
      const screenPos = midPoint ? this.projectToScreen(midPoint[1], midPoint[0]) : null;
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'cable', data: cable, x, y });
    }
  }

  public triggerDatacenterClick(id: string): void {
    const dc = AI_DATA_CENTERS.find(d => d.id === id);
    if (dc) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(dc.lat, dc.lon);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'datacenter', data: dc, x, y });
    }
  }

  public triggerNuclearClick(id: string): void {
    const facility = NUCLEAR_FACILITIES.find(n => n.id === id);
    if (facility) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(facility.lat, facility.lon);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'nuclear', data: facility, x, y });
    }
  }

  public triggerIrradiatorClick(id: string): void {
    const irradiator = GAMMA_IRRADIATORS.find(i => i.id === id);
    if (irradiator) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(irradiator.lat, irradiator.lon);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'irradiator', data: irradiator, x, y });
    }
  }

  public flashLocation(lat: number, lon: number, durationMs = 2000): void {
    // Don't pan - project coordinates to screen position
    const screenPos = this.projectToScreen(lat, lon);
    if (!screenPos) return;

    // Flash effect by temporarily adding a highlight at the location
    const flashMarker = document.createElement('div');
    flashMarker.className = 'flash-location-marker';
    flashMarker.style.cssText = `
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.5);
      border: 2px solid #fff;
      animation: flash-pulse 0.5s ease-out infinite;
      pointer-events: none;
      z-index: 1000;
      left: ${screenPos.x}px;
      top: ${screenPos.y}px;
      transform: translate(-50%, -50%);
    `;

    // Add animation keyframes if not present
    if (!document.getElementById('flash-animation-styles')) {
      const style = document.createElement('style');
      style.id = 'flash-animation-styles';
      style.textContent = `
        @keyframes flash-pulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    const wrapper = this.container.querySelector('.deckgl-map-wrapper');
    if (wrapper) {
      wrapper.appendChild(flashMarker);
      setTimeout(() => flashMarker.remove(), durationMs);
    }
  }

  // --- Country click + highlight ---

  public setOnCountryClick(cb: (country: CountryClickPayload) => void): void {
    this.onCountryClick = cb;
  }

  public setOnEntityClick(cb: (type: string, data: unknown) => void): void {
    this.onEntityClick = cb;
  }

  private resolveCountryFromCoordinate(lon: number, lat: number): { code: string; name: string } | null {
    const fromGeometry = getCountryAtCoordinates(lat, lon);
    if (fromGeometry) return fromGeometry;
    if (!this.maplibreMap || !this.countryGeoJsonLoaded) return null;
    try {
      const point = this.maplibreMap.project([lon, lat]);
      const features = this.maplibreMap.queryRenderedFeatures(point, { layers: ['country-interactive'] });
      const properties = (features?.[0]?.properties ?? {}) as Record<string, unknown>;
      const code = typeof properties['ISO3166-1-Alpha-2'] === 'string'
        ? properties['ISO3166-1-Alpha-2'].trim().toUpperCase()
        : '';
      const name = typeof properties.name === 'string'
        ? properties.name.trim()
        : '';
      if (!code || !name) return null;
      return { code, name };
    } catch {
      return null;
    }
  }

  private loadCountryBoundaries(): void {
    if (!this.maplibreMap || this.countryGeoJsonLoaded) return;
    this.countryGeoJsonLoaded = true;

    getCountriesGeoJson()
      .then((geojson) => {
        if (!this.maplibreMap || !geojson) return;
        this.countriesGeoJsonData = geojson;
        this.maplibreMap.addSource('country-boundaries', {
          type: 'geojson',
          data: geojson,
        });
        this.maplibreMap.addLayer({
          id: 'country-interactive',
          type: 'fill',
          source: 'country-boundaries',
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0,
          },
        });
        this.maplibreMap.addLayer({
          id: 'country-hover-fill',
          type: 'fill',
          source: 'country-boundaries',
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.06,
          },
          filter: ['==', ['get', 'name'], ''],
        });
        this.maplibreMap.addLayer({
          id: 'country-highlight-fill',
          type: 'fill',
          source: 'country-boundaries',
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.12,
          },
          filter: ['==', ['get', 'ISO3166-1-Alpha-2'], ''],
        });
        this.maplibreMap.addLayer({
          id: 'country-highlight-border',
          type: 'line',
          source: 'country-boundaries',
          paint: {
            'line-color': '#3b82f6',
            'line-width': 1.5,
            'line-opacity': 0.5,
          },
          filter: ['==', ['get', 'ISO3166-1-Alpha-2'], ''],
        });

        if (!this.countryHoverSetup) this.setupCountryHover();
        const { theme: paintMapTheme } = resolveUnifiedTheme(getUnifiedTheme());
        this.updateCountryLayerPaint(isLightMapTheme(paintMapTheme) ? 'light' : 'dark');
        if (this.highlightedCountryCode) this.highlightCountry(this.highlightedCountryCode);
      })
      .catch((err) => console.warn('[DeckGLMap] Failed to load country boundaries:', err));
  }

  private setupCountryHover(): void {
    if (!this.maplibreMap || this.countryHoverSetup) return;
    this.countryHoverSetup = true;
    const map = this.maplibreMap;
    let hoveredName: string | null = null;

    map.on('mousemove', (e) => {
      if (!this.onCountryClick) return;
      const features = map.queryRenderedFeatures(e.point, { layers: ['country-interactive'] });
      const name = features?.[0]?.properties?.name as string | undefined;

      try {
        if (name && name !== hoveredName) {
          hoveredName = name;
          map.setFilter('country-hover-fill', ['==', ['get', 'name'], name]);
          map.getCanvas().style.cursor = 'pointer';
        } else if (!name && hoveredName) {
          hoveredName = null;
          map.setFilter('country-hover-fill', ['==', ['get', 'name'], '']);
          map.getCanvas().style.cursor = '';
        }
      } catch { /* style not done loading during theme switch */ }
    });

    map.on('mouseout', () => {
      if (hoveredName) {
        hoveredName = null;
        try {
          map.setFilter('country-hover-fill', ['==', ['get', 'name'], '']);
        } catch { /* style not done loading */ }
        map.getCanvas().style.cursor = '';
      }
    });

    map.on('click', (e) => {
      if (!this.onCountryClick) return;
      // If a DeckGL entity icon was clicked in this same event loop, skip country detection
      if (Date.now() - this.entityClickConsumedAt < 100) return;
      const features = map.queryRenderedFeatures(e.point, { layers: ['country-interactive'] });
      const properties = (features?.[0]?.properties ?? {}) as Record<string, unknown>;
      const code = typeof properties['ISO3166-1-Alpha-2'] === 'string'
        ? properties['ISO3166-1-Alpha-2'].trim().toUpperCase()
        : undefined;
      const name = typeof properties.name === 'string'
        ? properties.name.trim()
        : undefined;
      const { lng, lat } = e.lngLat;
      this.onCountryClick({ lat, lon: lng, code: code || undefined, name: name || undefined });
    });
  }

  public highlightCountry(code: string): void {
    this.highlightedCountryCode = code;
    if (!this.maplibreMap || !this.countryGeoJsonLoaded) return;
    const filter = ['==', ['get', 'ISO3166-1-Alpha-2'], code] as maplibregl.FilterSpecification;
    try {
      this.maplibreMap.setFilter('country-highlight-fill', filter);
      this.maplibreMap.setFilter('country-highlight-border', filter);
    } catch { /* layer not ready yet */ }
  }

  public clearCountryHighlight(): void {
    this.highlightedCountryCode = null;
    if (!this.maplibreMap) return;
    const noMatch = ['==', ['get', 'ISO3166-1-Alpha-2'], ''] as maplibregl.FilterSpecification;
    try {
      this.maplibreMap.setFilter('country-highlight-fill', noMatch);
      this.maplibreMap.setFilter('country-highlight-border', noMatch);
    } catch { /* layer not ready */ }
  }

  private applyCanvasFilter(): void {
    if (!this.maplibreMap) return;
    const canvas = this.maplibreMap.getCanvas();
    canvas.style.filter = CUSTOM_THEME_FILTERS[getUnifiedTheme()] ?? '';
  }

  private applyThemeLayerOverrides(): void {
    if (!this.maplibreMap) return;
    const override = THEME_LAYER_OVERRIDES[getUnifiedTheme()];
    if (!override) return;
    try {
      for (const layer of this.maplibreMap.getStyle().layers) {
        const id = layer.id.toLowerCase();
        if (override.hide?.length && layer.type === 'symbol' && override.hide.some(p => id.includes(p))) {
          this.maplibreMap!.setLayoutProperty(layer.id, 'visibility', 'none');
        }
        if (override.paint) {
          for (const po of override.paint) {
            if (id.includes(po.match) && (!po.type || layer.type === po.type)) {
              this.maplibreMap!.setPaintProperty(layer.id, po.property, po.value);
            }
          }
        }
        if (override.layout) {
          for (const lo of override.layout) {
            if (id.includes(lo.match) && (!lo.type || layer.type === lo.type)) {
              this.maplibreMap!.setLayoutProperty(layer.id, lo.property, lo.value);
            }
          }
        }
      }
    } catch { /* style may not be fully ready */ }
  }

  private switchBasemap(): void {
    if (!this.maplibreMap) return;
    const { provider, theme: mapTheme } = resolveUnifiedTheme(getUnifiedTheme());
    const style = isHappyVariant
      ? (getCurrentTheme() === 'light' ? HAPPY_LIGHT_STYLE : HAPPY_DARK_STYLE)
      : (this.usedFallbackStyle && provider === 'auto')
        ? (isLightMapTheme(mapTheme) ? FALLBACK_LIGHT_STYLE : FALLBACK_DARK_STYLE)
        : getStyleForProvider(provider, mapTheme);
    this.maplibreMap.setStyle(style);
    this.countryGeoJsonLoaded = false;
    this.maplibreMap.once('style.load', () => {
      localizeMapLabels(this.maplibreMap);
      this.applyThemeLayerOverrides();
      this.applyCanvasFilter();
      this.loadCountryBoundaries();
      const paintTheme = isLightMapTheme(mapTheme) ? 'light' as const : 'dark' as const;
      this.updateCountryLayerPaint(paintTheme);
      // setStyle resets projection to mercator — restore globe if active
      if (this._globeProjection) {
        this.maplibreMap?.setProjection({ type: 'globe' });
      }
      this.render();
    });
    if (!isHappyVariant && provider !== 'openfreemap' && !this.usedFallbackStyle) {
      this.monitorTileLoading(mapTheme);
    }
  }

  private monitorTileLoading(mapTheme: string): void {
    if (!this.maplibreMap) return;
    const gen = ++this.tileMonitorGeneration;
    let ok = false;
    let errCount = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const map = this.maplibreMap;

    const cleanup = () => {
      map.off('error', onError);
      map.off('data', onData);
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    };

    const onError = (e: { error?: Error; message?: string }) => {
      if (gen !== this.tileMonitorGeneration) { cleanup(); return; }
      const msg = e.error?.message ?? e.message ?? '';
      if (msg.includes('Failed to fetch') || msg.includes('AJAXError') || msg.includes('CORS') || msg.includes('NetworkError') || msg.includes('403') || msg.includes('Forbidden')) {
        errCount++;
        if (!ok && errCount >= 2) {
          cleanup();
          this.switchToFallbackStyle(mapTheme);
        }
      }
    };

    const onData = (e: { dataType?: string }) => {
      if (gen !== this.tileMonitorGeneration) { cleanup(); return; }
      if (e.dataType === 'source') { ok = true; cleanup(); }
    };

    map.on('error', onError);
    map.on('data', onData);

    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (gen !== this.tileMonitorGeneration) return;
      cleanup();
      if (!ok) this.switchToFallbackStyle(mapTheme);
    }, 10000);
  }

  private switchToFallbackStyle(mapTheme: string): void {
    if (this.usedFallbackStyle || !this.maplibreMap) return;
    this.usedFallbackStyle = true;
    const fallback = isLightMapTheme(mapTheme) ? FALLBACK_LIGHT_STYLE : FALLBACK_DARK_STYLE;
    console.warn(`[DeckGLMap] Basemap tiles failed, falling back to OpenFreeMap: ${fallback}`);
    this.maplibreMap.setStyle(fallback);
    this.countryGeoJsonLoaded = false;
    this.maplibreMap.once('style.load', () => {
      localizeMapLabels(this.maplibreMap);
      this.loadCountryBoundaries();
      const paintTheme = isLightMapTheme(mapTheme) ? 'light' as const : 'dark' as const;
      this.updateCountryLayerPaint(paintTheme);
      if (this._globeProjection) {
        this.maplibreMap?.setProjection({ type: 'globe' });
      }
      this.render();
    });
  }

  public reloadBasemap(): void {
    if (!this.maplibreMap) return;
    const { provider } = resolveUnifiedTheme(getUnifiedTheme());
    if (provider === 'pmtiles' || provider === 'auto') registerPMTilesProtocol();
    this.usedFallbackStyle = false;
    this.switchBasemap();
  }

  private updateCountryLayerPaint(theme: 'dark' | 'light'): void {
    if (!this.maplibreMap || !this.countryGeoJsonLoaded) return;
    const hoverOpacity = theme === 'light' ? 0.10 : 0.06;
    const highlightOpacity = theme === 'light' ? 0.18 : 0.12;
    try {
      this.maplibreMap.setPaintProperty('country-hover-fill', 'fill-opacity', hoverOpacity);
      this.maplibreMap.setPaintProperty('country-highlight-fill', 'fill-opacity', highlightOpacity);
    } catch { /* layers may not be ready */ }
  }

  /** Whether the map is currently in globe projection mode. */
  public get isGlobeProjection(): boolean {
    return this._globeProjection;
  }

  /** Toggle between globe and mercator projection. All themes and layers stay intact. */
  public setGlobeProjection(enabled: boolean): void {
    if (!this.maplibreMap || this._globeProjection === enabled) return;
    this._globeProjection = enabled;

    this.maplibreMap.setProjection({ type: enabled ? 'globe' : 'mercator' });

    if (enabled) {
      // Allow pitch and rotation for a natural globe feel
      this.maplibreMap.setMaxPitch(85);
      (this.maplibreMap as any).dragRotate?.enable();
      (this.maplibreMap as any).touchPitch?.enable();
    } else if (MAP_INTERACTION_MODE === 'flat') {
      // Restore flat-mode constraints
      this.maplibreMap.setMaxPitch(0);
      this.maplibreMap.setPitch(0);
      this.maplibreMap.setBearing(0);
      (this.maplibreMap as any).dragRotate?.disable();
      (this.maplibreMap as any).touchPitch?.disable();
    }

    this.maplibreMap.resize();

    if (enabled) {
      this._addGlobeNativeLayers();
    } else {
      this._removeGlobeNativeLayers();
      this.render(); // Restore deck.gl layers
    }
  }

  /** Mapping from layer key to the PopupType used by MapPopup. */
  private static readonly GLOBE_LAYER_POPUP_TYPES: Partial<Record<keyof MapLayers, PopupType>> = {
    bases: 'base', nuclear: 'nuclear', irradiators: 'irradiator', spaceports: 'spaceport',
    waterways: 'waterway', economic: 'economic',
    stockExchanges: 'stockExchange', financialCenters: 'financialCenter',
    centralBanks: 'centralBank', commodityHubs: 'commodityHub',
    datacenters: 'datacenter', hotspots: 'hotspot',
    natural: 'earthquake', minerals: 'mineral',
    startupHubs: 'startupHub', techHQs: 'techHQ',
    accelerators: 'accelerator', cloudRegions: 'cloudRegion',
    flights: 'flight',
  };

  /** Add MapLibre native symbol layers for globe mode (deck.gl can't project onto globe). */
  private _addGlobeNativeLayers(): void {
    if (!this.maplibreMap || !this._globeProjection) return;
    this._removeGlobeNativeLayers();

    // Hide deck.gl layers while globe native layers are active
    try { this.deckOverlay?.setProps({ layers: [] }); } catch { /* */ }

    const { layers: mapLayers } = this.state;
    const theme = getThemeMode();
    const basesData = this.serverBases.length ? this.serverBases : MILITARY_BASES;

    type GlobeLayerDef = { key: keyof MapLayers; items: Array<Record<string, unknown>>; active: boolean };

    const defs: GlobeLayerDef[] = [
      { key: 'bases', items: basesData as unknown as Array<Record<string, unknown>>, active: !!mapLayers.bases },
      { key: 'nuclear', items: NUCLEAR_FACILITIES as unknown as Array<Record<string, unknown>>, active: !!mapLayers.nuclear },
      { key: 'irradiators', items: GAMMA_IRRADIATORS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.irradiators },
      { key: 'spaceports', items: SPACEPORTS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.spaceports },
      { key: 'waterways', items: STRATEGIC_WATERWAYS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.waterways },
      { key: 'economic', items: ECONOMIC_CENTERS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.economic },
      { key: 'stockExchanges', items: STOCK_EXCHANGES as unknown as Array<Record<string, unknown>>, active: !!mapLayers.stockExchanges },
      { key: 'financialCenters', items: FINANCIAL_CENTERS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.financialCenters },
      { key: 'centralBanks', items: CENTRAL_BANKS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.centralBanks },
      { key: 'commodityHubs', items: COMMODITY_HUBS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.commodityHubs },
      { key: 'datacenters', items: AI_DATA_CENTERS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.datacenters },
      { key: 'hotspots', items: (this.hotspots || []) as unknown as Array<Record<string, unknown>>, active: !!mapLayers.hotspots },
      { key: 'natural', items: this.earthquakes as unknown as Array<Record<string, unknown>>, active: !!mapLayers.natural },
      { key: 'minerals', items: CRITICAL_MINERALS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.minerals },
      { key: 'flights', items: this.flightDelays as unknown as Array<Record<string, unknown>>, active: !!mapLayers.flights },
    ];

    if (SITE_VARIANT === 'tech') {
      defs.push(
        { key: 'startupHubs', items: STARTUP_HUBS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.startupHubs },
        { key: 'techHQs', items: TECH_HQS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.techHQs },
        { key: 'accelerators', items: ACCELERATORS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.accelerators },
        { key: 'cloudRegions', items: CLOUD_REGIONS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.cloudRegions },
      );
    }

    defs.push(
      { key: 'miningSites', items: MINING_SITES as unknown as Array<Record<string, unknown>>, active: !!mapLayers.miningSites },
      { key: 'processingPlants', items: PROCESSING_PLANTS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.processingPlants },
      { key: 'commodityPorts', items: COMMODITY_GEO_PORTS as unknown as Array<Record<string, unknown>>, active: !!mapLayers.commodityPorts },
    );

    for (const def of defs) {
      if (!def.active || def.items.length === 0) continue;

      const imgId = `_globe-img-${def.key}-${theme}`;
      const srcId = `_globe-src-${def.key}`;
      const lyrId = `_globe-lyr-${def.key}`;
      const popupType = DeckGLMap.GLOBE_LAYER_POPUP_TYPES[def.key];

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: def.items.map((item, idx) => {
          const lon = typeof item.lon === 'number' ? item.lon : (item.location as any)?.longitude ?? 0;
          const lat = typeof item.lat === 'number' ? item.lat : (item.location as any)?.latitude ?? 0;
          return {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [lon, lat] },
            // Store index so we can look up the original item on hover
            properties: { _idx: idx },
          };
        }),
      };

      this.maplibreMap.addSource(srcId, { type: 'geojson', data: geojson });
      this._globeNativeSources.push(srcId);

      const addSymbolLayer = () => {
        if (!this.maplibreMap?.getSource(srcId)) return;
        this.maplibreMap.addLayer({
          id: lyrId,
          type: 'symbol',
          source: srcId,
          layout: {
            'icon-image': imgId,
            'icon-size': 0.45,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
        this._globeNativeLayers.push(lyrId);

        // Wire hover/click to show the same popup as 2D mode
        if (popupType) {
          const items = def.items;
          const onMouseMove = (e: maplibregl.MapLayerMouseEvent) => {
            if (!this.maplibreMap) return;
            this.maplibreMap.getCanvas().style.cursor = 'pointer';
            const feat = e.features?.[0];
            if (!feat) return;
            const idx = feat.properties?._idx as number;
            const data = items[idx];
            if (!data) return;
            // e.point is relative to the map canvas which equals the container
            this.popup.show({ type: popupType, data: data as any, x: e.point.x, y: e.point.y });
            if (popupType === 'hotspot') {
              this.popup.loadHotspotGdeltContext(data as any);
              this.onHotspotClick?.(data as any);
            }
          };
          const onMouseLeave = () => {
            if (this.maplibreMap) this.maplibreMap.getCanvas().style.cursor = '';
            this.popup.hide();
          };
          this.maplibreMap.on('mousemove', lyrId, onMouseMove);
          this.maplibreMap.on('mouseleave', lyrId, onMouseLeave);
          this._globeNativeListeners.push([lyrId, 'mousemove', onMouseMove]);
          this._globeNativeListeners.push([lyrId, 'mouseleave', onMouseLeave]);
        }
      };

      if (this.maplibreMap.hasImage(imgId)) {
        addSymbolLayer();
      } else {
        const svgUrl = getSharedLayerIconAtlas(def.key, theme);
        const img = new Image(32, 32);
        img.onload = () => {
          if (!this.maplibreMap) return;
          if (!this.maplibreMap.hasImage(imgId)) {
            this.maplibreMap.addImage(imgId, img);
            this._globeNativeImages.push(imgId);
          }
          addSymbolLayer();
        };
        img.onerror = () => addSymbolLayer();
        img.src = svgUrl;
      }
    }
  }

  /** Remove all MapLibre native layers/sources/images/listeners added for globe mode. */
  private _removeGlobeNativeLayers(): void {
    if (!this.maplibreMap) return;
    for (const [lyrId, event, handler] of this._globeNativeListeners) {
      try { this.maplibreMap.off(event as any, lyrId, handler as any); } catch { /* */ }
    }
    for (const id of this._globeNativeLayers) {
      try { this.maplibreMap.removeLayer(id); } catch { /* */ }
    }
    for (const id of this._globeNativeSources) {
      try { this.maplibreMap.removeSource(id); } catch { /* */ }
    }
    for (const id of this._globeNativeImages) {
      try { this.maplibreMap.removeImage(id); } catch { /* */ }
    }
    this._globeNativeLayers = [];
    this._globeNativeSources = [];
    this._globeNativeImages = [];
    this._globeNativeListeners = [];
  }

  public destroy(): void {
    this._removeGlobeNativeLayers();
    window.removeEventListener('theme-changed', this.handleThemeChange);
    window.removeEventListener('map-theme-changed', this.handleMapThemeChange);
    this.debouncedRebuildLayers.cancel();
    this.debouncedFetchBases.cancel();
    this.debouncedFetchAircraft.cancel();
    this.rafUpdateLayers.cancel();

    if (this.moveTimeoutId) {
      clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = null;
    }

    if (this.styleLoadTimeoutId) {
      clearTimeout(this.styleLoadTimeoutId);
      this.styleLoadTimeoutId = null;
    }
    this.stopPulseAnimation();
    this.stopDayNightTimer();
    if (this.aircraftFetchTimer) {
      clearInterval(this.aircraftFetchTimer);
      this.aircraftFetchTimer = null;
    }


    this.layerCache.clear();

    this.deckOverlay?.finalize();
    this.deckOverlay = null;
    this.maplibreMap?.remove();
    this.maplibreMap = null;

    this.container.innerHTML = '';
  }
}
