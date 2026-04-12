// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export type SeverityLevel = 'SEVERITY_LEVEL_UNSPECIFIED' | 'SEVERITY_LEVEL_LOW' | 'SEVERITY_LEVEL_MEDIUM' | 'SEVERITY_LEVEL_HIGH';
export type TrendDirection = 'TREND_DIRECTION_UNSPECIFIED' | 'TREND_DIRECTION_STABLE' | 'TREND_DIRECTION_RISING' | 'TREND_DIRECTION_FALLING';
export type DataFreshness = 'DATA_FRESHNESS_UNSPECIFIED' | 'DATA_FRESHNESS_FRESH' | 'DATA_FRESHNESS_STALE';

export interface CiiComponents { ciiContribution?: number; geoConvergence?: number; militaryActivity?: number; newsActivity?: number; }
/** CiiScore - includes both proto field names and API-computed fields used by cached-risk-scores */
export interface CiiScore { countryCode: string; countryName: string; score: number; severity: SeverityLevel; changePercent: number; drivers: string[]; region: string; combinedScore: number; trend: string; dynamicScore: number; components?: CiiComponents; computedAt?: number; }
/** StrategicRisk - includes both proto field names and API-computed fields */
export interface StrategicRisk { region: string; score: number; severity: SeverityLevel; changePercent: number; topDrivers: string[]; level?: string; trend?: string; factors?: string[]; }
export interface PizzintLocation { placeId: string; name: string; address: string; currentPopularity: number; percentageOfUsual: number; isSpike: boolean; spikeMagnitude: number; dataSource: string; recordedAt: string; dataFreshness: DataFreshness; isClosedNow: boolean; lat: number; lng: number; }
export interface PizzintStatus { defconLevel: number; defconLabel: string; aggregateActivity: number; activeSpikes: number; locationsMonitored: number; locationsOpen: number; updatedAt: number; dataFreshness: DataFreshness; locations: PizzintLocation[]; }
export interface GdeltTensionPair { id: string; countries: string[]; label: string; score: number; trend: TrendDirection; changePercent: number; region: string; }
export interface GdeltArticle { title: string; url: string; source: string; date: string; image: string; language: string; tone: number; }
export interface EventClassification { category?: string; subcategory?: string; severity?: SeverityLevel; confidence?: number; analysis?: string; entities?: string[]; }

export interface GetRiskScoresResponse { ciiScores: CiiScore[]; strategicRisks: StrategicRisk[]; generatedAt: number; }
export interface GetPizzintStatusResponse { pizzint?: PizzintStatus; tensionPairs: GdeltTensionPair[]; }
export interface SearchGdeltDocumentsResponse { articles: GdeltArticle[]; query: string; error: string; }
export interface DeductSituationResponse { analysis: string; model: string; provider: string; }
export interface GetCountryIntelBriefResponse { countryCode: string; countryName: string; brief: string; model: string; generatedAt: number; }
export interface ClassifyEventResponse { classification?: EventClassification; }

type CallOptions = { signal?: AbortSignal; headers?: Record<string, string> };

export class IntelligenceServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('intelligence', baseURL, options); }
  declare getRiskScores: (req?: Record<string, unknown>, opts?: CallOptions) => Promise<GetRiskScoresResponse>;
  declare getPizzintStatus: (req?: { includeGdelt?: boolean }, opts?: CallOptions) => Promise<GetPizzintStatusResponse>;
  declare classifyEvent: (req?: { title?: string; description?: string; source?: string; country?: string }, opts?: CallOptions) => Promise<ClassifyEventResponse>;
  declare getCountryIntelBrief: (req?: { countryCode?: string }, opts?: CallOptions) => Promise<GetCountryIntelBriefResponse>;
  declare searchGdeltDocuments: (req?: { query?: string; maxRecords?: number; timespan?: string; toneFilter?: string; sort?: string }, opts?: CallOptions) => Promise<SearchGdeltDocumentsResponse>;
  declare deductSituation: (req?: { query?: string; geoContext?: string }, opts?: CallOptions) => Promise<DeductSituationResponse>;
}
