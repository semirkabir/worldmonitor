// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export type OutageSeverity = 'OUTAGE_SEVERITY_UNSPECIFIED' | 'OUTAGE_SEVERITY_PARTIAL' | 'OUTAGE_SEVERITY_MAJOR' | 'OUTAGE_SEVERITY_TOTAL';
export type ServiceOperationalStatus = 'SERVICE_OPERATIONAL_STATUS_UNSPECIFIED' | 'SERVICE_OPERATIONAL_STATUS_OPERATIONAL' | 'SERVICE_OPERATIONAL_STATUS_DEGRADED' | 'SERVICE_OPERATIONAL_STATUS_PARTIAL_OUTAGE' | 'SERVICE_OPERATIONAL_STATUS_MAJOR_OUTAGE' | 'SERVICE_OPERATIONAL_STATUS_MAINTENANCE';
export type CableHealthStatus = 'CABLE_HEALTH_STATUS_UNSPECIFIED' | 'CABLE_HEALTH_STATUS_OK' | 'CABLE_HEALTH_STATUS_DEGRADED' | 'CABLE_HEALTH_STATUS_FAULT';

export interface InternetOutage { id: string; title: string; link: string; description: string; detectedAt: number; country: string; region: string; location: { latitude: number; longitude: number }; severity: OutageSeverity; categories: string[]; cause: string; outageType: string; endedAt: number; }
export interface ServiceStatus { id: string; name: string; status: ServiceOperationalStatus; description: string; url: string; checkedAt: number; latencyMs: number; }
export interface CableHealthEvidence { source: string; summary: string; ts: number; }
export interface CableHealthRecord { status: CableHealthStatus; score: number; confidence: number; lastUpdated: string; evidence: CableHealthEvidence[]; }
export interface BaselineAnomaly { zScore: number; severity: string; multiplier: number; }
export interface BaselineStats { mean: number; stdDev: number; sampleCount: number; }
/** Proto-generated TemporalAnomaly type (exported as TemporalAnomalyProto to avoid collision with service-layer type) */
export interface TemporalAnomalyProto { type: string; region: string; currentCount: number; expectedCount: number; zScore: number; severity: string; multiplier: number; message: string; }

export interface ListInternetOutagesResponse { outages: InternetOutage[]; pagination?: { nextCursor: string; totalCount: number }; }
export interface ListServiceStatusesResponse { statuses: ServiceStatus[]; }
export interface GetCableHealthResponse { generatedAt: string; cables: Record<string, CableHealthRecord>; }
export interface GetTemporalBaselineResponse { anomaly?: BaselineAnomaly; baseline?: BaselineStats; learning: boolean; sampleCount: number; samplesNeeded: number; error: string; }
export interface RecordBaselineSnapshotResponse { updated: number; error: string; }
export interface ListTemporalAnomaliesResponse { anomalies: TemporalAnomalyProto[]; trackedTypes: string[]; computedAt: string; }

export class InfrastructureServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('infrastructure', baseURL, options); }
  declare listInternetOutages: (req?: { start?: number; end?: number; pageSize?: number; cursor?: string; country?: string }) => Promise<ListInternetOutagesResponse>;
  declare listServiceStatuses: (req?: { status?: string }) => Promise<ListServiceStatusesResponse>;
  declare getTemporalBaseline: (req?: { type?: string; region?: string; count?: number }) => Promise<GetTemporalBaselineResponse>;
  declare recordBaselineSnapshot: (req?: { updates?: Array<{ type: string; region: string; count: number }> }) => Promise<RecordBaselineSnapshotResponse>;
  declare getCableHealth: (req?: Record<string, unknown>) => Promise<GetCableHealthResponse>;
  declare listTemporalAnomalies: (req?: Record<string, unknown>) => Promise<ListTemporalAnomaliesResponse>;
}
