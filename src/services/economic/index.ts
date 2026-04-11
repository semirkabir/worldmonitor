/**
 * Unified economic service module -- replaces three legacy services:
 *   - src/services/fred.ts (FRED economic data)
 *   - src/services/oil-analytics.ts (EIA energy data)
 *   - src/services/worldbank.ts (World Bank indicators)
 *
 * All data now flows through the EconomicServiceClient RPC.
 */

import {
  EconomicServiceClient,
  ApiError,
  type GetFredSeriesResponse,
  type GetFredSeriesBatchResponse,
  type ListWorldBankIndicatorsResponse,
  type WorldBankCountryData as ProtoWorldBankCountryData,
  type GetEnergyPricesResponse,
  type EnergyPrice as ProtoEnergyPrice,
  type GetEnergyCapacityResponse,
  type GetBisPolicyRatesResponse,
  type GetBisExchangeRatesResponse,
  type GetBisCreditResponse,
  type BisPolicyRate,
  type BisExchangeRate,
  type BisCreditToGdp,
} from '@/generated/client/worldmonitor/economic/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import { getCSSColor } from '@/utils';
import { isFeatureAvailable } from '../runtime-config';
import { dataFreshness } from '../data-freshness';
import { getHydratedData } from '@/services/bootstrap';

// ---- Client + Circuit Breakers ----

const client = new EconomicServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });
const wbBreakers = new Map<string, ReturnType<typeof createCircuitBreaker<ListWorldBankIndicatorsResponse>>>();

function getWbBreaker(indicatorCode: string) {
  if (!wbBreakers.has(indicatorCode)) {
    wbBreakers.set(indicatorCode, createCircuitBreaker<ListWorldBankIndicatorsResponse>({
      name: `WB:${indicatorCode}`,
      cacheTtlMs: 30 * 60 * 1000,
      persistCache: true,
    }));
  }
  return wbBreakers.get(indicatorCode)!;
}
const eiaBreaker = createCircuitBreaker<GetEnergyPricesResponse>({ name: 'EIA Energy', cacheTtlMs: 15 * 60 * 1000, persistCache: true });
const capacityBreaker = createCircuitBreaker<GetEnergyCapacityResponse>({ name: 'EIA Capacity', cacheTtlMs: 30 * 60 * 1000, persistCache: true });

const bisPolicyBreaker = createCircuitBreaker<GetBisPolicyRatesResponse>({ name: 'BIS Policy', cacheTtlMs: 30 * 60 * 1000, persistCache: true });
const bisEerBreaker = createCircuitBreaker<GetBisExchangeRatesResponse>({ name: 'BIS EER', cacheTtlMs: 30 * 60 * 1000, persistCache: true });
const bisCreditBreaker = createCircuitBreaker<GetBisCreditResponse>({ name: 'BIS Credit', cacheTtlMs: 30 * 60 * 1000, persistCache: true });

const emptyFredBatchFallback: GetFredSeriesBatchResponse = { results: {}, fetched: 0, requested: 0 };
const fredBatchBreaker = createCircuitBreaker<GetFredSeriesBatchResponse>({ name: 'FRED Batch', cacheTtlMs: 15 * 60 * 1000, persistCache: true });
const emptyWbFallback: ListWorldBankIndicatorsResponse = { data: [], pagination: undefined };
const emptyEiaFallback: GetEnergyPricesResponse = { prices: [] };
const emptyCapacityFallback: GetEnergyCapacityResponse = { series: [] };
const emptyBisPolicyFallback: GetBisPolicyRatesResponse = { rates: [] };
const emptyBisEerFallback: GetBisExchangeRatesResponse = { rates: [] };
const emptyBisCreditFallback: GetBisCreditResponse = { entries: [] };

// ========================================================================
// FRED -- replaces src/services/fred.ts
// ========================================================================

export interface FredSeries {
  id: string;
  name: string;
  value: number | null;
  previousValue: number | null;
  change: number | null;
  changePercent: number | null;
  date: string;
  unit: string;
}

interface FredConfig {
  id: string;
  name: string;
  unit: string;
  precision: number;
}

const FRED_SERIES: FredConfig[] = [
  { id: 'WALCL', name: 'Fed Total Assets', unit: '$B', precision: 0 },
  { id: 'FEDFUNDS', name: 'Fed Funds Rate', unit: '%', precision: 2 },
  { id: 'T10Y2Y', name: '10Y-2Y Spread', unit: '%', precision: 2 },
  { id: 'UNRATE', name: 'Unemployment', unit: '%', precision: 1 },
  { id: 'CPIAUCSL', name: 'CPI Index', unit: '', precision: 1 },
  { id: 'DGS10', name: '10Y Treasury', unit: '%', precision: 2 },
  { id: 'VIXCLS', name: 'VIX', unit: '', precision: 2 },
  // Expanded economic indicators
  { id: 'CPILFESL', name: 'Core CPI', unit: '', precision: 1 },
  { id: 'PCEPI', name: 'PCE Price Index', unit: '', precision: 1 },
  { id: 'PCEPILFE', name: 'Core PCE', unit: '', precision: 1 },
  { id: 'GDPC1', name: 'Real GDP', unit: '$B', precision: 0 },
  { id: 'PAYEMS', name: 'Nonfarm Payrolls', unit: 'K', precision: 0 },
  { id: 'JTSJOL', name: 'JOLTS Job Openings', unit: 'K', precision: 0 },
  { id: 'RSAFS', name: 'Retail Sales', unit: '$M', precision: 0 },
  { id: 'INDPRO', name: 'Industrial Production', unit: '', precision: 1 },
  { id: 'UMCSENT', name: 'Consumer Sentiment', unit: '', precision: 1 },
  { id: 'MORTGAGE30US', name: '30Y Mortgage', unit: '%', precision: 2 },
];

export async function fetchFredData(): Promise<FredSeries[]> {
  if (!isFeatureAvailable('economicFred')) return [];

  const resp = await fredBatchBreaker.execute(async () => {
    try {
      return await client.getFredSeriesBatch(
        { seriesIds: FRED_SERIES.map((c) => c.id), limit: 120 },
        { signal: AbortSignal.timeout(30_000) },
      );
    } catch (err: unknown) {
      // 404 deploy-skew fallback: batch endpoint not yet deployed, use per-item calls
      if (err instanceof ApiError && err.statusCode === 404) {
        const items = await Promise.all(FRED_SERIES.map((c) =>
          client.getFredSeries({ seriesId: c.id, limit: 120 }, { signal: AbortSignal.timeout(20_000) })
            .catch(() => ({ series: undefined }) as GetFredSeriesResponse),
        ));
        const fallbackResults: Record<string, NonNullable<GetFredSeriesResponse['series']>> = {};
        for (const item of items) {
          if (item.series) fallbackResults[item.series.seriesId] = item.series;
        }
        return { results: fallbackResults, fetched: Object.keys(fallbackResults).length, requested: FRED_SERIES.length };
      }
      throw err;
    }
  }, emptyFredBatchFallback);

  const out: FredSeries[] = [];
  for (const config of FRED_SERIES) {
    const series = resp.results[config.id];
    if (!series) continue;
    const obs = series.observations;
    if (!obs || obs.length === 0) continue;

    if (obs.length >= 2) {
      const latest = obs[obs.length - 1]!;
      const previous = obs[obs.length - 2]!;
      const change = latest.value - previous.value;
      const changePercent = (change / previous.value) * 100;
      let displayValue = latest.value;
      if (config.id === 'WALCL') displayValue = latest.value / 1000;

      out.push({
        id: config.id, name: config.name,
        value: Number(displayValue.toFixed(config.precision)),
        previousValue: Number(previous.value.toFixed(config.precision)),
        change: Number(change.toFixed(config.precision)),
        changePercent: Number(changePercent.toFixed(2)),
        date: latest.date, unit: config.unit,
      });
    } else {
      const latest = obs[0]!;
      let displayValue = latest.value;
      if (config.id === 'WALCL') displayValue = latest.value / 1000;
      out.push({
        id: config.id, name: config.name,
        value: Number(displayValue.toFixed(config.precision)),
        previousValue: null, change: null, changePercent: null,
        date: latest.date, unit: config.unit,
      });
    }
  }
  return out;
}

export function getFredStatus(): string {
  return fredBatchBreaker.getStatus();
}

export function getChangeClass(change: number | null): string {
  if (change === null) return '';
  if (change > 0) return 'positive';
  if (change < 0) return 'negative';
  return '';
}

export function formatChange(change: number | null, unit: string): string {
  if (change === null) return 'N/A';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change}${unit}`;
}

// ========================================================================
// Oil/Energy -- replaces src/services/oil-analytics.ts
// ========================================================================

export interface OilDataPoint {
  date: string;
  value: number;
  unit: string;
}

export interface OilMetric {
  id: string;
  name: string;
  description: string;
  current: number;
  previous: number;
  changePct: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  lastUpdated: string;
}

export interface OilAnalytics {
  wtiPrice: OilMetric | null;
  brentPrice: OilMetric | null;
  usProduction: OilMetric | null;
  usInventory: OilMetric | null;
  fetchedAt: Date;
}

function protoEnergyToOilMetric(proto: ProtoEnergyPrice): OilMetric {
  const change = proto.change;
  return {
    id: proto.commodity,
    name: proto.name,
    description: `${proto.name} price/volume`,
    current: proto.price,
    previous: change !== 0 ? proto.price / (1 + change / 100) : proto.price,
    changePct: Math.round(change * 10) / 10,
    unit: proto.unit,
    trend: change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'stable',
    lastUpdated: proto.priceAt ? new Date(proto.priceAt).toISOString() : new Date().toISOString(),
  };
}

export async function checkEiaStatus(): Promise<boolean> {
  if (!isFeatureAvailable('energyEia')) return false;
  try {
    const resp = await eiaBreaker.execute(async () => {
      return client.getEnergyPrices({ commodities: ['wti'] }, { signal: AbortSignal.timeout(20_000) });
    }, emptyEiaFallback);
    return resp.prices.length > 0;
  } catch {
    return false;
  }
}

export async function fetchOilAnalytics(): Promise<OilAnalytics> {
  const empty: OilAnalytics = {
    wtiPrice: null, brentPrice: null, usProduction: null, usInventory: null, fetchedAt: new Date(),
  };

  if (!isFeatureAvailable('energyEia')) return empty;

  try {
    const resp = await eiaBreaker.execute(async () => {
      return client.getEnergyPrices({ commodities: [] }, { signal: AbortSignal.timeout(20_000) }); // all commodities
    }, emptyEiaFallback);

    const byId = new Map<string, ProtoEnergyPrice>();
    for (const p of resp.prices) byId.set(p.commodity, p);

    const result: OilAnalytics = {
      wtiPrice: byId.has('wti') ? protoEnergyToOilMetric(byId.get('wti')!) : null,
      brentPrice: byId.has('brent') ? protoEnergyToOilMetric(byId.get('brent')!) : null,
      usProduction: byId.has('production') ? protoEnergyToOilMetric(byId.get('production')!) : null,
      usInventory: byId.has('inventory') ? protoEnergyToOilMetric(byId.get('inventory')!) : null,
      fetchedAt: new Date(),
    };

    const metricCount = [result.wtiPrice, result.brentPrice, result.usProduction, result.usInventory]
      .filter(Boolean).length;
    if (metricCount > 0) {
      dataFreshness.recordUpdate('oil', metricCount);
    }

    return result;
  } catch {
    dataFreshness.recordError('oil', 'Fetch failed');
    return empty;
  }
}

export function formatOilValue(value: number, unit: string): string {
  const v = Number(value);
  if (!Number.isFinite(v)) return '—';
  if (unit.includes('$')) return `$${v.toFixed(2)}`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toFixed(1);
}

export function getTrendIndicator(trend: OilMetric['trend']): string {
  switch (trend) {
    case 'up': return '\u25B2';
    case 'down': return '\u25BC';
    default: return '\u25CF';
  }
}

export function getTrendColor(trend: OilMetric['trend'], inverse = false): string {
  const upColor = inverse ? getCSSColor('--semantic-normal') : getCSSColor('--semantic-critical');
  const downColor = inverse ? getCSSColor('--semantic-critical') : getCSSColor('--semantic-normal');
  switch (trend) {
    case 'up': return upColor;
    case 'down': return downColor;
    default: return getCSSColor('--text-dim');
  }
}

// ========================================================================
// EIA Capacity -- installed generation capacity (solar, wind, coal)
// ========================================================================

export async function fetchEnergyCapacityRpc(
  energySources?: string[],
  years?: number,
): Promise<GetEnergyCapacityResponse> {
  if (!isFeatureAvailable('energyEia')) return emptyCapacityFallback;
  try {
    return await capacityBreaker.execute(async () => {
      return client.getEnergyCapacity({
        energySources: energySources ?? [],
        years: years ?? 0,
      }, { signal: AbortSignal.timeout(20_000) });
    }, emptyCapacityFallback);
  } catch {
    return emptyCapacityFallback;
  }
}

// ========================================================================
// World Bank -- replaces src/services/worldbank.ts
// ========================================================================

interface WbCountryDataPoint {
  year: string;
  value: number;
}

interface WbCountryData {
  code: string;
  name: string;
  values: WbCountryDataPoint[];
}

interface WbLatestValue {
  code: string;
  name: string;
  year: string;
  value: number;
}

export interface WorldBankResponse {
  indicator: string;
  indicatorName: string;
  metadata: { page: number; pages: number; total: number };
  byCountry: Record<string, WbCountryData>;
  latestByCountry: Record<string, WbLatestValue>;
  timeSeries: Array<{
    countryCode: string;
    countryName: string;
    year: string;
    value: number;
  }>;
}

const TECH_INDICATORS: Record<string, string> = {
  'IT.NET.USER.ZS': 'Internet Users (% of population)',
  'IT.CEL.SETS.P2': 'Mobile Subscriptions (per 100 people)',
  'IT.NET.BBND.P2': 'Fixed Broadband Subscriptions (per 100 people)',
  'IT.NET.SECR.P6': 'Secure Internet Servers (per million people)',
  'GB.XPD.RSDV.GD.ZS': 'R&D Expenditure (% of GDP)',
  'IP.PAT.RESD': 'Patent Applications (residents)',
  'IP.PAT.NRES': 'Patent Applications (non-residents)',
  'IP.TMK.TOTL': 'Trademark Applications',
  'TX.VAL.TECH.MF.ZS': 'High-Tech Exports (% of manufactured exports)',
  'BX.GSR.CCIS.ZS': 'ICT Service Exports (% of service exports)',
  'TM.VAL.ICTG.ZS.UN': 'ICT Goods Imports (% of total goods imports)',
  'SE.TER.ENRR': 'Tertiary Education Enrollment (%)',
  'SE.XPD.TOTL.GD.ZS': 'Education Expenditure (% of GDP)',
  'NY.GDP.MKTP.KD.ZG': 'GDP Growth (annual %)',
  'NY.GDP.PCAP.CD': 'GDP per Capita (current US$)',
  'NE.EXP.GNFS.ZS': 'Exports of Goods & Services (% of GDP)',
};

const MACRO_INDICATORS: Record<string, { label: string; unit: string; wbCode: string }> = {
  debtToGdp: { label: 'Debt to GDP', unit: '%', wbCode: 'GC.DOD.TOTL.GD.ZS' },
  cpi: { label: 'CPI', unit: '', wbCode: 'FP.CPI.TOTL.ZG' },
  gdpGrowth: { label: 'GDP Growth', unit: '%', wbCode: 'NY.GDP.MKTP.KD.ZG' },
  cdsSpreads: { label: 'CDS Spreads', unit: 'bps', wbCode: '' },
  fxReserves: { label: 'FX Reserves', unit: '$B', wbCode: 'FI.RES.TOTL.CD' },
  currentAccount: { label: 'Current Account', unit: '% of GDP', wbCode: 'BN.CAB.XOKA.GD.ZS' },
};

export interface MacroEconomicCard {
  key: string;
  label: string;
  value: string;
  year: string;
  trend: 'up' | 'down' | 'flat';
  available: boolean;
  /** Source-specific unavailability reason. */
  reason?: string;
}

export async function fetchCountryMacroData(countryCode: string): Promise<MacroEconomicCard[]> {
  const cards: MacroEconomicCard[] = [];

  const wbKeys = Object.entries(MACRO_INDICATORS)
    .filter(([, v]) => v.wbCode !== '')
    .map(([k, v]) => ({ key: k, ...v }));

  const results = await Promise.allSettled(
    wbKeys.map(async ({ key, wbCode, label, unit }) => {
      try {
        const resp = await getIndicatorData(wbCode, { countries: [countryCode], years: 3 });
        const latest = resp.latestByCountry?.[countryCode];
        if (latest && latest.value != null) {
          const values = resp.byCountry?.[countryCode]?.values ?? [];
          const prev = values.length > 1 ? values[values.length - 2]?.value : null;
          let trend: 'up' | 'down' | 'flat' = 'flat';
          if (prev != null) {
            const diff = latest.value - prev;
            trend = diff > 0.01 ? 'up' : diff < -0.01 ? 'down' : 'flat';
          }
          let displayValue: string;
          if (unit === '$B') {
            displayValue = `$${(latest.value / 1e9).toFixed(1)}B`;
          } else if (unit === '%') {
            displayValue = `${latest.value.toFixed(1)}%`;
          } else if (unit === '% of GDP') {
            displayValue = `${latest.value.toFixed(1)}%`;
          } else {
            displayValue = latest.value.toFixed(1);
          }
          return { key, label, value: displayValue, year: latest.year, trend, available: true };
        }
      } catch {
        // fall through
      }
      return { key, label, value: '—', year: '', trend: 'flat' as const, available: false, reason: 'No World Bank data for this country' };
    }),
  );

  for (const r of results) {
    if (r.status === 'fulfilled') cards.push(r.value);
  }

  // CDS spreads — not sourced from World Bank or any currently integrated provider
  cards.push({ key: 'cdsSpreads', label: 'CDS Spreads', value: '—', year: '', trend: 'flat', available: false, reason: 'No CDS data source configured' });

  // Sort to match the desired order
  const order = ['debtToGdp', 'cpi', 'gdpGrowth', 'cdsSpreads', 'fxReserves', 'currentAccount'];
  cards.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  return cards;
}

const TECH_COUNTRIES = [
  'USA', 'CHN', 'JPN', 'DEU', 'KOR', 'GBR', 'IND', 'ISR', 'SGP', 'TWN',
  'FRA', 'CAN', 'SWE', 'NLD', 'CHE', 'FIN', 'IRL', 'AUS', 'BRA', 'IDN',
  'ARE', 'SAU', 'QAT', 'BHR', 'EGY', 'TUR',
  'MYS', 'THA', 'VNM', 'PHL',
  'ESP', 'ITA', 'POL', 'CZE', 'DNK', 'NOR', 'AUT', 'BEL', 'PRT', 'EST',
  'MEX', 'ARG', 'CHL', 'COL',
  'ZAF', 'NGA', 'KEN',
];

export async function getAvailableIndicators(): Promise<{ indicators: Record<string, string>; defaultCountries: string[] }> {
  return { indicators: TECH_INDICATORS, defaultCountries: TECH_COUNTRIES };
}

function buildWorldBankResponse(
  indicator: string,
  records: ProtoWorldBankCountryData[],
): WorldBankResponse {
  const byCountry: Record<string, WbCountryData> = {};
  const latestByCountry: Record<string, WbLatestValue> = {};
  const timeSeries: WorldBankResponse['timeSeries'] = [];

  const indicatorName = records[0]?.indicatorName || TECH_INDICATORS[indicator] || indicator;

  for (const r of records) {
    const cc = r.countryCode;
    if (!cc) continue;

    const yearStr = String(r.year);

    if (!byCountry[cc]) {
      byCountry[cc] = { code: cc, name: r.countryName, values: [] };
    }
    byCountry[cc].values.push({ year: yearStr, value: r.value });

    if (!latestByCountry[cc] || yearStr > latestByCountry[cc].year) {
      latestByCountry[cc] = { code: cc, name: r.countryName, year: yearStr, value: r.value };
    }

    timeSeries.push({
      countryCode: cc,
      countryName: r.countryName,
      year: yearStr,
      value: r.value,
    });
  }

  // Sort values oldest first
  for (const c of Object.values(byCountry)) {
    c.values.sort((a, b) => a.year.localeCompare(b.year));
  }

  timeSeries.sort((a, b) => b.year.localeCompare(a.year) || a.countryCode.localeCompare(b.countryCode));

  return {
    indicator,
    indicatorName,
    metadata: { page: 1, pages: 1, total: records.length },
    byCountry,
    latestByCountry,
    timeSeries,
  };
}

export async function getIndicatorData(
  indicator: string,
  options: { countries?: string[]; years?: number } = {},
): Promise<WorldBankResponse> {
  const { countries, years = 5 } = options;

  const resp = await getWbBreaker(indicator).execute(async () => {
    return client.listWorldBankIndicators({
      indicatorCode: indicator,
      countryCode: countries?.join(';') || '',
      year: years,
      pageSize: 0,
      cursor: '',
    }, { signal: AbortSignal.timeout(20_000) });
  }, emptyWbFallback);

  return buildWorldBankResponse(indicator, resp.data);
}

export const INDICATOR_PRESETS = {
  digitalInfrastructure: [
    'IT.NET.USER.ZS',
    'IT.CEL.SETS.P2',
    'IT.NET.BBND.P2',
    'IT.NET.SECR.P6',
  ],
  innovation: [
    'GB.XPD.RSDV.GD.ZS',
    'IP.PAT.RESD',
    'IP.PAT.NRES',
  ],
  techTrade: [
    'TX.VAL.TECH.MF.ZS',
    'BX.GSR.CCIS.ZS',
  ],
  education: [
    'SE.TER.ENRR',
    'SE.XPD.TOTL.GD.ZS',
  ],
} as const;

export interface TechReadinessScore {
  country: string;
  countryName: string;
  score: number;
  rank: number;
  components: {
    internet: number | null;
    mobile: number | null;
    broadband: number | null;
    rdSpend: number | null;
  };
}

// Weights and normalize maxima match seed-wb-indicators.mjs exactly
const TR_WEIGHTS = { internet: 30, mobile: 15, broadband: 20, rdSpend: 35 };
const TR_MAX = { internet: 100, mobile: 150, broadband: 50, rdSpend: 5 };

function trNormalize(val: number | null | undefined, max: number): number | null {
  if (val == null) return null;
  return Math.min(100, (val / max) * 100);
}

async function computeTechReadinessFromWorldBank(countries?: string[]): Promise<TechReadinessScore[]> {
  const [internetResp, mobileResp, broadbandResp, rdResp] = await Promise.allSettled([
    getIndicatorData('IT.NET.USER.ZS', { years: 5 }),
    getIndicatorData('IT.CEL.SETS.P2', { years: 5 }),
    getIndicatorData('IT.NET.BBND.P2', { years: 5 }),
    getIndicatorData('GB.XPD.RSDV.GD.ZS', { years: 7 }),
  ]);

  const latest = (resp: PromiseSettledResult<WorldBankResponse>) =>
    resp.status === 'fulfilled' ? resp.value.latestByCountry : {};

  const iData = latest(internetResp);
  const mData = latest(mobileResp);
  const bData = latest(broadbandResp);
  const rData = latest(rdResp);

  const allCountries = new Set([
    ...Object.keys(iData), ...Object.keys(mData),
    ...Object.keys(bData), ...Object.keys(rData),
  ]);

  const scores: TechReadinessScore[] = [];
  for (const cc of allCountries) {
    if (countries && !countries.includes(cc)) continue;
    const components = {
      internet:  trNormalize(iData[cc]?.value ?? null, TR_MAX.internet),
      mobile:    trNormalize(mData[cc]?.value ?? null, TR_MAX.mobile),
      broadband: trNormalize(bData[cc]?.value ?? null, TR_MAX.broadband),
      rdSpend:   trNormalize(rData[cc]?.value ?? null, TR_MAX.rdSpend),
    };

    let totalWeight = 0, weightedSum = 0;
    for (const [key, weight] of Object.entries(TR_WEIGHTS)) {
      const val = components[key as keyof typeof components];
      if (val !== null) { weightedSum += val * weight; totalWeight += weight; }
    }
    if (totalWeight === 0) continue;

    const countryName = iData[cc]?.name || mData[cc]?.name || bData[cc]?.name || rData[cc]?.name || cc;
    scores.push({
      country: cc,
      countryName,
      score: Math.round((weightedSum / totalWeight) * 10) / 10,
      rank: 0,
      components,
    });
  }

  scores.sort((a, b) => b.score - a.score);
  scores.forEach((s, i) => { s.rank = i + 1; });
  return scores;
}

export async function getTechReadinessRankings(
  countries?: string[],
): Promise<TechReadinessScore[]> {
  // Fast path: bootstrap-hydrated data available on first page load
  const hydrated = getHydratedData('techReadiness') as TechReadinessScore[] | undefined;
  if (hydrated?.length && !countries) return hydrated;

  // Try the pre-computed seed key from bootstrap endpoint (Redis-backed)
  try {
    const resp = await fetch('/api/bootstrap?keys=techReadiness', {
      signal: AbortSignal.timeout(5_000),
    });
    if (resp.ok) {
      const { data } = (await resp.json()) as { data: { techReadiness?: TechReadinessScore[] } };
      if (data.techReadiness?.length) {
        const scores = countries
          ? data.techReadiness.filter(s => countries.includes(s.country))
          : data.techReadiness;
        return scores;
      }
    }
  } catch { /* fall through */ }

  // Last resort: compute on-demand from World Bank API (no Redis required)
  return computeTechReadinessFromWorldBank(countries);
}

export async function getCountryComparison(
  indicator: string,
  _countryCodes: string[],
): Promise<WorldBankResponse> {
  // All WB data is now pre-seeded by seed-wb-indicators.mjs.
  // This function is unused but kept for API compat.
  return {
    indicator,
    indicatorName: TECH_INDICATORS[indicator] || indicator,
    metadata: { page: 0, pages: 0, total: 0 },
    byCountry: {},
    latestByCountry: {},
    timeSeries: [],
  };
}

// ========================================================================
// BIS -- Central bank policy data
// ========================================================================

export type { BisPolicyRate, BisExchangeRate, BisCreditToGdp };

export interface BisData {
  policyRates: BisPolicyRate[];
  exchangeRates: BisExchangeRate[];
  creditToGdp: BisCreditToGdp[];
  fetchedAt: Date;
}

export async function fetchBisData(): Promise<BisData> {
  const empty: BisData = { policyRates: [], exchangeRates: [], creditToGdp: [], fetchedAt: new Date() };

  const hPolicy = getHydratedData('bisPolicy') as GetBisPolicyRatesResponse | undefined;
  const hEer = getHydratedData('bisExchange') as GetBisExchangeRatesResponse | undefined;
  const hCredit = getHydratedData('bisCredit') as GetBisCreditResponse | undefined;

  try {
    const [policy, eer, credit] = await Promise.all([
      hPolicy?.rates?.length ? Promise.resolve(hPolicy) : bisPolicyBreaker.execute(() => client.getBisPolicyRates({}, { signal: AbortSignal.timeout(20_000) }), emptyBisPolicyFallback),
      hEer?.rates?.length ? Promise.resolve(hEer) : bisEerBreaker.execute(() => client.getBisExchangeRates({}, { signal: AbortSignal.timeout(20_000) }), emptyBisEerFallback),
      hCredit?.entries?.length ? Promise.resolve(hCredit) : bisCreditBreaker.execute(() => client.getBisCredit({}, { signal: AbortSignal.timeout(20_000) }), emptyBisCreditFallback),
    ]);
    return {
      policyRates: policy.rates ?? [],
      exchangeRates: eer.rates ?? [],
      creditToGdp: credit.entries ?? [],
      fetchedAt: new Date(),
    };
  } catch {
    return empty;
  }
}
