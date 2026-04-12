// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface FredObservation { date: string; value: number; }
export interface FredSeries { seriesId: string; title: string; units: string; frequency: string; observations: FredObservation[]; }
export interface WorldBankCountryData { countryCode: string; countryName: string; indicatorCode: string; indicatorName: string; year: number; value: number; }
export interface EnergyPrice { commodity: string; name: string; price: number; unit: string; change: number; priceAt: number; }
export interface FearGreedHistoryEntry { value: number; date: string; }
export interface MacroSignalState { status: string; value?: number; sparkline?: number[]; btcReturn5?: number; qqqReturn5?: number; qqqRoc20?: number; xlpRoc20?: number; btcPrice?: number; sma50?: number; sma200?: number; vwap30d?: number; mayerMultiple?: number; change30d?: number; history?: FearGreedHistoryEntry[]; }
export interface EnergyCapacityDataPoint { year: number; mw?: number; capacityMw?: number; }
/** EnergyCapacitySeries - supports both proto field names (source/years) and API aliases (energySource/data) */
export interface EnergyCapacitySeries { source?: string; energySource: string; name: string; years?: EnergyCapacityDataPoint[]; data: EnergyCapacityDataPoint[]; }
export interface BisPolicyRate { countryCode: string; countryName: string; rate: number; previousRate: number; date: string; centralBank: string; }
export interface BisExchangeRate { countryCode: string; countryName: string; realEer: number; nominalEer: number; realChange: number; date: string; }
export interface BisCreditToGdp { countryCode: string; countryName: string; creditGdpRatio: number; previousRatio: number; date: string; }

export interface GetFredSeriesResponse { series?: FredSeries; }
export interface GetFredSeriesBatchResponse { results: Record<string, FredSeries>; fetched: number; requested: number; }
export interface ListWorldBankIndicatorsResponse { data: WorldBankCountryData[]; pagination?: unknown; }
export interface GetEnergyPricesResponse { prices: EnergyPrice[]; }
export interface GetMacroSignalsResponse { timestamp: string; verdict: string; bullishCount: number; totalCount: number; signals?: { liquidity?: MacroSignalState; flowStructure?: MacroSignalState; macroRegime?: MacroSignalState; technicalTrend?: MacroSignalState; hashRate?: MacroSignalState; priceMomentum?: MacroSignalState; fearGreed?: MacroSignalState; }; meta?: { qqqSparkline?: number[] }; unavailable?: boolean; }
export interface GetEnergyCapacityResponse { series: EnergyCapacitySeries[]; }
export interface GetBisPolicyRatesResponse { rates: BisPolicyRate[]; }
export interface GetBisExchangeRatesResponse { rates: BisExchangeRate[]; }
export interface GetBisCreditResponse { entries: BisCreditToGdp[]; }

type CallOptions = { signal?: AbortSignal; headers?: Record<string, string> };

export class EconomicServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('economic', baseURL, options); }
  declare getFredSeries: (req?: { seriesId?: string; limit?: number }, opts?: CallOptions) => Promise<GetFredSeriesResponse>;
  declare getFredSeriesBatch: (req?: { seriesIds?: string[]; limit?: number }, opts?: CallOptions) => Promise<GetFredSeriesBatchResponse>;
  declare listWorldBankIndicators: (req?: { indicatorCode?: string; countryCode?: string; year?: number; pageSize?: number; cursor?: string }, opts?: CallOptions) => Promise<ListWorldBankIndicatorsResponse>;
  declare getEnergyPrices: (req?: { commodities?: string[] }, opts?: CallOptions) => Promise<GetEnergyPricesResponse>;
  declare getMacroSignals: (req?: Record<string, unknown>, opts?: CallOptions) => Promise<GetMacroSignalsResponse>;
  declare getEnergyCapacity: (req?: { energySources?: string[]; years?: number }, opts?: CallOptions) => Promise<GetEnergyCapacityResponse>;
  declare getBisPolicyRates: (req?: Record<string, unknown>, opts?: CallOptions) => Promise<GetBisPolicyRatesResponse>;
  declare getBisExchangeRates: (req?: Record<string, unknown>, opts?: CallOptions) => Promise<GetBisExchangeRatesResponse>;
  declare getBisCredit: (req?: Record<string, unknown>, opts?: CallOptions) => Promise<GetBisCreditResponse>;
}
