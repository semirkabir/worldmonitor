import type { CountryBriefSignals } from '@/app/app-context';
import type { CountryScore } from '@/services/country-instability';
import type { PredictionMarket } from '@/services/prediction';
import type { NewsItem } from '@/types';

/**
 * Shared availability metadata for every overview card.
 * When `available` is false, `reason` explains why (e.g. "No direct coverage",
 * "Source not configured", "Insufficient signal data"). `source` names the data
 * provider and `updatedAt` gives the freshness timestamp.
 */
export interface CardAvailability {
  available: boolean;
  reason?: string;
  source?: string;
  updatedAt?: Date;
}

export interface CountryIntelData {
  brief: string;
  country: string;
  code: string;
  cached?: boolean;
  generatedAt?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
  fallback?: boolean;
}

export interface StockIndexData {
  available: boolean;
  code: string;
  symbol: string;
  indexName: string;
  price: string;
  weekChangePercent: string;
  currency: string;
  cached?: boolean;
}

type ThreatLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
type TrendDirection = 'up' | 'down' | 'flat';

export interface CountryDeepDiveSignalItem {
  type: 'MILITARY' | 'PROTEST' | 'CYBER' | 'DISASTER' | 'OUTAGE' | 'OTHER';
  severity: ThreatLevel;
  description: string;
  timestamp: Date;
}

export interface CountryDeepDiveSignalDetails {
  critical: number;
  high: number;
  medium: number;
  low: number;
  recentHigh: CountryDeepDiveSignalItem[];
}

export interface CountryDeepDiveBaseSummary {
  id: string;
  name: string;
  distanceKm: number;
  country?: string;
}

export interface CountryDeepDiveMilitarySummary {
  ownFlights: number;
  foreignFlights: number;
  nearbyVessels: number;
  nearestBases: CountryDeepDiveBaseSummary[];
  foreignPresence: boolean;
}

export interface CountryDeepDiveEconomicIndicator {
  label: string;
  value: string;
  trend: TrendDirection;
  source?: string;
}

export interface MacroEconomicCardData {
  key: string;
  label: string;
  value: string;
  year: string;
  trend: 'up' | 'down' | 'flat';
  available: boolean;
  /** Source-specific unavailability reason shown when `available` is false. */
  reason?: string;
}

export interface CountryBriefPanel {
  show(country: string, code: string, score: CountryScore | null, signals: CountryBriefSignals): void;
  hide(): void;
  showLoading(): void;
  getCode(): string | null;
  getName(): string | null;
  isVisible(): boolean;
  getTimelineMount(): HTMLElement | null;
  readonly signal: AbortSignal;
  onClose(cb: () => void): void;
  setShareStoryHandler(handler: (code: string, name: string) => void): void;
  updateBrief(data: CountryIntelData): void;
  /** Pass `availability` to surface a reason when no direct country coverage exists. */
  updateNews(headlines: NewsItem[], availability?: CardAvailability): void;
  /** Pass `availability` to surface a reason when no direct market coverage exists. */
  updateMarkets(markets: PredictionMarket[], availability?: CardAvailability): void;
  updateStock(data: StockIndexData): void;
  updateInfrastructure(code: string): void;
  showGeoError?(onRetry: () => void): void;
  /** Pass `availability` to surface a specific reason when the CII score is null. */
  updateScore?(score: CountryScore | null, signals: CountryBriefSignals, ciiAvailability?: CardAvailability): void;
  updateSignalDetails?(details: CountryDeepDiveSignalDetails): void;
  updateMilitaryActivity?(summary: CountryDeepDiveMilitarySummary): void;
  updateEconomicIndicators?(indicators: CountryDeepDiveEconomicIndicator[]): void;
  updateMacroCards?(cards: MacroEconomicCardData[]): void;
  maximize?(): void;
  minimize?(): void;
  getIsMaximized?(): boolean;
  onStateChange?(cb: (state: { visible: boolean; maximized: boolean }) => void): void;
}
