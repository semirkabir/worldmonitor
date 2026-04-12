// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface TradeRestriction { id: string; reportingCountry: string; affectedCountry: string; productSector: string; measureType: string; description: string; status: string; notifiedAt: string; sourceUrl: string; }
export interface TariffDataPoint { reportingCountry: string; partnerCountry: string; productSector: string; year: number; tariffRate: number; boundRate: number; indicatorCode: string; }
export interface TradeFlowRecord { reportingCountry: string; partnerCountry: string; year: number; exportValueUsd: number; importValueUsd: number; yoyExportChange: number; yoyImportChange: number; productSector: string; }
export interface TradeBarrier { id: string; notifyingCountry: string; title: string; measureType: string; productDescription: string; objective: string; status: string; dateDistributed: string; sourceUrl: string; }

export interface GetTradeRestrictionsResponse { restrictions: TradeRestriction[]; fetchedAt?: string; upstreamUnavailable?: boolean; }
export interface GetTariffTrendsResponse { data?: TariffDataPoint[]; datapoints?: TariffDataPoint[]; fetchedAt?: string; upstreamUnavailable?: boolean; }
export interface GetTradeFlowsResponse { flows: TradeFlowRecord[]; fetchedAt?: string; upstreamUnavailable?: boolean; }
export interface GetTradeBarriersResponse { barriers: TradeBarrier[]; fetchedAt?: string; upstreamUnavailable?: boolean; }

type CallOptions = { signal?: AbortSignal; headers?: Record<string, string> };

export class TradeServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('trade', baseURL, options); }
  declare getTradeRestrictions: (req?: { countries?: string[]; limit?: number }, opts?: CallOptions) => Promise<GetTradeRestrictionsResponse>;
  declare getTariffTrends: (req?: { reportingCountry?: string; partnerCountry?: string; productSector?: string; years?: number }, opts?: CallOptions) => Promise<GetTariffTrendsResponse>;
  declare getTradeFlows: (req?: { reportingCountry?: string; partnerCountry?: string; years?: number }, opts?: CallOptions) => Promise<GetTradeFlowsResponse>;
  declare getTradeBarriers: (req?: { countries?: string[]; measureType?: string; limit?: number }, opts?: CallOptions) => Promise<GetTradeBarriersResponse>;
}
