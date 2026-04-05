import type {
    ServerContext,
    TrackAircraftRequest,
    TrackAircraftResponse,
    PositionSample,
} from '../../../../src/generated/server/worldmonitor/aviation/v1/service_server';
import { getRelayBaseUrl, getRelayHeaders } from './_shared';
import { cachedFetchJson } from '../../../_shared/redis';
import { CHROME_UA } from '../../../_shared/constants';

// 120s for anonymous OpenSky tier (~10 req/min limit); TODO: reduce to 10s on commercial tier
const CACHE_TTL = 120;
const NEGATIVE_CACHE_TTL = 15;
const MAX_POSITION_AGE_MS = 20 * 60 * 1000;

interface OpenSkyResponse {
    states?: unknown[][];
}

function parseOpenSkyStates(states: unknown[][]): PositionSample[] {
    const now = Date.now();
    const latestByHex = new Map<string, PositionSample>();

    for (const state of states) {
        if (!Array.isArray(state) || state[5] == null || state[6] == null) continue;

        const icao24 = String(state[0] ?? '').trim().toLowerCase();
        const lon = Number(state[5]);
        const lat = Number(state[6]);
        const observedAt = Number(state[4] ?? (now / 1000)) * 1000;
        if (!icao24 || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
        if (Number.isFinite(observedAt) && now - observedAt > MAX_POSITION_AGE_MS) continue;

        const next: PositionSample = {
            icao24,
            callsign: String(state[1] ?? '').trim(),
            lat,
            lon,
            altitudeM: Number(state[7] ?? 0),
            groundSpeedKts: Number(state[9] ?? 0) * 1.944,
            trackDeg: Number(state[10] ?? 0),
            verticalRate: Number(state[11] ?? 0),
            onGround: Boolean(state[8]),
            source: 'POSITION_SOURCE_OPENSKY',
            observedAt,
        };

        const prev = latestByHex.get(icao24);
        if (!prev || next.observedAt >= prev.observedAt) {
            latestByHex.set(icao24, next);
        }
    }

    return Array.from(latestByHex.values());
}

const OPENSKY_PUBLIC_BASE = 'https://opensky-network.org/api';

async function fetchOpenSkyAnonymous(req: TrackAircraftRequest): Promise<PositionSample[]> {
    let url: string;
    if (req.swLat != null && req.neLat != null) {
        url = `${OPENSKY_PUBLIC_BASE}/states/all?lamin=${req.swLat}&lomin=${req.swLon}&lamax=${req.neLat}&lomax=${req.neLon}`;
    } else if (req.icao24) {
        url = `${OPENSKY_PUBLIC_BASE}/states/all?icao24=${req.icao24}`;
    } else {
        url = `${OPENSKY_PUBLIC_BASE}/states/all`;
    }

    const resp = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: { 'Accept': 'application/json', 'User-Agent': CHROME_UA },
    });
    if (!resp.ok) throw new Error(`OpenSky anonymous HTTP ${resp.status}`);
    const data = await resp.json() as OpenSkyResponse;
    return parseOpenSkyStates(data.states ?? []);
}

function buildCacheKey(req: TrackAircraftRequest): string {
    if (req.icao24) return `aviation:track:icao:${req.icao24}:v1`;
    if (req.swLat != null && req.neLat != null) {
        return `aviation:track:${Math.floor(req.swLat)}:${Math.floor(req.swLon)}:${Math.ceil(req.neLat)}:${Math.ceil(req.neLon)}:v1`;
    }
    return 'aviation:track:all:v1';
}

export async function trackAircraft(
    _ctx: ServerContext,
    req: TrackAircraftRequest,
): Promise<TrackAircraftResponse> {
    const cacheKey = buildCacheKey(req);

    let result: { positions: PositionSample[]; source: string } | null = null;
    try {
        result = await cachedFetchJson<{ positions: PositionSample[]; source: string }>(
            cacheKey, CACHE_TTL, async () => {
                const relayBase = getRelayBaseUrl();

                // Try relay first if configured
                if (relayBase) {
                    try {
                        let osUrl: string;
                        if (req.swLat != null && req.neLat != null) {
                            osUrl = `${relayBase}/opensky/states/all?lamin=${req.swLat}&lomin=${req.swLon}&lamax=${req.neLat}&lomax=${req.neLon}`;
                        } else if (req.icao24) {
                            osUrl = `${relayBase}/opensky/states/all?icao24=${req.icao24}`;
                        } else {
                            osUrl = `${relayBase}/opensky/states/all`;
                        }

                        const resp = await fetch(osUrl, {
                            headers: getRelayHeaders({}),
                            signal: AbortSignal.timeout(10_000),
                        });

                        if (resp.ok) {
                            const data = await resp.json() as OpenSkyResponse;
                            const positions = parseOpenSkyStates(data.states ?? []);
                            if (positions.length > 0) return { positions, source: 'opensky' };
                        }
                    } catch (err) {
                        console.warn(`[Aviation] Relay failed: ${err instanceof Error ? err.message : err}`);
                    }
                }

                // Try direct OpenSky anonymous API (no auth needed, ~10 req/min limit)
                try {
                    const directPositions = await fetchOpenSkyAnonymous(req);
                    if (directPositions.length > 0) {
                        return { positions: directPositions, source: 'opensky-anonymous' };
                    }
                } catch (err) {
                    console.warn(`[Aviation] Direct OpenSky anonymous failed: ${err instanceof Error ? err.message : err}`);
                }

                return null; // negative-cached briefly
            }, NEGATIVE_CACHE_TTL,
        );
    } catch {
        /* Redis unavailable — fall through to direct response handling */
    }

    if (result) {
        let positions = result.positions;
        if (req.icao24) positions = positions.filter(p => p.icao24 === req.icao24);
        if (req.callsign) positions = positions.filter(p => p.callsign.includes(req.callsign.toUpperCase()));
        return { positions, source: result.source, updatedAt: Date.now() };
    }

    return { positions: [], source: 'unavailable', updatedAt: Date.now() };
}
