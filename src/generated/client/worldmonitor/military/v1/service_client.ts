// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export type MilitaryAircraftType = 'MILITARY_AIRCRAFT_TYPE_UNSPECIFIED' | 'MILITARY_AIRCRAFT_TYPE_FIGHTER' | 'MILITARY_AIRCRAFT_TYPE_BOMBER' | 'MILITARY_AIRCRAFT_TYPE_TRANSPORT' | 'MILITARY_AIRCRAFT_TYPE_TANKER' | 'MILITARY_AIRCRAFT_TYPE_AWACS' | 'MILITARY_AIRCRAFT_TYPE_RECONNAISSANCE' | 'MILITARY_AIRCRAFT_TYPE_HELICOPTER' | 'MILITARY_AIRCRAFT_TYPE_DRONE' | 'MILITARY_AIRCRAFT_TYPE_PATROL' | 'MILITARY_AIRCRAFT_TYPE_SPECIAL_OPS' | 'MILITARY_AIRCRAFT_TYPE_VIP' | 'MILITARY_AIRCRAFT_TYPE_UNKNOWN';
export type MilitaryOperator = 'MILITARY_OPERATOR_UNSPECIFIED' | 'MILITARY_OPERATOR_USAF' | 'MILITARY_OPERATOR_USN' | 'MILITARY_OPERATOR_USMC' | 'MILITARY_OPERATOR_USA' | 'MILITARY_OPERATOR_RAF' | 'MILITARY_OPERATOR_RN' | 'MILITARY_OPERATOR_FAF' | 'MILITARY_OPERATOR_GAF' | 'MILITARY_OPERATOR_PLAAF' | 'MILITARY_OPERATOR_PLAN' | 'MILITARY_OPERATOR_VKS' | 'MILITARY_OPERATOR_IAF' | 'MILITARY_OPERATOR_NATO' | 'MILITARY_OPERATOR_OTHER';
export type MilitaryVesselType = 'MILITARY_VESSEL_TYPE_UNSPECIFIED' | 'MILITARY_VESSEL_TYPE_CARRIER' | 'MILITARY_VESSEL_TYPE_DESTROYER' | 'MILITARY_VESSEL_TYPE_FRIGATE' | 'MILITARY_VESSEL_TYPE_SUBMARINE' | 'MILITARY_VESSEL_TYPE_AMPHIBIOUS' | 'MILITARY_VESSEL_TYPE_PATROL' | 'MILITARY_VESSEL_TYPE_AUXILIARY' | 'MILITARY_VESSEL_TYPE_RESEARCH' | 'MILITARY_VESSEL_TYPE_ICEBREAKER' | 'MILITARY_VESSEL_TYPE_SPECIAL' | 'MILITARY_VESSEL_TYPE_UNKNOWN';
export type MilitaryConfidence = 'MILITARY_CONFIDENCE_UNSPECIFIED' | 'MILITARY_CONFIDENCE_LOW' | 'MILITARY_CONFIDENCE_MEDIUM' | 'MILITARY_CONFIDENCE_HIGH';
export type MilitaryActivityType = 'MILITARY_ACTIVITY_TYPE_UNSPECIFIED' | 'MILITARY_ACTIVITY_TYPE_EXERCISE' | 'MILITARY_ACTIVITY_TYPE_PATROL' | 'MILITARY_ACTIVITY_TYPE_TRANSPORT' | 'MILITARY_ACTIVITY_TYPE_DEPLOYMENT' | 'MILITARY_ACTIVITY_TYPE_TRANSIT' | 'MILITARY_ACTIVITY_TYPE_UNKNOWN';

export interface FlightEnrichment { manufacturer: string; owner: string; operatorName: string; typeCode: string; builtYear: string; confirmedMilitary: boolean; militaryBranch: string; }
export interface MilitaryFlight { id: string; callsign: string; hexCode: string; registration: string; aircraftType: MilitaryAircraftType; aircraftModel: string; operator: MilitaryOperator; operatorCountry: string; location: { latitude: number; longitude: number }; altitude: number; heading: number; speed: number; verticalRate: number; onGround: boolean; squawk: string; origin: string; destination: string; lastSeenAt: number; firstSeenAt: number; confidence: MilitaryConfidence; isInteresting: boolean; note: string; enrichment: FlightEnrichment; }
export interface MilitaryFlightCluster { id: string; name: string; location: { latitude: number; longitude: number }; flightCount: number; flights: MilitaryFlight[]; dominantOperator: MilitaryOperator; activityType: MilitaryActivityType; }
export interface TheaterPosture { theater: string; postureLevel: string; activeFlights: number; trackedVessels: number; activeOperations: string[]; assessedAt: number; }
export interface AircraftDetails { icao24: string; registration: string; manufacturerIcao: string; manufacturerName: string; model: string; typecode: string; serialNumber: string; icaoAircraftType: string; operator: string; operatorCallsign: string; operatorIcao: string; owner: string; built: string; engines: string; categoryDescription: string; }
export interface USNIVessel { name: string; hullNumber: string; vesselType: string; region: string; regionLat: number; regionLon: number; deploymentStatus: string; homePort: string; strikeGroup: string; activityDescription: string; articleUrl: string; articleDate: string; }
export interface USNIStrikeGroup { name: string; carrier: string; airWing: string; destroyerSquadron: string; escorts: string[]; }
export interface BattleForceSummary { totalShips: number; deployed: number; underway: number; }
export interface USNIFleetReport { articleUrl: string; articleDate: string; articleTitle: string; battleForceSummary: BattleForceSummary; vessels: USNIVessel[]; strikeGroups: USNIStrikeGroup[]; regions: string[]; parsingWarnings: string[]; timestamp: number; }
export interface MilitaryBaseEntry { id: string; name: string; latitude: number; longitude: number; kind: string; countryIso2: string; type: string; tier: number; catAirforce: boolean; catNaval: boolean; catNuclear: boolean; catSpace: boolean; catTraining: boolean; branch: string; status: string; }
export interface MilitaryBaseCluster { latitude: number; longitude: number; count: number; dominantType: string; expansionZoom: number; }

export interface ListMilitaryFlightsResponse { flights: MilitaryFlight[]; clusters: MilitaryFlightCluster[]; pagination?: { nextCursor: string; totalCount: number }; }
/** GetTheaterPostureResponse - exposes both single posture and theaters array */
export interface GetTheaterPostureResponse { posture?: TheaterPosture; theaters: TheaterPosture[]; }
export interface GetAircraftDetailsResponse { details: AircraftDetails; configured: boolean; }
export interface GetAircraftDetailsBatchResponse { results: Record<string, AircraftDetails>; fetched: number; requested: number; configured: boolean; }
export interface GetWingbitsStatusResponse { configured: boolean; }
export interface GetUSNIFleetReportResponse { report?: USNIFleetReport; error: string; }
export interface ListMilitaryBasesResponse { bases: MilitaryBaseEntry[]; clusters: MilitaryBaseCluster[]; totalInView: number; truncated: boolean; }

type CallOptions = { signal?: AbortSignal; headers?: Record<string, string> };

export class MilitaryServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('military', baseURL, options); }
  declare listMilitaryFlights: (req?: { neLat?: number; neLon?: number; swLat?: number; swLon?: number; operator?: string; aircraftType?: string; pageSize?: number; cursor?: string }, opts?: CallOptions) => Promise<ListMilitaryFlightsResponse>;
  declare getTheaterPosture: (req?: { theater?: string }, opts?: CallOptions) => Promise<GetTheaterPostureResponse>;
  declare getAircraftDetails: (req?: { icao24?: string }, opts?: CallOptions) => Promise<GetAircraftDetailsResponse>;
  declare getAircraftDetailsBatch: (req?: { icao24s?: string[] }, opts?: CallOptions) => Promise<GetAircraftDetailsBatchResponse>;
  declare getWingbitsStatus: (req?: Record<string, unknown>, opts?: CallOptions) => Promise<GetWingbitsStatusResponse>;
  declare getUSNIFleetReport: (req?: { forceRefresh?: boolean }, opts?: CallOptions) => Promise<GetUSNIFleetReportResponse>;
  declare listMilitaryBases: (req?: { neLat?: number; neLon?: number; swLat?: number; swLon?: number; zoom?: number; type?: string; kind?: string; country?: string }, opts?: CallOptions) => Promise<ListMilitaryBasesResponse>;
}
