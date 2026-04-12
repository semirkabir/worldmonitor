// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface AcledConflictEvent { id: string; eventType: string; country: string; admin1: string; location: { latitude: number; longitude: number }; occurredAt: number; fatalities: number; actors: string[]; source: string; }
export interface UcdpViolenceEvent { id: string; dateStart: number; dateEnd: number; location: { latitude: number; longitude: number }; country: string; sideA: string; sideB: string; deathsBest: number; deathsLow: number; deathsHigh: number; violenceType: string; sourceOriginal: string; }
export interface HumanitarianCountrySummary { countryCode: string; countryName: string; conflictEventsTotal: number; conflictPoliticalViolenceEvents: number; conflictFatalities: number; referencePeriod: string; conflictDemonstrations: number; updatedAt: number; }
/** IranEvent - lat/lon fields are camelCase; latitude/longitude aliases provided for map layer access */
export interface IranEvent { id: string; title: string; category: string; sourceUrl: string; lat: number; lon: number; latitude: number; longitude: number; locationName: string; timestamp: number; severity: string; }

export interface ListAcledEventsResponse { events: AcledConflictEvent[]; pagination?: { nextCursor: string; totalCount: number }; }
export interface ListUcdpEventsResponse { events: UcdpViolenceEvent[]; pagination?: { nextCursor: string; totalCount: number }; }
export interface GetHumanitarianSummaryResponse { summary?: HumanitarianCountrySummary; }
export interface GetHumanitarianSummaryBatchResponse { results: Record<string, HumanitarianCountrySummary>; fetched: number; requested: number; }
export interface ListIranEventsResponse { events: IranEvent[]; scrapedAt: string; }

type CallOptions = { signal?: AbortSignal; headers?: Record<string, string> };

export class ConflictServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('conflict', baseURL, options); }
  declare listAcledEvents: (req?: { start?: number; end?: number; pageSize?: number; cursor?: string; country?: string }, opts?: CallOptions) => Promise<ListAcledEventsResponse>;
  declare listUcdpEvents: (req?: { start?: number; end?: number; pageSize?: number; cursor?: string; country?: string }, opts?: CallOptions) => Promise<ListUcdpEventsResponse>;
  declare getHumanitarianSummary: (req?: { countryCode?: string }, opts?: CallOptions) => Promise<GetHumanitarianSummaryResponse>;
  declare getHumanitarianSummaryBatch: (req?: { countryCodes?: string[] }, opts?: CallOptions) => Promise<GetHumanitarianSummaryBatchResponse>;
  declare listIranEvents: (req?: Record<string, unknown>, opts?: CallOptions) => Promise<ListIranEventsResponse>;
}
