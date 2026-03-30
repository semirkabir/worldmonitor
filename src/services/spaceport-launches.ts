/**
 * Spaceport launch schedule service
 * Fetches upcoming launches from rocketlaunch.live public JSON API
 * and filters by spaceport location.
 */

export interface SpaceportLaunch {
  id: number;
  name: string;
  provider: string;
  vehicle: string;
  pad: string;
  location: string;
  t0: string | null;       // ISO UTC launch time, null if TBD
  dateStr: string;         // Human-readable date string
  description: string | null;
  missionDescription: string | null;
  slug: string;
  weather: { condition: string; tempF: number; windMph: number } | null;
}

interface RawLaunch {
  id: number;
  name: string;
  provider_name: string;
  vehicle_name: string;
  pad_name?: string;
  location_name: string;
  state?: string;
  country?: string;
  t0?: string;
  date_str: string;
  launch_description?: string;
  mission_description?: string;
  slug?: string;
  weather_condition?: string;
  weather_temp?: string;
  weather_wind_mph?: string;
}

interface RawResponse {
  launches: RawLaunch[];
}

// Location aliases — map spaceport IDs to keywords matched against location_name/pad_name
const SPACEPORT_LOCATION_KEYWORDS: Record<string, string[]> = {
  ksc:         ['kennedy', 'cape canaveral', 'canaveral', 'lc-39', 'slc-40'],
  vandenberg:  ['vandenberg', 'slc-4'],
  boca_chica:  ['starbase', 'boca chica', 'olp'],
  baikonur:    ['baikonur'],
  plesetsk:    ['plesetsk'],
  vostochny:   ['vostochny'],
  jiuquan:     ['jiuquan'],
  xichang:     ['xichang'],
  wenchang:    ['wenchang'],
  kourou:      ['kourou', 'guiana', 'csg'],
  sriharikota: ['sriharikota', 'satish dhawan'],
  tanegashima: ['tanegashima'],
};

const CACHE_TTL = 5 * 60 * 1000; // 5 min
let cache: { data: SpaceportLaunch[]; ts: number } | null = null;

async function fetchAll(): Promise<SpaceportLaunch[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  const res = await fetch('https://fdo.rocketlaunch.live/json/launches/next/25');
  if (!res.ok) throw new Error(`rocketlaunch.live error: ${res.status}`);
  const json: RawResponse = await res.json();

  const launches = (json.launches ?? []).map((r): SpaceportLaunch => ({
    id: r.id,
    name: r.name || 'TBD',
    provider: r.provider_name || '',
    vehicle: r.vehicle_name || '',
    pad: r.pad_name || '',
    location: r.state ? `${r.location_name}, ${r.state}` : r.location_name,
    t0: r.t0 ?? null,
    dateStr: r.date_str,
    description: r.launch_description ?? null,
    missionDescription: r.mission_description ?? null,
    slug: r.slug ?? '',
    weather: r.weather_condition
      ? { condition: r.weather_condition, tempF: parseFloat(r.weather_temp ?? '0'), windMph: parseFloat(r.weather_wind_mph ?? '0') }
      : null,
  }));

  cache = { data: launches, ts: Date.now() };
  return launches;
}

/** Returns upcoming launches relevant to the given spaceport ID. */
export async function fetchLaunchesForSpaceport(spaceportId: string, signal?: AbortSignal): Promise<SpaceportLaunch[]> {
  const keywords = SPACEPORT_LOCATION_KEYWORDS[spaceportId];
  const all = await fetchAll();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!keywords) return [];

  return all.filter(l => {
    const haystack = `${l.location} ${l.pad}`.toLowerCase();
    return keywords.some(k => haystack.includes(k));
  });
}
