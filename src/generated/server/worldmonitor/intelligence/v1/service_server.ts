// @ts-nocheck
// Manually maintained fallback while buf-generated server files are unavailable locally.

export type SeverityLevel = 'SEVERITY_LEVEL_UNSPECIFIED' | 'SEVERITY_LEVEL_LOW' | 'SEVERITY_LEVEL_MEDIUM' | 'SEVERITY_LEVEL_HIGH';
export type TrendDirection = 'TREND_DIRECTION_UNSPECIFIED' | 'TREND_DIRECTION_STABLE' | 'TREND_DIRECTION_RISING' | 'TREND_DIRECTION_FALLING';
export type DataFreshness = 'DATA_FRESHNESS_UNSPECIFIED' | 'DATA_FRESHNESS_FRESH' | 'DATA_FRESHNESS_STALE';

export interface CiiScore { countryCode: string; countryName: string; score: number; severity: SeverityLevel; changePercent: number; drivers: string[]; }
export interface StrategicRisk { region: string; score: number; severity: SeverityLevel; changePercent: number; topDrivers: string[]; }
export interface Classification { category: string; subcategory: string; severity: SeverityLevel; confidence: number; analysis: string; entities: string[]; }
export interface PizzintLocation {
  placeId: string; name: string; address: string; currentPopularity: number; percentageOfUsual: number; isSpike: boolean; spikeMagnitude: number;
  dataSource: string; recordedAt: string; dataFreshness: DataFreshness; isClosedNow: boolean; lat: number; lng: number;
}
export interface PizzintStatus {
  defconLevel: number; defconLabel: string; aggregateActivity: number; activeSpikes: number; locationsMonitored: number; locationsOpen: number;
  updatedAt: number; dataFreshness: DataFreshness; locations: PizzintLocation[];
}
export interface GdeltTensionPair { id: string; countries: string[]; label: string; score: number; trend: TrendDirection; changePercent: number; region: string; }
export interface GdeltArticle { title: string; url: string; source: string; date: string; image: string; language: string; tone: number; }

export interface GetRiskScoresRequest {}
export interface GetRiskScoresResponse { ciiScores: CiiScore[]; strategicRisks: StrategicRisk[]; generatedAt: number; }
export interface GetPizzintStatusRequest { includeGdelt: boolean; }
export interface GetPizzintStatusResponse { pizzint?: PizzintStatus; tensionPairs: GdeltTensionPair[]; }
export interface ClassifyEventRequest { title: string; description: string; source: string; country: string; }
export interface ClassifyEventResponse { classification?: Classification; }
export interface GetCountryIntelBriefRequest { countryCode: string; }
export interface GetCountryIntelBriefResponse { countryCode: string; countryName: string; brief: string; model: string; generatedAt: number; }
export interface SearchGdeltDocumentsRequest { query: string; toneFilter: string; maxRecords: number; timespan: string; sort: string; }
export interface SearchGdeltDocumentsResponse { articles: GdeltArticle[]; query: string; error: string; }
export interface DeductSituationRequest { query: string; geoContext: string; }
export interface DeductSituationResponse { analysis: string; model: string; provider: string; }

export interface ServerContext {
  request: Request;
  pathParams: Record<string, string>;
  headers: Record<string, string>;
}
export interface RouteDescriptor { method: string; path: string; handler: (req: Request) => Promise<Response>; }
export interface ServerOptions { onError?: (error: unknown, req: Request) => Response | Promise<Response>; }
export interface IntelligenceServiceHandler {
  getRiskScores(ctx: ServerContext, req: GetRiskScoresRequest): Promise<GetRiskScoresResponse>;
  getPizzintStatus(ctx: ServerContext, req: GetPizzintStatusRequest): Promise<GetPizzintStatusResponse>;
  classifyEvent(ctx: ServerContext, req: ClassifyEventRequest): Promise<ClassifyEventResponse>;
  getCountryIntelBrief(ctx: ServerContext, req: GetCountryIntelBriefRequest): Promise<GetCountryIntelBriefResponse>;
  searchGdeltDocuments(ctx: ServerContext, req: SearchGdeltDocumentsRequest): Promise<SearchGdeltDocumentsResponse>;
  deductSituation(ctx: ServerContext, req: DeductSituationRequest): Promise<DeductSituationResponse>;
}

function jsonResponse(result: unknown): Response {
  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function errorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  return new Response(JSON.stringify({ message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
function makeContext(req: Request): ServerContext {
  return { request: req, pathParams: {}, headers: Object.fromEntries(req.headers.entries()) };
}

export function createIntelligenceServiceRoutes(handler: IntelligenceServiceHandler, options?: ServerOptions): RouteDescriptor[] {
  const route = (path: string, fn: (ctx: ServerContext, params: URLSearchParams) => Promise<unknown>): RouteDescriptor => ({
    method: 'GET',
    path,
    handler: async (req: Request) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        return jsonResponse(await fn(makeContext(req), url.searchParams));
      } catch (err) {
        if (options?.onError) return options.onError(err, req);
        return errorResponse(err);
      }
    },
  });

  return [
    route('/api/intelligence/v1/get-risk-scores', (ctx) => handler.getRiskScores(ctx, {})),
    route('/api/intelligence/v1/get-pizzint-status', (ctx, params) => handler.getPizzintStatus(ctx, { includeGdelt: params.get('include_gdelt') === 'true' || params.get('includeGdelt') === 'true' })),
    route('/api/intelligence/v1/classify-event', (ctx, params) => handler.classifyEvent(ctx, { title: params.get('title') ?? '', description: params.get('description') ?? '', source: params.get('source') ?? '', country: params.get('country') ?? '' })),
    route('/api/intelligence/v1/get-country-intel-brief', (ctx, params) => handler.getCountryIntelBrief(ctx, { countryCode: params.get('country_code') ?? params.get('countryCode') ?? '' })),
    route('/api/intelligence/v1/search-gdelt-documents', (ctx, params) => handler.searchGdeltDocuments(ctx, { query: params.get('query') ?? '', toneFilter: params.get('tone_filter') ?? params.get('toneFilter') ?? '', maxRecords: Number(params.get('max_records') ?? params.get('maxRecords') ?? '0'), timespan: params.get('timespan') ?? '', sort: params.get('sort') ?? '' })),
    route('/api/intelligence/v1/deduct-situation', (ctx, params) => handler.deductSituation(ctx, { query: params.get('query') ?? '', geoContext: params.get('geo_context') ?? params.get('geoContext') ?? '' })),
  ];
}
