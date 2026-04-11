// @ts-nocheck
// Manually maintained fallback while buf-generated server files are unavailable locally.

export interface FredObservation { date: string; value: number; }
export interface FredSeries { seriesId: string; title: string; units: string; frequency: string; observations: FredObservation[]; }
export interface WorldBankCountryData { countryCode: string; countryName: string; indicatorCode: string; indicatorName: string; year: number; value: number; }
export interface EnergyPrice { commodity: string; name: string; price: number; unit: string; change: number; priceAt: number; }
export interface MacroSignalState { status: string; value?: number; sparkline?: number[]; btcReturn5?: number; qqqReturn5?: number; qqqRoc20?: number; xlpRoc20?: number; btcPrice?: number; sma50?: number; sma200?: number; vwap30d?: number; mayerMultiple?: number; change30d?: number; history?: FearGreedHistoryEntry[]; }
export interface FearGreedHistoryEntry { value: number; date: string; }
export interface EnergyCapacityYear { year: number; mw: number; }
export interface EnergyCapacitySeries { source: string; name: string; years: EnergyCapacityYear[]; }
export interface BisPolicyRate { countryCode: string; countryName: string; rate: number; previousRate: number; date: string; centralBank: string; }
export interface BisExchangeRate { countryCode: string; countryName: string; realEer: number; nominalEer: number; realChange: number; date: string; }
export interface BisCreditToGdp { countryCode: string; countryName: string; creditGdpRatio: number; previousRatio: number; date: string; }

export interface GetFredSeriesRequest { seriesId: string; limit: number; }
export interface GetFredSeriesResponse { series?: FredSeries; }
export interface GetFredSeriesBatchRequest { seriesIds: string[]; limit: number; }
export interface GetFredSeriesBatchResponse { results: Record<string, FredSeries>; fetched: number; requested: number; }
export interface ListWorldBankIndicatorsRequest { indicatorCode: string; countryCode: string; year: number; pageSize: number; cursor: string; }
export interface ListWorldBankIndicatorsResponse { data: WorldBankCountryData[]; pagination?: unknown; }
export interface GetEnergyPricesRequest { commodities: string[]; }
export interface GetEnergyPricesResponse { prices: EnergyPrice[]; }
export interface GetMacroSignalsRequest {}
export interface GetMacroSignalsResponse {
  timestamp: string;
  verdict: string;
  bullishCount: number;
  totalCount: number;
  signals?: {
    liquidity?: MacroSignalState;
    flowStructure?: MacroSignalState;
    macroRegime?: MacroSignalState;
    technicalTrend?: MacroSignalState;
    hashRate?: MacroSignalState;
    priceMomentum?: MacroSignalState;
    fearGreed?: MacroSignalState;
  };
  meta?: { qqqSparkline?: number[] };
  unavailable?: boolean;
}
export interface GetEnergyCapacityRequest { energySources: string[]; years: number; }
export interface GetEnergyCapacityResponse { series: EnergyCapacitySeries[]; }
export interface GetBisPolicyRatesRequest {}
export interface GetBisPolicyRatesResponse { rates: BisPolicyRate[]; }
export interface GetBisExchangeRatesRequest {}
export interface GetBisExchangeRatesResponse { rates: BisExchangeRate[]; }
export interface GetBisCreditRequest {}
export interface GetBisCreditResponse { entries: BisCreditToGdp[]; }

export interface ServerContext {
  request: Request;
  pathParams: Record<string, string>;
  headers: Record<string, string>;
}

export interface RouteDescriptor { method: string; path: string; handler: (req: Request) => Promise<Response>; }
export interface ServerOptions { onError?: (error: unknown, req: Request) => Response | Promise<Response>; }
export interface EconomicServiceHandler {
  getFredSeries(ctx: ServerContext, req: GetFredSeriesRequest): Promise<GetFredSeriesResponse>;
  getFredSeriesBatch(ctx: ServerContext, req: GetFredSeriesBatchRequest): Promise<GetFredSeriesBatchResponse>;
  listWorldBankIndicators(ctx: ServerContext, req: ListWorldBankIndicatorsRequest): Promise<ListWorldBankIndicatorsResponse>;
  getEnergyPrices(ctx: ServerContext, req: GetEnergyPricesRequest): Promise<GetEnergyPricesResponse>;
  getMacroSignals(ctx: ServerContext, req: GetMacroSignalsRequest): Promise<GetMacroSignalsResponse>;
  getEnergyCapacity(ctx: ServerContext, req: GetEnergyCapacityRequest): Promise<GetEnergyCapacityResponse>;
  getBisPolicyRates(ctx: ServerContext, req: GetBisPolicyRatesRequest): Promise<GetBisPolicyRatesResponse>;
  getBisExchangeRates(ctx: ServerContext, req: GetBisExchangeRatesRequest): Promise<GetBisExchangeRatesResponse>;
  getBisCredit(ctx: ServerContext, req: GetBisCreditRequest): Promise<GetBisCreditResponse>;
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
function parseList(value: string | null): string[] {
  return value ? value.split(',').map((part) => part.trim()).filter(Boolean) : [];
}

export function createEconomicServiceRoutes(handler: EconomicServiceHandler, options?: ServerOptions): RouteDescriptor[] {
  const route = (path: string, fn: (ctx: ServerContext, params: URLSearchParams, req: Request) => Promise<unknown>): RouteDescriptor => ({
    method: 'GET',
    path,
    handler: async (req: Request) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        return jsonResponse(await fn(makeContext(req), url.searchParams, req));
      } catch (err) {
        if (options?.onError) return options.onError(err, req);
        return errorResponse(err);
      }
    },
  });

  return [
    route('/api/economic/v1/get-fred-series', (ctx, params) => handler.getFredSeries(ctx, { seriesId: params.get('series_id') ?? params.get('seriesId') ?? '', limit: Number(params.get('limit') ?? '0') })),
    route('/api/economic/v1/get-fred-series-batch', (ctx, params) => handler.getFredSeriesBatch(ctx, { seriesIds: parseList(params.get('series_ids') ?? params.get('seriesIds')), limit: Number(params.get('limit') ?? '0') })),
    route('/api/economic/v1/list-world-bank-indicators', (ctx, params) => handler.listWorldBankIndicators(ctx, { indicatorCode: params.get('indicator_code') ?? params.get('indicatorCode') ?? '', countryCode: params.get('country_code') ?? params.get('countryCode') ?? '', year: Number(params.get('year') ?? '0'), pageSize: Number(params.get('page_size') ?? params.get('pageSize') ?? '0'), cursor: params.get('cursor') ?? '' })),
    route('/api/economic/v1/get-energy-prices', (ctx, params) => handler.getEnergyPrices(ctx, { commodities: parseList(params.get('commodities')) })),
    route('/api/economic/v1/get-macro-signals', (ctx) => handler.getMacroSignals(ctx, {})),
    route('/api/economic/v1/get-energy-capacity', (ctx, params) => handler.getEnergyCapacity(ctx, { energySources: parseList(params.get('energy_sources') ?? params.get('energySources')), years: Number(params.get('years') ?? '0') })),
    route('/api/economic/v1/get-bis-policy-rates', (ctx) => handler.getBisPolicyRates(ctx, {})),
    route('/api/economic/v1/get-bis-exchange-rates', (ctx) => handler.getBisExchangeRates(ctx, {})),
    route('/api/economic/v1/get-bis-credit', (ctx) => handler.getBisCredit(ctx, {})),
  ];
}
