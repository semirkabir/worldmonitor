/**
 * RPC: getBisCredit -- BIS SDMX API (WS_TC)
 * Total credit-to-GDP ratio for major economies.
 */

import type {
  ServerContext,
  GetBisCreditRequest,
  GetBisCreditResponse,
  BisCreditToGdp,
} from '../../../../src/generated/server/worldmonitor/economic/v1/service_server';

import { cachedFetchJson } from '../../../_shared/redis';
import { fetchBisCSV, parseBisCSV, parseBisNumber, bisCol, BIS_COUNTRIES, BIS_COUNTRY_KEYS } from './_bis-shared';

const REDIS_CACHE_KEY = 'economic:bis:credit:v1';
const REDIS_CACHE_TTL = 43200; // 12 hours — quarterly data

export async function getBisCredit(
  _ctx: ServerContext,
  _req: GetBisCreditRequest,
): Promise<GetBisCreditResponse> {
  try {
    const result = await cachedFetchJson<GetBisCreditResponse>(REDIS_CACHE_KEY, REDIS_CACHE_TTL, async () => {
      // Single batched request with .770.A suffix for % of GDP ratio (adjusted)
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const startPeriod = `${twoYearsAgo.getFullYear()}-Q1`;

      const csv = await fetchBisCSV('WS_TC', `Q.${BIS_COUNTRY_KEYS}.C.A.M.770.A?startPeriod=${startPeriod}&detail=dataonly`);
      const rows = parseBisCSV(csv);

      // Group by country, take last 2 observations
      const byCountry = new Map<string, Array<{ date: string; value: number }>>();
      for (const row of rows) {
        const cc = bisCol(row, 'REF_AREA', 'BORROWERS_CTY', 'Reference area', 'ref_area');
        const date = bisCol(row, 'TIME_PERIOD', 'Time period', 'time_period');
        const val = parseBisNumber(bisCol(row, 'OBS_VALUE', 'Observation value', 'obs_value') || undefined);
        if (!cc || !date || val === null) continue;
        if (!byCountry.has(cc)) byCountry.set(cc, []);
        byCountry.get(cc)!.push({ date, value: val });
      }

      const entries: BisCreditToGdp[] = [];
      for (const [cc, obs] of byCountry) {
        const info = BIS_COUNTRIES[cc];
        if (!info) continue;

        // Sort chronologically and take last 2
        obs.sort((a, b) => a.date.localeCompare(b.date));
        const latest = obs[obs.length - 1];
        const previous = obs.length >= 2 ? obs[obs.length - 2] : undefined;

        if (latest) {
          entries.push({
            countryCode: cc,
            countryName: info.name,
            creditGdpRatio: Math.round(latest.value * 10) / 10,
            previousRatio: previous ? Math.round(previous.value * 10) / 10 : Math.round(latest.value * 10) / 10,
            date: latest.date,
          });
        }
      }

      return entries.length > 0 ? { entries } : null;
    });
    return result || { entries: [] };
  } catch (e) {
    console.error('[BIS] Credit-to-GDP fetch failed:', e);
    return { entries: [] };
  }
}
