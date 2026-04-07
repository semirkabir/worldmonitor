import { createCircuitBreaker } from '@/utils';

export interface SolarWeatherAlert {
  productId: string;
  issuedAt: string;
  headline: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

export interface SolarWeatherSnapshot {
  kpIndex: number;
  solarWindSpeed: number | null;
  plasmaDensity: number | null;
  alerts: SolarWeatherAlert[];
  fetchedAt: string;
}

const breaker = createCircuitBreaker<SolarWeatherSnapshot>({
  name: 'Solar Weather',
  cacheTtlMs: 5 * 60 * 1000,
  persistCache: true,
});

function parseAlertHeadline(message: string): string {
  const lines = message.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return lines.find(line => line.includes('WARNING:') || line.includes('WATCH:') || line.includes('ALERT:'))
    || lines[3]
    || lines[0]
    || 'Solar weather alert';
}

function parseAlertSeverity(message: string): SolarWeatherAlert['severity'] {
  const lower = message.toLowerCase();
  if (lower.includes('g4') || lower.includes('g5') || lower.includes('severe')) return 'critical';
  if (lower.includes('g3') || lower.includes('warning')) return 'high';
  if (lower.includes('g2') || lower.includes('watch') || lower.includes('alert')) return 'medium';
  return 'low';
}

function getLatestNumericRow(rows: unknown[]): string[] | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (Array.isArray(row) && row.length > 1) return row.map(value => String(value));
  }
  return null;
}

async function fetchFreshSolarWeather(): Promise<SolarWeatherSnapshot> {
  const [kpResp, plasmaResp, alertsResp] = await Promise.all([
    fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { signal: AbortSignal.timeout(8000) }),
    fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json', { signal: AbortSignal.timeout(8000) }),
    fetch('https://services.swpc.noaa.gov/products/alerts.json', { signal: AbortSignal.timeout(8000) }),
  ]);

  if (!kpResp.ok || !plasmaResp.ok || !alertsResp.ok) {
    throw new Error(`Solar weather fetch failed: kp=${kpResp.status} plasma=${plasmaResp.status} alerts=${alertsResp.status}`);
  }

  const kpRows = await kpResp.json() as Array<{ time_tag: string; Kp: number }>;
  const plasmaRows = await plasmaResp.json() as unknown[];
  const alertRows = await alertsResp.json() as Array<{ product_id: string; issue_datetime: string; message: string }>;

  const latestKp = kpRows[kpRows.length - 1]?.Kp ?? 0;
  const latestPlasma = getLatestNumericRow(plasmaRows);

  return {
    kpIndex: latestKp,
    solarWindSpeed: latestPlasma && latestPlasma.length >= 3 ? Number(latestPlasma[2]) || null : null,
    plasmaDensity: latestPlasma && latestPlasma.length >= 2 ? Number(latestPlasma[1]) || null : null,
    alerts: alertRows.slice(0, 8).map(alert => ({
      productId: alert.product_id,
      issuedAt: alert.issue_datetime,
      headline: parseAlertHeadline(alert.message),
      severity: parseAlertSeverity(alert.message),
      message: alert.message,
    })),
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchSolarWeather(): Promise<SolarWeatherSnapshot> {
  return breaker.execute(fetchFreshSolarWeather, {
    kpIndex: 0,
    solarWindSpeed: null,
    plasmaDensity: null,
    alerts: [],
    fetchedAt: new Date(0).toISOString(),
  });
}
