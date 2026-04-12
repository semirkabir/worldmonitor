// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface NaturalEvent { id: string; title: string; description: string; category: string; categoryTitle: string; lat: number; lon: number; date: number; magnitude: number; magnitudeUnit: string; sourceUrl: string; sourceName: string; closed: boolean; }
export interface ListNaturalEventsResponse { events: NaturalEvent[]; }

export class NaturalServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('natural', baseURL, options); }
  declare listNaturalEvents: (req?: { days?: number }) => Promise<ListNaturalEventsResponse>;
}
