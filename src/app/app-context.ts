import type { NewsItem, Monitor, PanelConfig, MapLayers, InternetOutage, SocialUnrestEvent, MilitaryFlight, MilitaryFlightCluster, MilitaryVessel, MilitaryVesselCluster, CyberThreat, USNIFleetReport } from '@/types';
import type { AirportDelayAlert, PositionSample } from '@/services/aviation';
import type { IranEvent } from '@/generated/client/worldmonitor/conflict/v1/service_client';
import type { SecurityAdvisory } from '@/services/security-advisories';
import type { MapContainer, Panel, NewsPanel, SignalModal, StatusPanel, SearchModal, IntelligenceGapBadge } from '@/components';
import type { IntelligenceFindingPanel } from '@/components/IntelligenceFindingPanel';
import type { MarketData, ClusteredEvent } from '@/types';
import type { PredictionMarket } from '@/services/prediction';
import type { TimeRange } from '@/components';
import type { Earthquake } from '@/services/earthquakes';
import type { CountryBriefPanel } from '@/components/CountryBriefPanel';
import type { CountryTimeline } from '@/components/CountryTimeline';
import type { PlaybackControl } from '@/components';
import type { ExportPanel } from '@/utils';
import type { UnifiedSettings } from '@/components/UnifiedSettings';
import type { PizzIntIndicator } from '@/components';
import type { ParsedMapUrlState } from '@/utils';
import type { PredictionBriefPage } from '@/components/PredictionBriefPage';
import type { PositiveNewsFeedPanel } from '@/components/PositiveNewsFeedPanel';
import type { CountersPanel } from '@/components/CountersPanel';
import type { ProgressChartsPanel } from '@/components/ProgressChartsPanel';
import type { BreakthroughsTickerPanel } from '@/components/BreakthroughsTickerPanel';
import type { HeroSpotlightPanel } from '@/components/HeroSpotlightPanel';
import type { GoodThingsDigestPanel } from '@/components/GoodThingsDigestPanel';
import type { SpeciesComebackPanel } from '@/components/SpeciesComebackPanel';
import type { RenewableEnergyPanel } from '@/components/RenewableEnergyPanel';
import type { TvModeController } from '@/services/tv-mode';

export interface CountryBriefSignals {
  criticalNews: number;
  protests: number;
  militaryFlights: number;
  militaryVessels: number;
  outages: number;
  aisDisruptions: number;
  satelliteFires: number;
  temporalAnomalies: number;
  cyberThreats: number;
  earthquakes: number;
  displacementOutflow: number;
  climateStress: number;
  conflictEvents: number;
  activeStrikes: number;
  orefSirens: number;
  orefHistory24h: number;
  aviationDisruptions: number;
  travelAdvisories: number;
  travelAdvisoryMaxLevel: string | null;
  gpsJammingHexes: number;
  isTier1: boolean;
}

export interface IntelligenceCache {
  flightDelays?: AirportDelayAlert[];
  aircraftPositions?: PositionSample[];
  outages?: InternetOutage[];
  protests?: { events: SocialUnrestEvent[]; sources: { acled: number; gdelt: number } };
  military?: { flights: MilitaryFlight[]; flightClusters: MilitaryFlightCluster[]; vessels: MilitaryVessel[]; vesselClusters: MilitaryVesselCluster[] };
  earthquakes?: Earthquake[];
  usniFleet?: USNIFleetReport;
  iranEvents?: IranEvent[];
  orefAlerts?: { alertCount: number; historyCount24h: number };
  advisories?: SecurityAdvisory[];
}

export interface AppModule {
  init(): void | Promise<void>;
  destroy(): void;
}

export interface AppContext {
  map: MapContainer | null;
  readonly isMobile: boolean;
  readonly isDesktopApp: boolean;
  readonly container: HTMLElement;

  panels: Record<string, Panel>;
  newsPanels: Record<string, NewsPanel>;
  panelSettings: Record<string, PanelConfig>;

  mapLayers: MapLayers;

  allNews: NewsItem[];
  newsByCategory: Record<string, NewsItem[]>;
  latestMarkets: MarketData[];
  latestPredictions: PredictionMarket[];
  latestClusters: ClusteredEvent[];
  intelligenceCache: IntelligenceCache;
  cyberThreatsCache: CyberThreat[] | null;

  disabledSources: Set<string>;
  currentTimeRange: TimeRange;

  inFlight: Set<string>;
  seenGeoAlerts: Set<string>;
  monitors: Monitor[];

  signalModal: SignalModal | null;
  findingPanel: IntelligenceFindingPanel | null;
  statusPanel: StatusPanel | null;
  searchModal: SearchModal | null;
  findingsBadge: IntelligenceGapBadge | null;
  playbackControl: PlaybackControl | null;
  exportPanel: ExportPanel | null;
  unifiedSettings: UnifiedSettings | null;
  pizzintIndicator: PizzIntIndicator | null;
  notificationCenter: import('@/components/NotificationCenter').NotificationCenter | null;
  countryBriefPage: CountryBriefPanel | null;
  entityDetailPanel: import('@/components/EntityDetailPanel').EntityDetailPanel | null;
  predictionBriefPage: PredictionBriefPage | null;
  countryTimeline: CountryTimeline | null;

  // Happy variant state
  positivePanel: PositiveNewsFeedPanel | null;
  countersPanel: CountersPanel | null;
  progressPanel: ProgressChartsPanel | null;
  breakthroughsPanel: BreakthroughsTickerPanel | null;
  heroPanel: HeroSpotlightPanel | null;
  digestPanel: GoodThingsDigestPanel | null;
  speciesPanel: SpeciesComebackPanel | null;
  renewablePanel: RenewableEnergyPanel | null;
  tvMode: TvModeController | null;
  happyAllItems: NewsItem[];
  isDestroyed: boolean;
  isPlaybackMode: boolean;
  isIdle: boolean;
  initialLoadComplete: boolean;
  resolvedLocation: 'global' | 'america' | 'mena' | 'eu' | 'asia' | 'latam' | 'africa' | 'oceania';

  initialUrlState: ParsedMapUrlState | null;
  readonly PANEL_ORDER_KEY: string;
  readonly PANEL_SPANS_KEY: string;
}
