// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface Earthquake { id: string; place: string; magnitude: number; depthKm: number; location: { latitude: number; longitude: number }; occurredAt: number; sourceUrl: string; }
export interface ListEarthquakesResponse { earthquakes: Earthquake[]; pagination?: { nextCursor: string; totalCount: number }; }

export class SeismologyServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('seismology', baseURL, options); }
  declare listEarthquakes: (req?: { start?: number; end?: number; pageSize?: number; cursor?: string; minMagnitude?: number }) => Promise<ListEarthquakesResponse>;
}
