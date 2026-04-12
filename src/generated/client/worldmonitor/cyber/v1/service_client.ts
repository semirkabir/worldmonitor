// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export type CyberThreatType = 'CYBER_THREAT_TYPE_UNSPECIFIED' | 'CYBER_THREAT_TYPE_C2_SERVER' | 'CYBER_THREAT_TYPE_MALWARE_HOST' | 'CYBER_THREAT_TYPE_PHISHING' | 'CYBER_THREAT_TYPE_MALICIOUS_URL';
export type CyberThreatSource = 'CYBER_THREAT_SOURCE_UNSPECIFIED' | 'CYBER_THREAT_SOURCE_FEODO' | 'CYBER_THREAT_SOURCE_URLHAUS' | 'CYBER_THREAT_SOURCE_C2INTEL' | 'CYBER_THREAT_SOURCE_OTX' | 'CYBER_THREAT_SOURCE_ABUSEIPDB';
export type CyberThreatIndicatorType = 'CYBER_THREAT_INDICATOR_TYPE_UNSPECIFIED' | 'CYBER_THREAT_INDICATOR_TYPE_IP' | 'CYBER_THREAT_INDICATOR_TYPE_DOMAIN' | 'CYBER_THREAT_INDICATOR_TYPE_URL';

export interface CyberThreat { id: string; type: CyberThreatType; source: CyberThreatSource; indicator: string; indicatorType: CyberThreatIndicatorType; location: { latitude: number; longitude: number }; country: string; severity: string; malwareFamily: string; tags: string[]; firstSeenAt: number; lastSeenAt: number; }
export interface ListCyberThreatsResponse { threats: CyberThreat[]; pagination?: { nextCursor: string; totalCount: number }; }

export class CyberServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('cyber', baseURL, options); }
  declare listCyberThreats: (req?: { start?: number; end?: number; pageSize?: number; cursor?: string; type?: string; source?: string; minSeverity?: string }) => Promise<ListCyberThreatsResponse>;
}
