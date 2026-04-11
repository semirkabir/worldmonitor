// @ts-nocheck
// Manually maintained fallback while buf-generated server files are unavailable locally.

export interface MarketQuote {
  symbol: string;
  name: string;
  display: string;
  price: number;
  change: number;
  sparkline: number[];
}

export interface CryptoQuote {
  name: string;
  symbol: string;
  price: number;
  change: number;
  sparkline: number[];
}

export interface CommodityQuote {
  symbol: string;
  name: string;
  display: string;
  price: number;
  change: number;
  sparkline: number[];
}

export interface SectorPerformance {
  symbol: string;
  name: string;
  change: number;
}

export interface Stablecoin {
  id: string;
  symbol: string;
  name: string;
  price: number;
  deviation: number;
  pegStatus: string;
  marketCap: number;
  volume24h: number;
  change24h: number;
  change7d: number;
  image: string;
}

export interface EtfFlow {
  ticker: string;
  issuer: string;
  price: number;
  priceChange: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  direction: string;
  estFlow: number;
}

export interface GulfQuote {
  symbol: string;
  name: string;
  country: string;
  flag: string;
  type: 'index' | 'currency' | 'oil';
  price: number;
  change: number;
  sparkline: number[];
}

export interface SecFiling {
  accessionNumber: string;
  filingDate: string;
  form: string;
  description: string;
  url: string;
}

export interface ListMarketQuotesRequest { symbols: string[] | string; }
export interface ListMarketQuotesResponse { quotes: MarketQuote[]; finnhubSkipped?: boolean; skipReason?: string; rateLimited?: boolean; }
export interface ListCryptoQuotesRequest { ids: string[] | string; }
export interface ListCryptoQuotesResponse { quotes: CryptoQuote[]; }
export interface ListCommodityQuotesRequest { symbols: string[] | string; }
export interface ListCommodityQuotesResponse { quotes: CommodityQuote[]; }
export interface GetSectorSummaryRequest {}
export interface GetSectorSummaryResponse { sectors: SectorPerformance[]; }
export interface ListStablecoinMarketsRequest { coins: string[] | string; }
export interface ListStablecoinMarketsResponse {
  timestamp: string;
  summary: { totalMarketCap: number; totalVolume24h: number; coinCount: number; depeggedCount: number; healthStatus: string; };
  stablecoins: Stablecoin[];
}
export interface ListEtfFlowsRequest {}
export interface ListEtfFlowsResponse { timestamp: string; etfs: EtfFlow[]; rateLimited?: boolean; summary?: { totalEstimatedFlow: number; inflowCount: number; outflowCount: number; neutralCount: number; dominantDirection: string; }; }
export interface GetCountryStockIndexRequest { countryCode: string; }
export interface GetCountryStockIndexResponse { available: boolean; code: string; symbol: string; indexName: string; price: number; weekChangePercent: number; currency: string; fetchedAt: string; }
export interface ListGulfQuotesRequest {}
export interface ListGulfQuotesResponse { quotes: GulfQuote[]; rateLimited?: boolean; }
export interface ListSecFilingsRequest { ticker: string; limit: number; filingTypes: string[] | string; }
export interface ListSecFilingsResponse { filings: SecFiling[]; ticker: string; companyName: string; }

export interface ServerContext {
  request: Request;
  pathParams: Record<string, string>;
  headers: Record<string, string>;
}

export interface RouteDescriptor {
  method: string;
  path: string;
  handler: (req: Request) => Promise<Response>;
}

export interface ServerOptions {
  onError?: (error: unknown, req: Request) => Response | Promise<Response>;
}

export interface MarketServiceHandler {
  listMarketQuotes(ctx: ServerContext, req: ListMarketQuotesRequest): Promise<ListMarketQuotesResponse>;
  listCryptoQuotes(ctx: ServerContext, req: ListCryptoQuotesRequest): Promise<ListCryptoQuotesResponse>;
  listCommodityQuotes(ctx: ServerContext, req: ListCommodityQuotesRequest): Promise<ListCommodityQuotesResponse>;
  getSectorSummary(ctx: ServerContext, req: GetSectorSummaryRequest): Promise<GetSectorSummaryResponse>;
  listStablecoinMarkets(ctx: ServerContext, req: ListStablecoinMarketsRequest): Promise<ListStablecoinMarketsResponse>;
  listEtfFlows(ctx: ServerContext, req: ListEtfFlowsRequest): Promise<ListEtfFlowsResponse>;
  getCountryStockIndex(ctx: ServerContext, req: GetCountryStockIndexRequest): Promise<GetCountryStockIndexResponse>;
  listGulfQuotes(ctx: ServerContext, req: ListGulfQuotesRequest): Promise<ListGulfQuotesResponse>;
  listSecFilings(ctx: ServerContext, req: ListSecFilingsRequest): Promise<ListSecFilingsResponse>;
}

function makeContext(req: Request): ServerContext {
  return { request: req, pathParams: {}, headers: Object.fromEntries(req.headers.entries()) };
}

function jsonResponse(result: unknown): Response {
  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function errorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  return new Response(JSON.stringify({ message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}

function parseArrayParams(params: URLSearchParams, key: string): string[] | string {
  const all = params.getAll(key);
  if (all.length > 1) return all;
  return params.get(key) ?? '';
}

export function createMarketServiceRoutes(handler: MarketServiceHandler, options?: ServerOptions): RouteDescriptor[] {
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
    route('/api/market/v1/list-market-quotes', (ctx, params) => handler.listMarketQuotes(ctx, { symbols: parseArrayParams(params, 'symbols') })),
    route('/api/market/v1/list-crypto-quotes', (ctx, params) => handler.listCryptoQuotes(ctx, { ids: parseArrayParams(params, 'ids') })),
    route('/api/market/v1/list-commodity-quotes', (ctx, params) => handler.listCommodityQuotes(ctx, { symbols: parseArrayParams(params, 'symbols') })),
    route('/api/market/v1/get-sector-summary', (ctx) => handler.getSectorSummary(ctx, {})),
    route('/api/market/v1/list-stablecoin-markets', (ctx, params) => handler.listStablecoinMarkets(ctx, { coins: parseArrayParams(params, 'coins') })),
    route('/api/market/v1/list-etf-flows', (ctx) => handler.listEtfFlows(ctx, {})),
    route('/api/market/v1/get-country-stock-index', (ctx, params) => handler.getCountryStockIndex(ctx, { countryCode: params.get('country_code') ?? params.get('countryCode') ?? '' })),
    route('/api/market/v1/list-gulf-quotes', (ctx) => handler.listGulfQuotes(ctx, {})),
    route('/api/market/v1/list-sec-filings', (ctx, params) => handler.listSecFilings(ctx, { ticker: params.get('ticker') ?? '', limit: Number(params.get('limit') ?? '20'), filingTypes: parseArrayParams(params, 'filing_types') })),
  ];
}
