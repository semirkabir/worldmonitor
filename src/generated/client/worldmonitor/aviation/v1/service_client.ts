// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export type CabinClass = 'CABIN_CLASS_UNSPECIFIED' | 'CABIN_CLASS_ECONOMY' | 'CABIN_CLASS_PREMIUM_ECONOMY' | 'CABIN_CLASS_BUSINESS' | 'CABIN_CLASS_FIRST';
export type FlightDelayType = 'FLIGHT_DELAY_TYPE_UNSPECIFIED' | 'FLIGHT_DELAY_TYPE_GROUND_STOP' | 'FLIGHT_DELAY_TYPE_GROUND_DELAY' | 'FLIGHT_DELAY_TYPE_DEPARTURE_DELAY' | 'FLIGHT_DELAY_TYPE_ARRIVAL_DELAY' | 'FLIGHT_DELAY_TYPE_GENERAL' | 'FLIGHT_DELAY_TYPE_CLOSURE';
export type FlightDelaySeverity = 'FLIGHT_DELAY_SEVERITY_UNSPECIFIED' | 'FLIGHT_DELAY_SEVERITY_NORMAL' | 'FLIGHT_DELAY_SEVERITY_MINOR' | 'FLIGHT_DELAY_SEVERITY_MODERATE' | 'FLIGHT_DELAY_SEVERITY_MAJOR' | 'FLIGHT_DELAY_SEVERITY_SEVERE';
export type FlightDelaySource = 'FLIGHT_DELAY_SOURCE_UNSPECIFIED' | 'FLIGHT_DELAY_SOURCE_FAA' | 'FLIGHT_DELAY_SOURCE_EUROCONTROL' | 'FLIGHT_DELAY_SOURCE_COMPUTED';
export type FlightInstanceStatus = 'FLIGHT_INSTANCE_STATUS_UNSPECIFIED' | 'FLIGHT_INSTANCE_STATUS_SCHEDULED' | 'FLIGHT_INSTANCE_STATUS_BOARDING' | 'FLIGHT_INSTANCE_STATUS_DEPARTED' | 'FLIGHT_INSTANCE_STATUS_AIRBORNE' | 'FLIGHT_INSTANCE_STATUS_LANDED' | 'FLIGHT_INSTANCE_STATUS_ARRIVED' | 'FLIGHT_INSTANCE_STATUS_CANCELLED' | 'FLIGHT_INSTANCE_STATUS_DIVERTED' | 'FLIGHT_INSTANCE_STATUS_UNKNOWN';
export type FlightDirection = 'FLIGHT_DIRECTION_UNSPECIFIED' | 'FLIGHT_DIRECTION_DEPARTURE' | 'FLIGHT_DIRECTION_ARRIVAL' | 'FLIGHT_DIRECTION_BOTH';
export type PositionSource = 'POSITION_SOURCE_UNSPECIFIED' | 'POSITION_SOURCE_OPENSKY' | 'POSITION_SOURCE_WINGBITS' | 'POSITION_SOURCE_SIMULATED';

export interface AirportDelayAlert { id: string; iata: string; icao: string; name: string; city: string; country: string; location: { latitude: number; longitude: number }; region: string; delayType: FlightDelayType; severity: FlightDelaySeverity; avgDelayMinutes: number; delayedFlightsPct: number; cancelledFlights: number; totalFlights: number; reason: string; source: FlightDelaySource; updatedAt: number; }
export interface AirportOpsSummary { iata: string; icao: string; name: string; delayPct: number; avgDelayMinutes: number; cancellationRate: number; totalFlights: number; closureStatus: boolean; notamFlags: string[]; severity: FlightDelaySeverity; topDelayReasons: string[]; source: string; updatedAt: number; }
export interface CarrierOpsSummary { carrier: { iataCode: string; name: string }; airport: string; totalFlights: number; delayedCount: number; cancelledCount: number; avgDelayMinutes: number; delayPct: number; cancellationRate: number; updatedAt: number; }
export interface FlightInstance { flightNumber: string; date: string; operatingCarrier: { iataCode: string; name: string }; origin: { iata: string; name: string }; destination: { iata: string; name: string }; scheduledDeparture: number; scheduledArrival: number; estimatedDeparture: number; estimatedArrival: number; status: FlightInstanceStatus; delayMinutes: number; cancelled: boolean; diverted: boolean; gate: string; terminal: string; aircraftType: string; source: string; }
export interface PositionSample { icao24: string; callsign: string; lat: number; lon: number; altitudeM: number; groundSpeedKts: number; trackDeg: number; onGround: boolean; source: PositionSource; observedAt: number; }
export interface PriceQuote { id: string; origin: string; destination: string; departureDate: string; returnDate: string; carrier: { iataCode: string; name: string }; priceAmount: number; currency: string; cabin: CabinClass; stops: number; durationMinutes: number; isIndicative: boolean; provider: string; expiresAt: number; checkoutRef: string; }
export interface AviationNewsItem { id: string; title: string; url: string; sourceName: string; publishedAt: number; snippet: string; matchedEntities: string[]; imageUrl: string; }

export interface ListAirportDelaysResponse { alerts: AirportDelayAlert[]; pagination?: { nextCursor: string; totalCount: number }; }
export interface GetAirportOpsSummaryResponse { summaries: AirportOpsSummary[]; cacheHit: boolean; }
export interface ListAirportFlightsResponse { flights: FlightInstance[]; totalAvailable: number; source: string; updatedAt: number; }
export interface GetCarrierOpsResponse { carriers: CarrierOpsSummary[]; source: string; updatedAt: number; }
export interface GetFlightStatusResponse { flights: FlightInstance[]; source: string; cacheHit: boolean; }
export interface TrackAircraftResponse { positions: PositionSample[]; source: string; updatedAt: number; }
export interface SearchFlightPricesResponse { quotes: PriceQuote[]; provider: string; isDemoMode: boolean; updatedAt: number; isIndicative: boolean; }
export interface ListAviationNewsResponse { items: AviationNewsItem[]; source: string; updatedAt: number; }

export class AviationServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('aviation', baseURL, options); }
  declare listAirportDelays: (req?: { pageSize?: number; cursor?: string; region?: string; minSeverity?: string }) => Promise<ListAirportDelaysResponse>;
  declare getAirportOpsSummary: (req?: { airports?: string[] }) => Promise<GetAirportOpsSummaryResponse>;
  declare listAirportFlights: (req?: { airport?: string; direction?: string; limit?: number }) => Promise<ListAirportFlightsResponse>;
  declare getCarrierOps: (req?: { airports?: string[]; minFlights?: number }) => Promise<GetCarrierOpsResponse>;
  declare getFlightStatus: (req?: { flightNumber?: string; date?: string; origin?: string }) => Promise<GetFlightStatusResponse>;
  declare trackAircraft: (req?: { icao24?: string; callsign?: string; swLat?: number; swLon?: number; neLat?: number; neLon?: number }) => Promise<TrackAircraftResponse>;
  declare searchFlightPrices: (req?: { origin?: string; destination?: string; departureDate?: string; returnDate?: string; adults?: number; cabin?: string; nonstopOnly?: boolean; maxResults?: number; currency?: string; market?: string }) => Promise<SearchFlightPricesResponse>;
  declare listAviationNews: (req?: { entities?: string[]; windowHours?: number; maxItems?: number }) => Promise<ListAviationNewsResponse>;
}
