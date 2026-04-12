// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface MarketQuote { symbol: string; name: string; display: string; price: number; change: number; sparkline: number[]; }
export interface CryptoQuote { name: string; symbol: string; price: number; change: number; sparkline: number[]; }
export interface CommodityQuote { symbol: string; name: string; display: string; price: number; change: number; sparkline: number[]; }
export interface SectorPerformance { symbol: string; name: string; change: number; }
export interface Stablecoin { id: string; symbol: string; name: string; price: number; deviation: number; pegStatus: string; marketCap: number; volume24h: number; change24h: number; change7d: number; image: string; }
export interface EtfFlow { ticker: string; issuer: string; price: number; priceChange: number; volume: number; avgVolume: number; volumeRatio: number; direction: string; estFlow: number; }
export interface GulfQuote { symbol: string; name: string; country: string; flag: string; type: 'index' | 'currency' | 'oil'; price: number; change: number; sparkline: number[]; }
/** SecFiling - supports both proto field names and API camelCase variants */
export interface SecFiling { accessionNumber: string; filingDate?: string; filedAt?: string; form?: string; filingType?: string; title?: string; description: string; url: string; }

export interface ListMarketQuotesResponse { quotes: MarketQuote[]; finnhubSkipped?: boolean; skipReason?: string; rateLimited?: boolean; }
export interface ListCryptoQuotesResponse { quotes: CryptoQuote[]; }
export interface ListCommodityQuotesResponse { quotes: CommodityQuote[]; }
export interface GetSectorSummaryResponse { sectors: SectorPerformance[]; }
export interface ListStablecoinMarketsResponse { timestamp: string; summary: { totalMarketCap: number; totalVolume24h: number; coinCount: number; depeggedCount: number; healthStatus: string; }; stablecoins: Stablecoin[]; }
export interface ListEtfFlowsResponse { timestamp: string; etfs: EtfFlow[]; rateLimited?: boolean; summary?: { totalEstimatedFlow?: number; inflowCount: number; outflowCount: number; neutralCount?: number; dominantDirection?: string; netDirection: string; totalEstFlow: number; totalVolume: number; etfCount: number; }; }
export interface GetCountryStockIndexResponse { available: boolean; code: string; symbol: string; indexName: string; price: number; weekChangePercent: number; currency: string; fetchedAt: string; }
export interface ListGulfQuotesResponse { quotes: GulfQuote[]; rateLimited?: boolean; }
export interface ListSecFilingsResponse { filings: SecFiling[]; companyName?: string; }

type CallOptions = { signal?: AbortSignal; headers?: Record<string, string> };

export class MarketServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('market', baseURL, options); }
  declare listMarketQuotes: (req?: { symbols?: string[] | string }, opts?: CallOptions) => Promise<ListMarketQuotesResponse>;
  declare listCryptoQuotes: (req?: { ids?: string[] | string }, opts?: CallOptions) => Promise<ListCryptoQuotesResponse>;
  declare listCommodityQuotes: (req?: { symbols?: string[] | string }, opts?: CallOptions) => Promise<ListCommodityQuotesResponse>;
  declare getSectorSummary: (req?: { period?: string }, opts?: CallOptions) => Promise<GetSectorSummaryResponse>;
  declare listStablecoinMarkets: (req?: { coins?: string[] | string }, opts?: CallOptions) => Promise<ListStablecoinMarketsResponse>;
  declare listEtfFlows: (req?: Record<string, unknown>, opts?: CallOptions) => Promise<ListEtfFlowsResponse>;
  declare getCountryStockIndex: (req?: { countryCode?: string }, opts?: CallOptions) => Promise<GetCountryStockIndexResponse>;
  declare listGulfQuotes: (req?: Record<string, unknown>, opts?: CallOptions) => Promise<ListGulfQuotesResponse>;
  declare listSecFilings: (req?: { ticker?: string; filingTypes?: string[]; limit?: number }, opts?: CallOptions) => Promise<ListSecFilingsResponse>;
}
