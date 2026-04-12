// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface ShippingRatePoint { date: string; value: number; }
export interface ShippingIndex { indexId: string; name: string; currentValue: number; previousValue: number; changePct: number; unit: string; history: ShippingRatePoint[]; spikeAlert: boolean; }
export interface ChokepointInfo { id: string; name: string; lat: number; lon: number; disruptionScore: number; status: string; activeWarnings: number; congestionLevel: string; affectedRoutes: string[]; description: string; aisDisruptions: number; }
export interface MineralProducer { country: string; countryCode: string; productionTonnes: number; sharePct: number; }
export interface CriticalMineral { mineral: string; topProducers: MineralProducer[]; hhi: number; riskRating: string; globalProduction: number; unit: string; }

export interface GetShippingRatesResponse { indices: ShippingIndex[]; fetchedAt: string; upstreamUnavailable: boolean; }
export interface GetChokepointStatusResponse { chokepoints: ChokepointInfo[]; fetchedAt: string; upstreamUnavailable: boolean; }
export interface GetCriticalMineralsResponse { minerals: CriticalMineral[]; fetchedAt: string; upstreamUnavailable: boolean; }

export class SupplyChainServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('supply-chain', baseURL, options); }
  declare getShippingRates: (req?: Record<string, unknown>) => Promise<GetShippingRatesResponse>;
  declare getChokepointStatus: (req?: Record<string, unknown>) => Promise<GetChokepointStatusResponse>;
  declare getCriticalMinerals: (req?: Record<string, unknown>) => Promise<GetCriticalMineralsResponse>;
}
