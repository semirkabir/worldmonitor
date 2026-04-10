import type { CountryScore, ComponentScores } from './country-instability';
import { calculateCII, getPendingCoreIntelligenceSources, hasIntelligenceSignalsLoaded, setHasCachedScores } from './country-instability';
import {
  IntelligenceServiceClient,
  type GetRiskScoresResponse,
  type CiiScore,
  type StrategicRisk,
} from '@/generated/client/worldmonitor/intelligence/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import { getHydratedData } from '@/services/bootstrap';

// ---- Sebuf client ----

const client = new IntelligenceServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });

// ---- Legacy types (preserved for consumer compatibility) ----

export interface CachedCIIScore {
  code: string;
  name: string;
  score: number;
  level: 'low' | 'normal' | 'elevated' | 'high' | 'critical';
  trend: 'rising' | 'stable' | 'falling';
  change24h: number;
  components: ComponentScores;
  lastUpdated: string;
}

export interface CachedStrategicRisk {
  score: number;
  level: string;
  trend: string;
  lastUpdated: string;
  contributors: Array<{
    country: string;
    code: string;
    score: number;
    level: string;
  }>;
}

export interface CachedRiskScores {
  cii: CachedCIIScore[];
  strategicRisk: CachedStrategicRisk;
  protestCount: number;
  computedAt: string;
  cached: boolean;
}

// ---- Proto → legacy adapters ----

const TIER1_NAMES: Record<string, string> = {
  US: 'United States', RU: 'Russia', CN: 'China', UA: 'Ukraine', IR: 'Iran',
  IL: 'Israel', TW: 'Taiwan', KP: 'North Korea', SA: 'Saudi Arabia', TR: 'Turkey',
  PL: 'Poland', DE: 'Germany', FR: 'France', GB: 'United Kingdom', IN: 'India',
  PK: 'Pakistan', SY: 'Syria', YE: 'Yemen', MM: 'Myanmar', VE: 'Venezuela',
};

const TREND_REVERSE: Record<string, 'rising' | 'stable' | 'falling'> = {
  TREND_DIRECTION_RISING: 'rising',
  TREND_DIRECTION_STABLE: 'stable',
  TREND_DIRECTION_FALLING: 'falling',
};

const SEVERITY_REVERSE: Record<string, string> = {
  SEVERITY_LEVEL_HIGH: 'high',
  SEVERITY_LEVEL_MEDIUM: 'medium',
  SEVERITY_LEVEL_LOW: 'low',
};

function getScoreLevel(score: number): 'low' | 'normal' | 'elevated' | 'high' | 'critical' {
  if (score >= 70) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 40) return 'elevated';
  if (score >= 25) return 'normal';
  return 'low';
}

function toCachedCII(proto: CiiScore): CachedCIIScore {
  return {
    code: proto.region,
    name: TIER1_NAMES[proto.region] || proto.region,
    score: proto.combinedScore,
    level: getScoreLevel(proto.combinedScore),
    trend: TREND_REVERSE[proto.trend] || 'stable',
    change24h: proto.dynamicScore,
    components: {
      unrest: proto.components?.ciiContribution ?? 0,
      conflict: proto.components?.geoConvergence ?? 0,
      security: proto.components?.militaryActivity ?? 0,
      information: proto.components?.newsActivity ?? 0,
    },
    lastUpdated: proto.computedAt ? new Date(proto.computedAt).toISOString() : new Date().toISOString(),
  };
}

function toCachedStrategicRisk(risks: StrategicRisk[], ciiScores: CiiScore[]): CachedStrategicRisk {
  const global = risks[0];
  const ciiMap = new Map(ciiScores.map((s) => [s.region, s]));
  return {
    score: global?.score ?? 0,
    level: SEVERITY_REVERSE[global?.level ?? ''] || 'low',
    trend: TREND_REVERSE[global?.trend ?? ''] || 'stable',
    lastUpdated: new Date().toISOString(),
    contributors: (global?.factors ?? []).map((code) => {
      const cii = ciiMap.get(code);
      return {
        country: TIER1_NAMES[code] || code,
        code,
        score: cii?.combinedScore ?? 0,
        level: cii ? getScoreLevel(cii.combinedScore) : 'low',
      };
    }),
  };
}

export function toRiskScores(resp: GetRiskScoresResponse): CachedRiskScores {
  return {
    cii: resp.ciiScores.map(toCachedCII),
    strategicRisk: toCachedStrategicRisk(resp.strategicRisks, resp.ciiScores),
    protestCount: 0,
    computedAt: new Date().toISOString(),
    cached: true,
  };
}

// ---- Shape validator (localStorage is attacker-controlled) ----

const VALID_LEVELS = new Set(['low', 'normal', 'elevated', 'high', 'critical']);

function isValidCiiEntry(e: unknown): e is CachedCIIScore {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  return typeof o.code === 'string' && Number.isFinite(o.score) && VALID_LEVELS.has(o.level as string);
}

// ---- localStorage persistence (sync prime for getCachedScores) ----

const LS_KEY = 'wm:risk-scores';
const LS_MAX_STALENESS_MS = 24 * 60 * 60 * 1000;
const LIVE_CII_LS_KEY = 'wm:live-cii';
const LIVE_CII_MAX_STALENESS_MS = 6 * 60 * 60 * 1000;
let lastPreferredScoreLog = '';
let lastPersistedLiveFingerprint = '';

function loadFromStorage(): CachedRiskScores | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw);
    if (!Number.isFinite(savedAt) || !Array.isArray(data?.cii)) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    if (Date.now() - savedAt > LS_MAX_STALENESS_MS) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    if (!data.cii.every(isValidCiiEntry)) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function saveToStorage(data: CachedRiskScores): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ data, savedAt: Date.now() }));
  } catch { /* quota exceeded */ }
}

function toCachedCountryScore(score: CountryScore): CachedCIIScore {
  return {
    code: score.code,
    name: score.name,
    score: score.score,
    level: score.level,
    trend: score.trend,
    change24h: score.change24h,
    components: score.components,
    lastUpdated: score.lastUpdated.toISOString(),
  };
}

function loadPersistedLiveCountryScoresFromStorage(): CountryScore[] | null {
  try {
    const raw = localStorage.getItem(LIVE_CII_LS_KEY);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw) as { data?: CachedCIIScore[]; savedAt?: number };
    const savedAtMs = typeof savedAt === 'number' ? savedAt : NaN;
    if (!Number.isFinite(savedAtMs) || !Array.isArray(data)) {
      localStorage.removeItem(LIVE_CII_LS_KEY);
      return null;
    }
    if (Date.now() - savedAtMs > LIVE_CII_MAX_STALENESS_MS) {
      localStorage.removeItem(LIVE_CII_LS_KEY);
      return null;
    }
    if (!data.every(isValidCiiEntry)) {
      localStorage.removeItem(LIVE_CII_LS_KEY);
      return null;
    }
    return data.map(toCountryScore);
  } catch {
    return null;
  }
}

let persistedLiveCountryScores = loadPersistedLiveCountryScoresFromStorage();

export function getPersistedLiveCountryScores(): CountryScore[] {
  return persistedLiveCountryScores?.map((score) => ({
    ...score,
    components: { ...score.components },
    lastUpdated: new Date(score.lastUpdated),
  })) ?? [];
}

export function savePersistedLiveCountryScores(scores: CountryScore[]): void {
  if (scores.length === 0) return;
  const fingerprint = scores
    .slice(0, 25)
    .map((score) => `${score.code}:${score.score}:${score.change24h}`)
    .join('|');
  if (fingerprint === lastPersistedLiveFingerprint) return;
  lastPersistedLiveFingerprint = fingerprint;
  persistedLiveCountryScores = scores.map((score) => ({
    ...score,
    components: { ...score.components },
    lastUpdated: new Date(score.lastUpdated),
  }));
  try {
    localStorage.setItem(LIVE_CII_LS_KEY, JSON.stringify({
      data: scores.map(toCachedCountryScore),
      savedAt: Date.now(),
    }));
    console.debug('[CII] Persisted live local scores', { count: scores.length });
  } catch {
    // Ignore storage quota failures.
  }
}

// ---- Circuit breaker ----

const breaker = createCircuitBreaker<CachedRiskScores>({
  name: 'Risk Scores',
  cacheTtlMs: 5 * 60 * 1000, // 5 min
  persistCache: true,
});

// Sync prime from localStorage (before async IndexedDB hydration)
const stored = loadFromStorage();
if (stored && stored.cii.length > 0) {
  breaker.recordSuccess(stored);
  setHasCachedScores(true);
}

function emptyFallback(): CachedRiskScores {
  return {
    cii: [],
    strategicRisk: { score: 0, level: 'low', trend: 'stable', lastUpdated: new Date().toISOString(), contributors: [] },
    protestCount: 0,
    computedAt: new Date().toISOString(),
    cached: true,
  };
}

// ---- Abort helpers ----

function createAbortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function withCallerAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export async function fetchCachedRiskScores(signal?: AbortSignal): Promise<CachedRiskScores | null> {
  if (signal?.aborted) throw createAbortError();

  // Layer 1: Bootstrap hydration (one-time, only when breaker has no cached data)
  if (breaker.getCached() === null) {
    const hydrated = getHydratedData('riskScores') as GetRiskScoresResponse | undefined;
    if (hydrated?.ciiScores?.length) {
      const data = toRiskScores(hydrated);
      breaker.recordSuccess(data);
      saveToStorage(data);
      setHasCachedScores(true);
      return data;
    }
  }

  // Layer 2: Circuit breaker (in-memory cache → SWR → IndexedDB → RPC → fallback)
  const result = await withCallerAbort(
    breaker.execute(async () => {
      const resp = await client.getRiskScores({ region: '' });
      const data = toRiskScores(resp);
      saveToStorage(data);
      setHasCachedScores(true);
      return data;
    }, emptyFallback()),
    signal,
  );

  if (!result || !Array.isArray(result.cii) || result.cii.length === 0) {
    return null;
  }

  setHasCachedScores(true);
  return result;
}

export function getCachedScores(): CachedRiskScores | null {
  return breaker.getCached();
}

export function hasCachedScores(): boolean {
  return breaker.getCached() !== null;
}

export function toCountryScore(cached: CachedCIIScore): CountryScore {
  return {
    code: cached.code,
    name: cached.name,
    score: cached.score,
    level: cached.level,
    trend: cached.trend,
    change24h: cached.change24h,
    components: cached.components,
    lastUpdated: new Date(cached.lastUpdated),
  };
}

export function getPreferredCountryScores(): CountryScore[] {
  if (!hasIntelligenceSignalsLoaded()) {
    const persistedLive = getPersistedLiveCountryScores();
    if (persistedLive.length > 0) {
      const pendingSources = getPendingCoreIntelligenceSources();
      const logKey = `persisted-live:${pendingSources.join(',')}`;
      if (lastPreferredScoreLog !== logKey) {
        lastPreferredScoreLog = logKey;
        console.debug('[CII] Using persisted live local scores while core feeds settle', { pendingSources });
      }
      return persistedLive;
    }
    const cached = getCachedScores();
    if (cached?.cii.length) {
      const pendingSources = getPendingCoreIntelligenceSources();
      const logKey = `cached:${pendingSources.join(',')}`;
      if (lastPreferredScoreLog !== logKey) {
        lastPreferredScoreLog = logKey;
        console.debug('[CII] Using cached scores while core feeds settle', { pendingSources });
      }
      return cached.cii.map(toCountryScore);
    }
  }
  if (lastPreferredScoreLog !== 'live') {
    lastPreferredScoreLog = 'live';
    console.debug('[CII] Using live calculated scores', {
      pendingSources: getPendingCoreIntelligenceSources(),
    });
  }
  return calculateCII();
}

export function getPreferredCountryScore(code: string): CountryScore | null {
  return getPreferredCountryScores().find((score) => score.code === code) ?? null;
}
