// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export type AisDisruptionType = 'AIS_DISRUPTION_TYPE_UNSPECIFIED' | 'AIS_DISRUPTION_TYPE_GAP_SPIKE' | 'AIS_DISRUPTION_TYPE_CHOKEPOINT_CONGESTION';
export type AisDisruptionSeverity = 'AIS_DISRUPTION_SEVERITY_UNSPECIFIED' | 'AIS_DISRUPTION_SEVERITY_LOW' | 'AIS_DISRUPTION_SEVERITY_ELEVATED' | 'AIS_DISRUPTION_SEVERITY_HIGH';

export interface AisDensityZone { id: string; name: string; location: { latitude: number; longitude: number }; intensity: number; deltaPct: number; shipsPerDay: number; note: string; }
export interface AisDisruption { id: string; name: string; type: AisDisruptionType; location: { latitude: number; longitude: number }; severity: AisDisruptionSeverity; changePct: number; windowHours: number; darkShips: number; vesselCount: number; region: string; description: string; }
export interface NavigationalWarning { id: string; title: string; text: string; area: string; location: { latitude: number; longitude: number }; issuedAt: number; expiresAt: number; authority: string; }
export interface VesselSnapshot { snapshotAt: number; densityZones: AisDensityZone[]; disruptions: AisDisruption[]; }

export interface GetVesselSnapshotResponse { snapshot?: VesselSnapshot; }
export interface ListNavigationalWarningsResponse { warnings: NavigationalWarning[]; pagination?: { nextCursor: string; totalCount: number }; }

export class MaritimeServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('maritime', baseURL, options); }
  declare getVesselSnapshot: (req?: { neLat?: number; neLon?: number; swLat?: number; swLon?: number }) => Promise<GetVesselSnapshotResponse>;
  declare listNavigationalWarnings: (req?: { pageSize?: number; cursor?: string; area?: string }) => Promise<ListNavigationalWarningsResponse>;
}
