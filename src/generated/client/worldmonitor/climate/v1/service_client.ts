// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export type AnomalySeverity = 'ANOMALY_SEVERITY_UNSPECIFIED' | 'ANOMALY_SEVERITY_NORMAL' | 'ANOMALY_SEVERITY_MODERATE' | 'ANOMALY_SEVERITY_EXTREME';
export type AnomalyType = 'ANOMALY_TYPE_UNSPECIFIED' | 'ANOMALY_TYPE_WARM' | 'ANOMALY_TYPE_COLD' | 'ANOMALY_TYPE_WET' | 'ANOMALY_TYPE_DRY' | 'ANOMALY_TYPE_MIXED';

export interface ClimateAnomaly { zone: string; location: { latitude: number; longitude: number }; tempDelta: number; precipDelta: number; severity: AnomalySeverity; type: AnomalyType; period: string; }
export interface ListClimateAnomaliesResponse { anomalies: ClimateAnomaly[]; pagination?: { nextCursor: string; totalCount: number }; }

export class ClimateServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('climate', baseURL, options); }
  declare listClimateAnomalies: (req?: { pageSize?: number; cursor?: string; minSeverity?: string }) => Promise<ListClimateAnomaliesResponse>;
}
