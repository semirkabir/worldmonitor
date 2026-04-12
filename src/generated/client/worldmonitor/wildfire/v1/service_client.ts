// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export type FireConfidence = 'FIRE_CONFIDENCE_UNSPECIFIED' | 'FIRE_CONFIDENCE_LOW' | 'FIRE_CONFIDENCE_NOMINAL' | 'FIRE_CONFIDENCE_HIGH';

export interface FireDetection { id: string; location: { latitude: number; longitude: number }; brightness: number; frp: number; confidence: FireConfidence; satellite: string; detectedAt: number; region: string; dayNight: string; }
export interface ListFireDetectionsResponse { fireDetections: FireDetection[]; pagination?: { nextCursor: string; totalCount: number }; }

export class WildfireServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('wildfire', baseURL, options); }
  declare listFireDetections: (req?: { start?: number; end?: number; pageSize?: number; cursor?: string; neLat?: number; neLon?: number; swLat?: number; swLon?: number }) => Promise<ListFireDetectionsResponse>;
}
