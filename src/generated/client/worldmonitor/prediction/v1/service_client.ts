// @ts-nocheck
// Manually updated to match proto definitions when buf is unavailable.

export interface ListPredictionMarketsRequest {
  pageSize: number;
  cursor: string;
  category: string;
  query: string;
}

export interface PredictionMarket {
  id: string;
  title: string;
  yesPrice: number;
  volume: number;
  url: string;
  closesAt: number;
  category: string;
}

export interface ListPredictionMarketsResponse {
  markets: PredictionMarket[];
  pagination?: { nextCursor: string; totalCount: number };
}

export interface GetPredictionMarketDetailRequest {
  slug: string;
  eventId?: string;
  bookDepth?: number;
  tradeLimit?: number;
  refresh?: boolean;
}

export interface PredictionMarketDetail {
  slug: string;
  title: string;
  url: string;
  category: string;
  eventId: string;
  eventSlug: string;
  marketId: string;
  conditionId: string;
  tokenIds: string[];
  closed: boolean;
  closesAt: number;
  description: string;
  resolutionSource: string;
  volume: number;
  liquidity: number;
}

export interface PredictionMarketPricing {
  yesPrice: number;
  noPrice: number;
  midpoint: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  lastTradePrice: number;
  lastTradeSide: string;
}

export interface PredictionMarketOrderLevel {
  price: number;
  size: number;
}

export interface PredictionMarketOrderBook {
  bids: PredictionMarketOrderLevel[];
  asks: PredictionMarketOrderLevel[];
  tickSize: string;
  minOrderSize: string;
  hash: string;
  updatedAt: number;
}

export interface PredictionMarketTrade {
  price: number;
  size: number;
  side: string;
  timestamp: number;
}

export interface PredictionMarketPricePoint {
  timestamp: number;
  price: number;
}

export interface PredictionMarketHolder {
  address: string;
  label: string;
  profileImage: string;
  shares: number;
  value: number;
  side: string;
}

export interface PredictionMarketComment {
  author: string;
  text: string;
  profileImage: string;
  userAddress: string;
  likes: number;
  createdAt: number;
}

export interface GetPredictionMarketDetailResponse {
  market?: PredictionMarketDetail;
  pricing?: PredictionMarketPricing;
  orderBook?: PredictionMarketOrderBook;
  recentTrades: PredictionMarketTrade[];
  history: PredictionMarketPricePoint[];
  holders: PredictionMarketHolder[];
  comments: PredictionMarketComment[];
}

export interface PredictionServiceClientOptions {
  fetch?: typeof fetch;
}

export interface PredictionServiceCallOptions {
  signal?: AbortSignal;
}

export class PredictionServiceClient {
  private baseURL: string;
  private fetchImpl: typeof fetch;

  constructor(baseURL: string, options?: PredictionServiceClientOptions) {
    this.baseURL = baseURL;
    this.fetchImpl = options?.fetch ?? fetch;
  }

  async listPredictionMarkets(req: ListPredictionMarketsRequest, options?: PredictionServiceCallOptions): Promise<ListPredictionMarketsResponse> {
    const url = new URL(`${this.baseURL}/api/prediction/v1/list-prediction-markets`, 'http://localhost');
    if (req.pageSize) url.searchParams.set('page_size', String(req.pageSize));
    if (req.cursor) url.searchParams.set('cursor', req.cursor);
    if (req.category) url.searchParams.set('category', req.category);
    if (req.query) url.searchParams.set('query', req.query);
    const response = await this.fetchImpl(this.resolve(url), { method: 'GET', signal: options?.signal });
    if (!response.ok) throw new Error(`PredictionService listPredictionMarkets failed: ${response.status}`);
    return response.json();
  }

  async getPredictionMarketDetail(req: GetPredictionMarketDetailRequest, options?: PredictionServiceCallOptions): Promise<GetPredictionMarketDetailResponse> {
    const url = new URL(`${this.baseURL}/api/prediction/v1/get-prediction-market-detail`, 'http://localhost');
    url.searchParams.set('slug', req.slug);
    if (req.eventId) url.searchParams.set('event_id', req.eventId);
    if (req.bookDepth != null) url.searchParams.set('book_depth', String(req.bookDepth));
    if (req.tradeLimit != null) url.searchParams.set('trade_limit', String(req.tradeLimit));
    if (req.refresh != null) url.searchParams.set('refresh', String(req.refresh));
    const response = await this.fetchImpl(this.resolve(url), { method: 'GET', signal: options?.signal });
    if (!response.ok) throw new Error(`PredictionService getPredictionMarketDetail failed: ${response.status}`);
    return response.json();
  }

  private resolve(url: URL): string {
    if (this.baseURL) return url.toString().replace('http://localhost', '').replace(/^/, this.baseURL);
    return url.pathname + url.search;
  }
}
