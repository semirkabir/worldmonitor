import {
  PredictionServiceClient,
  type GetPredictionMarketDetailResponse,
} from '@/generated/client/worldmonitor/prediction/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import { SITE_VARIANT } from '@/config';
import { isDesktopRuntime } from '@/services/runtime';
import { tryInvokeTauri } from '@/services/tauri-bridge';
import { getHydratedData } from '@/services/bootstrap';

// Consumer-friendly type (re-export, matches legacy shape)
export interface PredictionMarket {
  title: string;
  yesPrice: number;     // 0-100 scale (legacy compat)
  volume?: number;
  url?: string;
  endDate?: string;
  slug?: string;
}

function parseEndDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? raw : undefined;
}

function isExpired(endDate?: string): boolean {
  if (!endDate) return false;
  const ms = Date.parse(endDate);
  return Number.isFinite(ms) && ms < Date.now();
}

// Internal Gamma API interfaces
interface PolymarketMarket {
  question: string;
  outcomes?: string;
  outcomePrices?: string;
  volume?: string;
  volumeNum?: number;
  closed?: boolean;
  slug?: string;
  endDate?: string;
   description?: string;
   resolution_source?: string;
   liquidity?: number | string;
   liquidityNum?: number;
   eventSlug?: string;
   event_slug?: string;
   eventId?: string | number;
   event_id?: string | number;
   conditionId?: string;
   condition_id?: string;
   clobTokenIds?: string[] | string;
   id?: string | number;
   tags?: Array<{ label?: string; slug?: string }>;
}

interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  volume?: number;
  liquidity?: number;
  markets?: PolymarketMarket[];
  tags?: Array<{ slug: string }>;
  closed?: boolean;
  endDate?: string;
}

// Internal constants and state
const GAMMA_API = 'https://gamma-api.polymarket.com';

// Polymarket proxy URL (Vercel server route injects Railway secret server-side)
const POLYMARKET_PROXY_URL = '/api/polymarket';
const wsRelayUrl = import.meta.env.VITE_WS_RELAY_URL || '';
const DIRECT_RAILWAY_POLY_URL = wsRelayUrl
  ? wsRelayUrl.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/$/, '') + '/polymarket'
  : '';
const isLocalhostRuntime = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const PROXY_STRIP_KEYS = new Set(['end_date_min', 'active', 'archived']);

const breaker = createCircuitBreaker<PredictionMarket[]>({ name: 'Polymarket', cacheTtlMs: 10 * 60 * 1000, persistCache: true });

// Sebuf client for strategy 4
const client = new PredictionServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });

export type PredictionMarketDetailResponse = GetPredictionMarketDetailResponse;

export async function getPredictionMarketDetail(
  slug: string,
  options?: { bookDepth?: number; tradeLimit?: number; refresh?: boolean; signal?: AbortSignal },
): Promise<PredictionMarketDetailResponse | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  try {
    const response = await client.getPredictionMarketDetail({
      slug: trimmed,
      bookDepth: options?.bookDepth ?? 10,
      tradeLimit: options?.tradeLimit ?? 20,
      refresh: options?.refresh ?? false,
    }, { signal: options?.signal });
    if (response?.market) {
      const tokenId = response.market.tokenIds?.[0] || '';
      if (tokenId) {
        const history = await fetchBroadPriceHistory(tokenId, options?.signal);
        if (history.length > 0) {
          return { ...response, history };
        }
      }
      return response;
    }
  } catch (error) {
    console.warn(`[Polymarket] getPredictionMarketDetail(${trimmed}) failed:`, error);
  }
  return buildPredictionMarketDetailFallback(trimmed, options);
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeTokenIds(raw?: string[] | string): string[] {
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0) : [];
  } catch {
    return [];
  }
}

function parseEpochMillis(value: unknown): number {
  const parsed = parseNumber(value);
  if (!parsed) return 0;
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (!response.ok) return null;
    return response.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function fetchBroadPriceHistory(tokenId: string, signal?: AbortSignal): Promise<Array<{ timestamp: number; price: number }>> {
  const urls = [
    `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tokenId)}&interval=max&fidelity=60`,
    `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tokenId)}&interval=1w&fidelity=1`,
    `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tokenId)}&interval=1d&fidelity=1`,
    `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tokenId)}&interval=6h&fidelity=1`,
    `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tokenId)}&interval=1h&fidelity=1`,
  ];

  const results = await Promise.all(urls.map((url) => fetchJson<{ history?: Array<{ t?: number; p?: number }> }>(url, signal)));
  const merged = new Map<number, number>();

  for (const historyData of results) {
    for (const point of historyData?.history || []) {
      if (!Number.isFinite(point?.t) || !Number.isFinite(point?.p)) continue;
      merged.set(parseEpochMillis(point.t as number), point.p as number);
    }
  }

  return [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, price]) => ({ timestamp, price }));
}

async function buildPredictionMarketDetailFallback(
  slug: string,
  options?: { bookDepth?: number; tradeLimit?: number; refresh?: boolean; signal?: AbortSignal },
): Promise<PredictionMarketDetailResponse | null> {
  const marketRows = await polyFetch('markets', { slug });
  if (!marketRows.ok) return null;
  const data: PolymarketMarket[] = await marketRows.json();
  const market = data[0];
  if (!market) return null;

  const tokenIds = normalizeTokenIds(market.clobTokenIds);
  const tokenId = tokenIds[0] || '';
  const conditionId = market.conditionId || market.condition_id || '';
  const marketId = String(market.id || '');
  const bookDepth = Math.max(1, Math.min(25, options?.bookDepth ?? 10));
  const tradeLimit = Math.max(1, Math.min(100, options?.tradeLimit ?? 20));
  const prices = market.outcomePrices ? JSON.parse(market.outcomePrices) as string[] : [];
  const yesPrice = prices[0] != null ? parseFloat(prices[0]) : 0.5;
  const noPrice = Math.max(0, Math.min(1, 1 - yesPrice));

  const [bookData, midpointData, bestAskData, bestBidData, spreadData, historyData, lastTradeData, tradesData, holdersData, commentsData] = await Promise.all([
    tokenId ? fetchJson<{ bids?: Array<{ price?: string | number; size?: string | number }>; asks?: Array<{ price?: string | number; size?: string | number }>; tick_size?: string; min_order_size?: string; hash?: string; timestamp?: string | number; }>(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`, options?.signal) : Promise.resolve(null),
    tokenId ? fetchJson<{ mid?: string | number }>(`https://clob.polymarket.com/midpoint?token_id=${encodeURIComponent(tokenId)}`, options?.signal) : Promise.resolve(null),
    tokenId ? fetchJson<{ price?: string | number }>(`https://clob.polymarket.com/price?token_id=${encodeURIComponent(tokenId)}&side=BUY`, options?.signal) : Promise.resolve(null),
    tokenId ? fetchJson<{ price?: string | number }>(`https://clob.polymarket.com/price?token_id=${encodeURIComponent(tokenId)}&side=SELL`, options?.signal) : Promise.resolve(null),
    tokenId ? fetchJson<{ spread?: string | number }>(`https://clob.polymarket.com/spread?token_id=${encodeURIComponent(tokenId)}`, options?.signal) : Promise.resolve(null),
    tokenId ? fetchBroadPriceHistory(tokenId, options?.signal) : Promise.resolve([]),
    tokenId ? fetchJson<{ price?: string | number; side?: string }>(`https://clob.polymarket.com/last-trade-price?token_id=${encodeURIComponent(tokenId)}`, options?.signal) : Promise.resolve(null),
    conditionId ? fetchJson<Array<{ side?: string; size?: number; price?: number; timestamp?: number }>>(`https://data-api.polymarket.com/trades?market=${encodeURIComponent(conditionId)}&limit=${tradeLimit}&offset=0&takerOnly=true`, options?.signal) : Promise.resolve(null),
    conditionId ? fetchJson<Array<{ holders?: Array<{ proxyWallet?: string; amount?: number; outcomeIndex?: number; name?: string; pseudonym?: string; profileImage?: string }> }>>(`https://data-api.polymarket.com/holders?market=${encodeURIComponent(conditionId)}&limit=5`, options?.signal) : Promise.resolve(null),
    marketId ? fetchJson<Array<{ body?: string; createdAt?: string; reactionCount?: number; userAddress?: string; profile?: { name?: string; pseudonym?: string; profileImage?: string } }>>(`${GAMMA_API}/comments?parent_entity_type=market&parent_entity_id=${encodeURIComponent(marketId)}&limit=10&order=createdAt&ascending=false`, options?.signal) : Promise.resolve(null),
  ]);

  return {
    market: {
      slug: market.slug || slug,
      title: market.question,
      url: buildMarketUrl(market.eventSlug || market.event_slug, market.slug) || `https://polymarket.com/market/${slug}`,
      category: market.tags?.[0]?.label || market.tags?.[0]?.slug || '',
      eventId: String(market.eventId || market.event_id || ''),
      eventSlug: market.eventSlug || market.event_slug || '',
      marketId,
      conditionId,
      tokenIds,
      closed: Boolean(market.closed),
      closesAt: market.endDate ? Date.parse(market.endDate) : 0,
      description: market.description || '',
      resolutionSource: market.resolution_source || '',
      volume: market.volumeNum ?? (market.volume ? parseFloat(market.volume) : 0),
      liquidity: parseNumber(market.liquidityNum ?? market.liquidity),
    },
    pricing: {
      yesPrice,
      noPrice,
      midpoint: parseNumber(midpointData?.mid, yesPrice),
      bestBid: parseNumber(bestBidData?.price),
      bestAsk: parseNumber(bestAskData?.price),
      spread: parseNumber(spreadData?.spread),
      lastTradePrice: parseNumber(lastTradeData?.price, yesPrice),
      lastTradeSide: lastTradeData?.side || '',
    },
    orderBook: {
      bids: (bookData?.bids || []).slice(0, bookDepth).map((row) => ({ price: parseNumber(row.price), size: parseNumber(row.size) })),
      asks: (bookData?.asks || []).slice(0, bookDepth).map((row) => ({ price: parseNumber(row.price), size: parseNumber(row.size) })),
      tickSize: bookData?.tick_size || '',
      minOrderSize: bookData?.min_order_size || '',
      hash: bookData?.hash || '',
      updatedAt: parseEpochMillis(bookData?.timestamp),
    },
    recentTrades: (tradesData || []).slice(0, tradeLimit).map((trade) => ({
      price: parseNumber(trade.price),
      size: parseNumber(trade.size),
      side: trade.side || '',
      timestamp: parseEpochMillis(trade.timestamp),
    })),
    history: historyData,
    holders: (holdersData?.[0]?.holders || []).map((holder) => ({
      address: holder.proxyWallet || '',
      label: holder.name || holder.pseudonym || `${holder.proxyWallet?.slice(0, 6) ?? ''}…${holder.proxyWallet?.slice(-4) ?? ''}`,
      profileImage: holder.profileImage || '',
      shares: parseNumber(holder.amount),
      value: parseNumber(holder.amount) * (holder.outcomeIndex === 0 ? yesPrice : noPrice),
      side: holder.outcomeIndex === 0 ? 'yes' : 'no',
    })),
    comments: (commentsData || []).filter((comment) => Boolean(comment.body)).map((comment) => ({
      author: comment.profile?.name || comment.profile?.pseudonym || 'Anonymous',
      text: comment.body || '',
      profileImage: comment.profile?.profileImage || '',
      userAddress: comment.userAddress || '',
      likes: comment.reactionCount || 0,
      createdAt: comment.createdAt ? Date.parse(comment.createdAt) : 0,
    })),
  };
}

// Track whether direct browser->Polymarket fetch works
// Cloudflare blocks server-side TLS but browsers pass JA3 fingerprint checks
let directFetchWorks: boolean | null = null;
let directFetchProbe: Promise<boolean> | null = null;
async function probeDirectFetchCapability(): Promise<boolean> {
  if (directFetchWorks !== null) return directFetchWorks;
  if (!directFetchProbe) {
    directFetchProbe = fetch(`${GAMMA_API}/events?closed=false&active=true&archived=false&order=volume&ascending=false&limit=1`, {
      headers: { 'Accept': 'application/json' },
    })
      .then(resp => {
        directFetchWorks = resp.ok;
        return directFetchWorks;
      })
      .catch(() => {
        directFetchWorks = false;
        return false;
      })
      .finally(() => {
        directFetchProbe = null;
      });
  }
  return directFetchProbe;
}

async function polyFetch(endpoint: 'events' | 'markets', params: Record<string, string>): Promise<Response> {
  const qs = new URLSearchParams(params).toString();

  // Probe direct connectivity once before parallel tag fanout to avoid reset storms.
  const canUseDirect = directFetchWorks === true || (directFetchWorks === null && await probeDirectFetchCapability());
  if (canUseDirect) {
    try {
      const resp = await fetch(`${GAMMA_API}/${endpoint}?${qs}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (resp.ok) {
        directFetchWorks = true;
        return resp;
      }
    } catch {
      directFetchWorks = false;
    }
  }

  // Desktop: use Tauri Rust command (native TLS bypasses Cloudflare JA3 blocking)
  if (isDesktopRuntime()) {
    try {
      const body = await tryInvokeTauri<string>('fetch_polymarket', { path: endpoint, params: qs });
      if (body) {
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch { /* Tauri command failed, fall through to proxy */ }
  }

  const proxyParams: Record<string, string> = { endpoint };
  for (const [k, v] of Object.entries(params)) {
    if (PROXY_STRIP_KEYS.has(k)) continue;
    proxyParams[k === 'tag_slug' ? 'tag' : k] = v;
  }
  const proxyQs = new URLSearchParams(proxyParams).toString();

  // Try Vercel proxy first; it forwards to Railway with server-side auth headers.
  try {
    const resp = await fetch(`${POLYMARKET_PROXY_URL}?${proxyQs}`);
    if (resp.ok) {
      const data = await resp.clone().json();
      if (Array.isArray(data) && data.length > 0) return resp;
    }
  } catch { /* Proxy unavailable */ }

  // Local development fallback: allow direct Railway requests.
  if (isLocalhostRuntime && DIRECT_RAILWAY_POLY_URL) {
    try {
      const resp = await fetch(`${DIRECT_RAILWAY_POLY_URL}?${proxyQs}`);
      if (resp.ok) {
        const data = await resp.clone().json();
        if (Array.isArray(data) && data.length > 0) return resp;
      }
    } catch { /* Railway unavailable */ }
  }

  // Strategy 4: sebuf handler via generated client
  try {
    const resp = await client.listPredictionMarkets({
      category: params.tag_slug ?? '',
      query: '',
      pageSize: parseInt(params.limit ?? '50', 10),
      cursor: '',
    });
    if (resp.markets && resp.markets.length > 0) {
      // Convert proto PredictionMarket[] to Gamma-compatible Response
      // so downstream parsing works uniformly.
      // Proto yesPrice is 0-1; outcomePrices will be parsed by parseMarketPrice
      // which multiplies by 100, resulting in the correct 0-100 scale output.
      const gammaData = resp.markets.map(m => ({
        question: m.title,
        outcomePrices: JSON.stringify([String(m.yesPrice), String(1 - m.yesPrice)]),
        volumeNum: m.volume,
        slug: extractMarketSlug(m.url) || m.id,
        endDate: m.closesAt ? new Date(m.closesAt).toISOString() : undefined,
      }));
      return new Response(JSON.stringify(endpoint === 'events'
        ? [{ id: 'sebuf', title: gammaData[0]?.question, slug: '', volume: 0, markets: gammaData }]
        : gammaData
      ), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  } catch { /* sebuf handler failed (Cloudflare expected) */ }

  // Final fallback: same-origin proxy
  return fetch(`${POLYMARKET_PROXY_URL}?${proxyQs}`);
}

const GEOPOLITICAL_TAGS = [
  'politics', 'geopolitics', 'elections', 'world',
  'ukraine', 'china', 'middle-east', 'europe',
  'economy', 'fed', 'inflation',
];

const TECH_TAGS = [
  'ai', 'tech', 'crypto', 'science',
  'elon-musk', 'business', 'economy',
];

const EXCLUDE_KEYWORDS = [
  'nba', 'nfl', 'mlb', 'nhl', 'fifa', 'world cup', 'super bowl', 'championship',
  'playoffs', 'oscar', 'grammy', 'emmy', 'box office', 'movie', 'album', 'song',
  'streamer', 'influencer', 'celebrity', 'kardashian',
  'bachelor', 'reality tv', 'mvp', 'touchdown', 'home run', 'goal scorer',
  'academy award', 'bafta', 'golden globe', 'cannes', 'sundance',
  'documentary', 'feature film', 'tv series', 'season finale',
];

function isExcluded(title: string): boolean {
  const lower = title.toLowerCase();
  return EXCLUDE_KEYWORDS.some(kw => lower.includes(kw));
}

function parseMarketPrice(market: PolymarketMarket): number {
  try {
    const pricesStr = market.outcomePrices;
    if (pricesStr) {
      const prices: string[] = JSON.parse(pricesStr);
      if (prices.length >= 1) {
        const parsed = parseFloat(prices[0]!);
        if (!isNaN(parsed)) return parsed * 100;
      }
    }
  } catch { /* keep default */ }
  return 50;
}

function buildMarketUrl(eventSlug?: string, marketSlug?: string): string | undefined {
  if (eventSlug && marketSlug) return `https://polymarket.com/event/${eventSlug}/${marketSlug}`;
  if (marketSlug) return `https://polymarket.com/market/${marketSlug}`;
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;
  return undefined;
}

function extractMarketSlug(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, 'https://polymarket.com');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'market' && parts[1]) return parts[1];
    if (parts[0] === 'event' && parts[2]) return parts[2];
  } catch {
    return value;
  }
  return undefined;
}

async function fetchEventsByTag(tag: string, limit = 30): Promise<PolymarketEvent[]> {
  const response = await polyFetch('events', {
    tag_slug: tag,
    closed: 'false',
    active: 'true',
    archived: 'false',
    end_date_min: new Date().toISOString(),
    order: 'volume',
    ascending: 'false',
    limit: String(limit),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function fetchTopMarkets(): Promise<PredictionMarket[]> {
  const response = await polyFetch('markets', {
    closed: 'false',
    active: 'true',
    archived: 'false',
    end_date_min: new Date().toISOString(),
    order: 'volume',
    ascending: 'false',
    limit: '100',
  });
  if (!response.ok) return [];
  const data: PolymarketMarket[] = await response.json();

  return data
    .filter(m => m.question && !isExcluded(m.question))
    .map(m => {
      const yesPrice = parseMarketPrice(m);
      const volume = m.volumeNum ?? (m.volume ? parseFloat(m.volume) : 0);
      return {
        title: m.question,
        yesPrice,
        volume,
        url: buildMarketUrl(undefined, m.slug),
        endDate: parseEndDate(m.endDate),
        slug: m.slug,
      };
    });
}

export async function fetchMarketDetails(slug: string): Promise<{ description?: string; resolutionSource?: string; liquidity?: number } | null> {
  try {
    const response = await polyFetch('markets', { slug });
    if (!response.ok) return null;
    const data: PolymarketMarket[] = await response.json();
    if (!data || data.length === 0) return null;
    const market = data[0] as unknown as { description?: string; resolution_source?: string; liquidityNum?: number };
    return {
      description: market.description,
      resolutionSource: market.resolution_source,
      liquidity: market.liquidityNum
    };
  } catch (e) {
    console.warn(`Failed to fetch details for market ${slug}:`, e);
    return null;
  }
}

interface BootstrapPredictionData {
  geopolitical: PredictionMarket[];
  tech: PredictionMarket[];
  fetchedAt: number;
}

function normalizePredictionMarket(market: PredictionMarket): PredictionMarket {
  const slug = market.slug || extractMarketSlug(market.url);
  const url = slug
    ? (market.url?.includes('/event/') || market.url?.includes('/market/') ? market.url : buildMarketUrl(undefined, slug))
    : market.url;
  return {
    ...market,
    slug,
    url,
  };
}

export async function fetchPredictions(): Promise<PredictionMarket[]> {
  return breaker.execute(async () => {
    // Strategy 1: Bootstrap hydration (zero network cost — data arrived with page load)
    const hydrated = getHydratedData('predictions') as BootstrapPredictionData | undefined;
    if (hydrated && hydrated.fetchedAt && Date.now() - hydrated.fetchedAt < 20 * 60 * 1000) {
      const variant = SITE_VARIANT === 'tech' ? hydrated.tech : hydrated.geopolitical;
      if (variant && variant.length > 0) {
        return variant.map(normalizePredictionMarket).slice(0, 15);
      }
    }

    // Strategy 2: Sebuf RPC (single request to Vercel → Redis, no Polymarket fan-out)
    try {
      const tags = SITE_VARIANT === 'tech' ? TECH_TAGS : GEOPOLITICAL_TAGS;
      const rpcResults = await client.listPredictionMarkets({
        category: tags[0] ?? '',
        query: '',
        pageSize: 50,
        cursor: '',
      });
      if (rpcResults.markets && rpcResults.markets.length > 0) {
        return rpcResults.markets
          .filter(m => !isExpired(m.closesAt ? new Date(m.closesAt).toISOString() : undefined))
          .map(m => ({
            title: m.title,
            yesPrice: m.yesPrice * 100,
            volume: m.volume,
            url: m.url,
            endDate: m.closesAt ? new Date(m.closesAt).toISOString() : undefined,
            slug: extractMarketSlug(m.url) || m.id,
          }))
          .slice(0, 15);
      }
    } catch { /* RPC failed, fall through to direct fetch */ }

    // Strategy 3: Direct fan-out (legacy — only used when bootstrap + RPC both fail)
    const tags = SITE_VARIANT === 'tech' ? TECH_TAGS : GEOPOLITICAL_TAGS;
    const eventResults = await Promise.all(tags.map(tag => fetchEventsByTag(tag, 20)));

    const seen = new Set<string>();
    const markets: PredictionMarket[] = [];

    for (const events of eventResults) {
      for (const event of events) {
        if (event.closed || seen.has(event.id)) continue;
        seen.add(event.id);

        if (isExcluded(event.title)) continue;

        const eventVolume = event.volume ?? 0;
        if (eventVolume < 1000) continue;

        if (event.markets && event.markets.length > 0) {
          const activeCandidates = event.markets.filter(m =>
            !m.closed && !isExpired(m.endDate)
          );
          if (activeCandidates.length === 0) continue;

          const topMarket = activeCandidates.reduce((best, m) => {
            const vol = m.volumeNum ?? (m.volume ? parseFloat(m.volume) : 0);
            const bestVol = best.volumeNum ?? (best.volume ? parseFloat(best.volume) : 0);
            return vol > bestVol ? m : best;
          });

          markets.push({
            title: topMarket.question || event.title,
            yesPrice: parseMarketPrice(topMarket),
            volume: eventVolume,
            url: buildMarketUrl(event.slug, topMarket.slug),
            endDate: parseEndDate(topMarket.endDate ?? event.endDate),
            slug: topMarket.slug,
          });
        } else {
          markets.push({
            title: event.title,
            yesPrice: 50,
            volume: eventVolume,
            url: buildMarketUrl(event.slug),
            endDate: parseEndDate(event.endDate),
            slug: event.slug,
          });
        }
      }
    }

    if (markets.length < 15) {
      const fallbackMarkets = await fetchTopMarkets();
      for (const m of fallbackMarkets) {
        if (markets.length >= 20) break;
        if (!markets.some(existing => existing.title === m.title)) {
          markets.push(m);
        }
      }
    }

    const result = markets
      .filter(m => !isExpired(m.endDate))
      .filter(m => {
        const discrepancy = Math.abs(m.yesPrice - 50);
        return discrepancy > 5 || (m.volume && m.volume > 50000);
      })
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 15);

    if (result.length === 0 && markets.length === 0) {
      throw new Error('No markets returned — upstream may be down');
    }

    return result;
  }, []);
}

const COUNTRY_TAG_MAP: Record<string, string[]> = {
  'United States': ['usa', 'politics', 'elections'],
  'Russia': ['russia', 'geopolitics', 'ukraine'],
  'Ukraine': ['ukraine', 'geopolitics', 'russia'],
  'China': ['china', 'geopolitics', 'asia'],
  'Taiwan': ['china', 'asia', 'geopolitics'],
  'Israel': ['middle-east', 'geopolitics'],
  'Palestine': ['middle-east', 'geopolitics'],
  'Iran': ['middle-east', 'geopolitics'],
  'Saudi Arabia': ['middle-east', 'geopolitics'],
  'Turkey': ['middle-east', 'europe'],
  'India': ['asia', 'geopolitics'],
  'Japan': ['asia', 'geopolitics'],
  'South Korea': ['asia', 'geopolitics'],
  'North Korea': ['asia', 'geopolitics'],
  'United Kingdom': ['europe', 'politics'],
  'France': ['europe', 'politics'],
  'Germany': ['europe', 'politics'],
  'Italy': ['europe', 'politics'],
  'Poland': ['europe', 'geopolitics'],
  'Brazil': ['world', 'politics'],
  'United Arab Emirates': ['middle-east', 'world'],
  'Mexico': ['world', 'politics'],
  'Argentina': ['world', 'politics'],
  'Canada': ['world', 'politics'],
  'Australia': ['world', 'politics'],
  'South Africa': ['world', 'politics'],
  'Nigeria': ['world', 'politics'],
  'Egypt': ['middle-east', 'world'],
  'Pakistan': ['asia', 'geopolitics'],
  'Syria': ['middle-east', 'geopolitics'],
  'Yemen': ['middle-east', 'geopolitics'],
  'Lebanon': ['middle-east', 'geopolitics'],
  'Iraq': ['middle-east', 'geopolitics'],
  'Afghanistan': ['geopolitics', 'world'],
  'Venezuela': ['world', 'politics'],
  'Colombia': ['world', 'politics'],
  'Sudan': ['world', 'geopolitics'],
  'Myanmar': ['asia', 'geopolitics'],
  'Philippines': ['asia', 'world'],
  'Indonesia': ['asia', 'world'],
  'Thailand': ['asia', 'world'],
  'Vietnam': ['asia', 'world'],
};

function getCountryVariants(country: string): string[] {
  const lower = country.toLowerCase();
  const variants = [lower];

  const VARIANT_MAP: Record<string, string[]> = {
    'russia': ['russian', 'moscow', 'kremlin', 'putin'],
    'ukraine': ['ukrainian', 'kyiv', 'kiev', 'zelensky', 'zelenskyy'],
    'china': ['chinese', 'beijing', 'xi jinping', 'prc'],
    'taiwan': ['taiwanese', 'taipei', 'tsmc'],
    'united states': ['american', 'usa', 'biden', 'trump', 'washington'],
    'israel': ['israeli', 'netanyahu', 'idf', 'tel aviv'],
    'palestine': ['palestinian', 'gaza', 'hamas', 'west bank'],
    'iran': ['iranian', 'tehran', 'khamenei', 'irgc'],
    'north korea': ['dprk', 'pyongyang', 'kim jong un'],
    'south korea': ['korean', 'seoul'],
    'saudi arabia': ['saudi', 'riyadh', 'mbs'],
    'united kingdom': ['british', 'uk', 'britain', 'london'],
    'france': ['french', 'paris', 'macron'],
    'germany': ['german', 'berlin', 'scholz'],
    'turkey': ['turkish', 'ankara', 'erdogan'],
    'india': ['indian', 'delhi', 'modi'],
    'japan': ['japanese', 'tokyo'],
    'brazil': ['brazilian', 'brasilia', 'lula', 'bolsonaro'],
    'united arab emirates': ['uae', 'emirati', 'dubai', 'abu dhabi'],
    'syria': ['syrian', 'damascus', 'assad'],
    'yemen': ['yemeni', 'houthi', 'sanaa'],
    'lebanon': ['lebanese', 'beirut', 'hezbollah'],
    'egypt': ['egyptian', 'cairo', 'sisi'],
    'pakistan': ['pakistani', 'islamabad'],
    'sudan': ['sudanese', 'khartoum'],
    'myanmar': ['burmese', 'burma'],
  };

  const extra = VARIANT_MAP[lower];
  if (extra) variants.push(...extra);
  return variants;
}

export async function fetchCountryMarkets(country: string): Promise<PredictionMarket[]> {
  const tags = COUNTRY_TAG_MAP[country] ?? ['geopolitics', 'world'];
  const uniqueTags = [...new Set(tags)].slice(0, 3);
  const variants = getCountryVariants(country);

  try {
    const eventResults = await Promise.all(uniqueTags.map(tag => fetchEventsByTag(tag, 30)));
    const seen = new Set<string>();
    const markets: PredictionMarket[] = [];

    for (const events of eventResults) {
      for (const event of events) {
        if (event.closed || seen.has(event.id)) continue;
        seen.add(event.id);

        const titleLower = event.title.toLowerCase();
        const eventTitleMatches = variants.some(v => titleLower.includes(v));
        if (!eventTitleMatches) {
          const marketTitles = (event.markets ?? []).map(m => (m.question ?? '').toLowerCase());
          if (!marketTitles.some(mt => variants.some(v => mt.includes(v)))) continue;
        }

        if (isExcluded(event.title)) continue;

        if (event.markets && event.markets.length > 0) {
          const candidates = eventTitleMatches
            ? event.markets.filter(m => !m.closed && !isExpired(m.endDate))
            : event.markets.filter(m =>
                !m.closed && !isExpired(m.endDate) &&
                variants.some(v => (m.question ?? '').toLowerCase().includes(v)));
          if (candidates.length === 0) continue;

          const topMarket = candidates.reduce((best, m) => {
            const vol = m.volumeNum ?? (m.volume ? parseFloat(m.volume) : 0);
            const bestVol = best.volumeNum ?? (best.volume ? parseFloat(best.volume) : 0);
            return vol > bestVol ? m : best;
          });
          markets.push({
            title: topMarket.question || event.title,
            yesPrice: parseMarketPrice(topMarket),
            volume: event.volume ?? 0,
            url: buildMarketUrl(event.slug, topMarket.slug),
            endDate: parseEndDate(topMarket.endDate ?? event.endDate),
            slug: topMarket.slug,
          });
        } else {
          markets.push({
            title: event.title,
            yesPrice: 50,
            volume: event.volume ?? 0,
            url: buildMarketUrl(event.slug),
            endDate: parseEndDate(event.endDate),
            slug: event.slug,
          });
        }
      }
    }

    return markets
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 5);
  } catch (e) {
    console.error(`[Polymarket] fetchCountryMarkets(${country}) failed:`, e);
    return [];
  }
}

/** Live search — used by the search modal for on-demand prediction market results. */
export async function searchPredictions(query: string): Promise<PredictionMarket[]> {
  if (!query || query.length < 2) return [];
  const lowerQuery = query.toLowerCase();
  const dedupeAndSort = (markets: PredictionMarket[]): PredictionMarket[] => {
    const deduped = new Map<string, PredictionMarket>();
    for (const market of markets) {
      const key = market.slug || market.url || market.title;
      if (!key) continue;
      const existing = deduped.get(key);
      if (!existing || (market.volume ?? 0) > (existing.volume ?? 0)) {
        deduped.set(key, market);
      }
    }
    return [...deduped.values()].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  };

  // Strategy 1: Sebuf RPC (works in production on Vercel)
  try {
    const markets: PredictionMarket[] = [];
    const seen = new Set<string>();
    let cursor = '';
    for (let page = 0; page < 5; page++) {
      const resp = await client.listPredictionMarkets({
        category: '',
        query,
        pageSize: 100,
        cursor,
      });
      for (const m of resp.markets ?? []) {
        const closesAt = m.closesAt ? new Date(m.closesAt).toISOString() : undefined;
        if (isExpired(closesAt)) continue;
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        markets.push({
          title: m.title,
          yesPrice: m.yesPrice * 100,
          volume: m.volume,
          url: m.url,
          endDate: closesAt,
          slug: extractMarketSlug(m.url) || m.id,
        });
      }
      cursor = resp.pagination?.nextCursor ?? '';
      if (!cursor) break;
    }
    if (markets.length > 0) {
      return dedupeAndSort(markets);
    }
  } catch { /* RPC unavailable (e.g. localhost), fall through */ }

  // Strategy 2: Gamma API via polyFetch — fetch top events and filter client-side
  try {
    const response = await polyFetch('events', {
      closed: 'false',
      active: 'true',
      archived: 'false',
      end_date_min: new Date().toISOString(),
      order: 'volume',
      ascending: 'false',
      limit: '250',
    });
    if (!response.ok) return [];
    const events: PolymarketEvent[] = await response.json();
    if (!Array.isArray(events)) return [];

    const results: PredictionMarket[] = [];
    const seen = new Set<string>();

    for (const event of events) {
      if (event.closed || seen.has(event.id)) continue;
      seen.add(event.id);

      const titleMatches = event.title?.toLowerCase().includes(lowerQuery);
      const matchingMarkets = (event.markets ?? []).filter(m =>
        m.question?.toLowerCase().includes(lowerQuery),
      );

      if (!titleMatches && matchingMarkets.length === 0) continue;
      if (isExcluded(event.title)) continue;

      const candidates = matchingMarkets.length > 0
        ? matchingMarkets.filter(m => !m.closed && !isExpired(m.endDate))
        : (event.markets ?? []).filter(m => !m.closed && !isExpired(m.endDate));

      if (candidates.length > 0) {
        for (const market of candidates) {
          const marketKey = market.slug || `${event.id}:${market.question || event.title}`;
          if (seen.has(marketKey)) continue;
          seen.add(marketKey);
          results.push({
            title: market.question || event.title,
            yesPrice: parseMarketPrice(market),
            volume: market.volumeNum ?? (market.volume ? parseFloat(market.volume) : event.volume ?? 0),
            url: market.slug ? buildMarketUrl(event.slug, market.slug) : buildMarketUrl(event.slug),
            endDate: parseEndDate(market.endDate ?? event.endDate),
            slug: market.slug,
          });
        }
      } else if (titleMatches) {
        results.push({
          title: event.title,
          yesPrice: 50,
          volume: event.volume ?? 0,
          url: buildMarketUrl(event.slug),
          endDate: parseEndDate(event.endDate),
          slug: event.slug,
        });
      }
    }

    return dedupeAndSort(results);
  } catch { return []; }
}
