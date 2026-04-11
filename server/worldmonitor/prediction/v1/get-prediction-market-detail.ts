import type {
  GetPredictionMarketDetailRequest,
  GetPredictionMarketDetailResponse,
  PredictionMarketComment,
  PredictionMarketDetail,
  PredictionMarketHolder,
  PredictionMarketOrderBook,
  PredictionMarketOrderLevel,
  PredictionMarketPricePoint,
  PredictionMarketPricing,
  PredictionMarketTrade,
  PredictionServiceHandler,
  ServerContext,
} from '../../../../src/generated/server/worldmonitor/prediction/v1/service_server';

import { CHROME_UA, clampInt } from '../../../_shared/constants';
import { cachedFetchJson } from '../../../_shared/redis';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';
const DATA_BASE = 'https://data-api.polymarket.com';
const FETCH_TIMEOUT = 8000;
const DETAIL_CACHE_TTL = 15;

interface GammaMarketDetail {
  id?: number | string;
  slug?: string;
  question?: string;
  description?: string;
  resolution_source?: string;
  eventSlug?: string;
  event_slug?: string;
  eventId?: number | string;
  event_id?: number | string;
  conditionId?: string;
  condition_id?: string;
  clobTokenIds?: string[] | string;
  outcomes?: string;
  outcomePrices?: string;
  endDate?: string;
  closed?: boolean;
  volume?: number | string;
  volumeNum?: number;
  liquidity?: number | string;
  liquidityNum?: number;
  tags?: Array<{ label?: string; slug?: string }>;
}

interface OrderBookRow {
  price?: string | number;
  size?: string | number;
}

interface OrderBookResponse {
  bids?: OrderBookRow[];
  asks?: OrderBookRow[];
  tick_size?: string;
  min_order_size?: string;
  hash?: string;
  timestamp?: string | number;
  last_trade_price?: string | number;
}

interface PriceHistoryResponse {
  history?: Array<{ t?: number; p?: number }>;
}

interface DataTradeResponse {
  side?: string;
  size?: number;
  price?: number;
  timestamp?: number;
}

interface DataHolderEnvelope {
  holders?: Array<{
    proxyWallet?: string;
    amount?: number;
    outcomeIndex?: number;
    name?: string;
    pseudonym?: string;
    profileImage?: string;
  }>;
}

interface GammaCommentResponse {
  body?: string;
  createdAt?: string;
  reactionCount?: number;
  userAddress?: string;
  profile?: {
    name?: string;
    pseudonym?: string;
    profileImage?: string;
  };
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseIsoMillis(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseEpochMillis(value: unknown): number {
  const parsed = parseNumber(value);
  if (!parsed) return 0;
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

function parseOutcomePrices(raw?: string): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];
  } catch {
    return [];
  }
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

function toOrderLevels(rows: OrderBookRow[] | undefined, depth: number): PredictionMarketOrderLevel[] {
  return (rows ?? []).slice(0, depth).map((row) => ({
    price: parseNumber(row.price),
    size: parseNumber(row.size),
  }));
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!response.ok) return null;
    return response.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function buildPredictionDetail(
  req: GetPredictionMarketDetailRequest,
): Promise<GetPredictionMarketDetailResponse | null> {
  const bookDepth = clampInt(req.bookDepth, 10, 1, 25);
  const tradeLimit = clampInt(req.tradeLimit, 20, 1, 100);
  const slug = req.slug.trim();
  if (!slug) return null;

  const marketRows = await fetchJson<GammaMarketDetail[]>(`${GAMMA_BASE}/markets?slug=${encodeURIComponent(slug)}`);
  const marketRow = Array.isArray(marketRows) ? marketRows[0] : null;
  if (!marketRow) return null;

  const tokenIds = normalizeTokenIds(marketRow.clobTokenIds);
  const tokenId = tokenIds[0] ?? '';
  const conditionId = marketRow.conditionId || marketRow.condition_id || '';
  const marketId = String(marketRow.id ?? '');
  const eventId = req.eventId || String(marketRow.eventId || marketRow.event_id || '');
  const eventSlug = marketRow.eventSlug || marketRow.event_slug || '';
  const yesPrice = parseOutcomePrices(marketRow.outcomePrices)[0] ?? 0.5;
  const noPrice = Math.max(0, Math.min(1, 1 - yesPrice));

  const [bookData, midpointData, bestAskData, bestBidData, spreadData, historyData, lastTradeData, tradesData, holdersData, commentsData] = await Promise.all([
    tokenId ? fetchJson<OrderBookResponse>(`${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`) : Promise.resolve(null),
    tokenId ? fetchJson<{ mid?: string | number }>(`${CLOB_BASE}/midpoint?token_id=${encodeURIComponent(tokenId)}`) : Promise.resolve(null),
    tokenId ? fetchJson<{ price?: string | number }>(`${CLOB_BASE}/price?token_id=${encodeURIComponent(tokenId)}&side=BUY`) : Promise.resolve(null),
    tokenId ? fetchJson<{ price?: string | number }>(`${CLOB_BASE}/price?token_id=${encodeURIComponent(tokenId)}&side=SELL`) : Promise.resolve(null),
    tokenId ? fetchJson<{ spread?: string | number }>(`${CLOB_BASE}/spread?token_id=${encodeURIComponent(tokenId)}`) : Promise.resolve(null),
    tokenId ? fetchJson<PriceHistoryResponse>(`${CLOB_BASE}/prices-history?market=${encodeURIComponent(tokenId)}&interval=1d&fidelity=60`) : Promise.resolve(null),
    tokenId ? fetchJson<{ price?: string | number; side?: string }>(`${CLOB_BASE}/last-trade-price?token_id=${encodeURIComponent(tokenId)}`) : Promise.resolve(null),
    conditionId ? fetchJson<DataTradeResponse[]>(`${DATA_BASE}/trades?market=${encodeURIComponent(conditionId)}&limit=${tradeLimit}&offset=0&takerOnly=true`) : Promise.resolve(null),
    conditionId ? fetchJson<DataHolderEnvelope[]>(`${DATA_BASE}/holders?market=${encodeURIComponent(conditionId)}&limit=5`) : Promise.resolve(null),
    marketId ? fetchJson<GammaCommentResponse[]>(`${GAMMA_BASE}/comments?parent_entity_type=market&parent_entity_id=${encodeURIComponent(marketId)}&limit=10&order=createdAt&ascending=false`) : Promise.resolve(null),
  ]);

  const market: PredictionMarketDetail = {
    slug,
    title: marketRow.question || slug,
    url: eventSlug ? `https://polymarket.com/event/${eventSlug}/${slug}` : `https://polymarket.com/market/${slug}`,
    category: marketRow.tags?.[0]?.label || marketRow.tags?.[0]?.slug || '',
    eventId,
    eventSlug,
    marketId,
    conditionId,
    tokenIds,
    closed: Boolean(marketRow.closed),
    closesAt: parseIsoMillis(marketRow.endDate),
    description: marketRow.description || '',
    resolutionSource: marketRow.resolution_source || '',
    volume: parseNumber(marketRow.volumeNum ?? marketRow.volume),
    liquidity: parseNumber(marketRow.liquidityNum ?? marketRow.liquidity),
  };

  const pricing: PredictionMarketPricing = {
    yesPrice,
    noPrice,
    midpoint: parseNumber(midpointData?.mid, yesPrice),
    bestBid: parseNumber(bestBidData?.price),
    bestAsk: parseNumber(bestAskData?.price),
    spread: parseNumber(spreadData?.spread),
    lastTradePrice: parseNumber(lastTradeData?.price, parseNumber(bookData?.last_trade_price, yesPrice)),
    lastTradeSide: lastTradeData?.side || '',
  };

  const orderBook: PredictionMarketOrderBook = {
    bids: toOrderLevels(bookData?.bids, bookDepth),
    asks: toOrderLevels(bookData?.asks, bookDepth),
    tickSize: bookData?.tick_size || '',
    minOrderSize: bookData?.min_order_size || '',
    hash: bookData?.hash || '',
    updatedAt: parseEpochMillis(bookData?.timestamp),
  };

  const history: PredictionMarketPricePoint[] = Array.isArray(historyData?.history)
    ? historyData.history
      .filter((point): point is { t: number; p: number } => Number.isFinite(point?.t) && Number.isFinite(point?.p))
      .map((point) => ({ timestamp: parseEpochMillis(point.t), price: point.p }))
    : [];

  const recentTrades: PredictionMarketTrade[] = Array.isArray(tradesData)
    ? tradesData.slice(0, tradeLimit).map((trade) => ({
      price: parseNumber(trade.price),
      size: parseNumber(trade.size),
      side: trade.side || '',
      timestamp: parseEpochMillis(trade.timestamp),
    }))
    : [];

  const holders: PredictionMarketHolder[] = Array.isArray(holdersData) && holdersData[0]?.holders
    ? holdersData[0].holders.map((holder) => ({
      address: holder.proxyWallet || '',
      label: holder.name || holder.pseudonym || `${holder.proxyWallet?.slice(0, 6) ?? ''}…${holder.proxyWallet?.slice(-4) ?? ''}`,
      profileImage: holder.profileImage || '',
      shares: parseNumber(holder.amount),
      value: parseNumber(holder.amount) * (holder.outcomeIndex === 0 ? yesPrice : noPrice),
      side: holder.outcomeIndex === 0 ? 'yes' : 'no',
    }))
    : [];

  const comments: PredictionMarketComment[] = Array.isArray(commentsData)
    ? commentsData
      .filter((comment): comment is GammaCommentResponse & { body: string } => Boolean(comment.body))
      .map((comment) => ({
        author: comment.profile?.name || comment.profile?.pseudonym || 'Anonymous',
        text: comment.body || '',
        profileImage: comment.profile?.profileImage || '',
        userAddress: comment.userAddress || '',
        likes: comment.reactionCount || 0,
        createdAt: parseIsoMillis(comment.createdAt),
      }))
    : [];

  return {
    market,
    pricing,
    orderBook,
    recentTrades,
    history,
    holders,
    comments,
  };
}

export const getPredictionMarketDetail: PredictionServiceHandler['getPredictionMarketDetail'] = async (
  _ctx: ServerContext,
  req: GetPredictionMarketDetailRequest,
): Promise<GetPredictionMarketDetailResponse> => {
  const slug = req.slug.trim();
  if (!slug) {
    return { recentTrades: [], history: [], holders: [], comments: [] };
  }

  const bookDepth = clampInt(req.bookDepth, 10, 1, 25);
  const tradeLimit = clampInt(req.tradeLimit, 20, 1, 100);
  const cacheKey = `prediction:detail:v1:${slug}:${bookDepth}:${tradeLimit}`;

  try {
    const result = req.refresh
      ? await buildPredictionDetail({ ...req, bookDepth, tradeLimit })
      : await cachedFetchJson<GetPredictionMarketDetailResponse>(cacheKey, DETAIL_CACHE_TTL, () => buildPredictionDetail({ ...req, bookDepth, tradeLimit }), 10);
    return result || { recentTrades: [], history: [], holders: [], comments: [] };
  } catch {
    return { recentTrades: [], history: [], holders: [], comments: [] };
  }
};
