// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export type UnrestEventType = 'UNREST_EVENT_TYPE_UNSPECIFIED' | 'UNREST_EVENT_TYPE_PROTEST' | 'UNREST_EVENT_TYPE_RIOT' | 'UNREST_EVENT_TYPE_STRIKE' | 'UNREST_EVENT_TYPE_DEMONSTRATION' | 'UNREST_EVENT_TYPE_CIVIL_UNREST';
export type UnrestSourceType = 'UNREST_SOURCE_TYPE_UNSPECIFIED' | 'UNREST_SOURCE_TYPE_ACLED' | 'UNREST_SOURCE_TYPE_GDELT' | 'UNREST_SOURCE_TYPE_RSS';
export type ConfidenceLevel = 'CONFIDENCE_LEVEL_UNSPECIFIED' | 'CONFIDENCE_LEVEL_LOW' | 'CONFIDENCE_LEVEL_MEDIUM' | 'CONFIDENCE_LEVEL_HIGH';

export interface UnrestEvent { id: string; title: string; summary: string; eventType: UnrestEventType; city: string; country: string; region: string; location: { latitude: number; longitude: number }; occurredAt: number; severity: string; fatalities: number; sources: string[]; sourceType: UnrestSourceType; tags: string[]; actors: string[]; confidence: ConfidenceLevel; }
export interface UnrestCluster { id: string; country: string; region: string; eventCount: number; events: UnrestEvent[]; severity: string; startAt: number; endAt: number; primaryCause: string; }
export interface ListUnrestEventsResponse { events: UnrestEvent[]; clusters?: UnrestCluster[]; pagination?: { nextCursor: string; totalCount: number }; }

type CallOptions = { signal?: AbortSignal; headers?: Record<string, string> };

export class UnrestServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('unrest', baseURL, options); }
  declare listUnrestEvents: (req?: { start?: number; end?: number; country?: string; minSeverity?: string; neLat?: number; neLon?: number; swLat?: number; swLon?: number; pageSize?: number; cursor?: string }, opts?: CallOptions) => Promise<ListUnrestEventsResponse>;
}
