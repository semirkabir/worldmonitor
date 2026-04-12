// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface PositiveGeoEvent { latitude: number; longitude: number; name: string; category: string; count: number; timestamp: number; }
export interface ListPositiveGeoEventsResponse { events: PositiveGeoEvent[]; }

export class PositiveEventsServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('positive-events', baseURL, options); }
  declare listPositiveGeoEvents: (req?: Record<string, unknown>) => Promise<ListPositiveGeoEventsResponse>;
}
