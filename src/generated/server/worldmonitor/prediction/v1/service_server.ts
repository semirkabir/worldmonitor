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
  pagination?: PaginationResponse;
}

export interface GetPredictionMarketDetailRequest {
  slug: string;
  eventId: string;
  bookDepth: number;
  tradeLimit: number;
  refresh: boolean;
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

export interface PaginationResponse {
  nextCursor: string;
  totalCount: number;
}

export interface FieldViolation {
  field: string;
  description: string;
}

export class ValidationError extends Error {
  violations: FieldViolation[];

  constructor(violations: FieldViolation[]) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.violations = violations;
  }
}

export class ApiError extends Error {
  statusCode: number;
  body: string;

  constructor(statusCode: number, message: string, body: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

export interface ServerContext {
  request: Request;
  pathParams: Record<string, string>;
  headers: Record<string, string>;
}

export interface ServerOptions {
  onError?: (error: unknown, req: Request) => Response | Promise<Response>;
  validateRequest?: (methodName: string, body: unknown) => FieldViolation[] | undefined;
}

export interface RouteDescriptor {
  method: string;
  path: string;
  handler: (req: Request) => Promise<Response>;
}

export interface PredictionServiceHandler {
  listPredictionMarkets(ctx: ServerContext, req: ListPredictionMarketsRequest): Promise<ListPredictionMarketsResponse>;
  getPredictionMarketDetail(ctx: ServerContext, req: GetPredictionMarketDetailRequest): Promise<GetPredictionMarketDetailResponse>;
}

export function createPredictionServiceRoutes(
  handler: PredictionServiceHandler,
  options?: ServerOptions,
): RouteDescriptor[] {
  return [
    {
      method: 'GET',
      path: '/api/prediction/v1/list-prediction-markets',
      handler: async (req: Request): Promise<Response> => {
        try {
          const pathParams: Record<string, string> = {};
          const url = new URL(req.url, 'http://localhost');
          const params = url.searchParams;
          const body: ListPredictionMarketsRequest = {
            pageSize: Number(params.get('page_size') ?? '0'),
            cursor: params.get('cursor') ?? '',
            category: params.get('category') ?? '',
            query: params.get('query') ?? '',
          };
          if (options?.validateRequest) {
            const bodyViolations = options.validateRequest('listPredictionMarkets', body);
            if (bodyViolations) throw new ValidationError(bodyViolations);
          }

          const ctx: ServerContext = {
            request: req,
            pathParams,
            headers: Object.fromEntries(req.headers.entries()),
          };

          const result = await handler.listPredictionMarkets(ctx, body);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (err: unknown) {
          if (err instanceof ValidationError) {
            return new Response(JSON.stringify({ violations: err.violations }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (options?.onError) return options.onError(err, req);
          const message = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
    {
      method: 'GET',
      path: '/api/prediction/v1/get-prediction-market-detail',
      handler: async (req: Request): Promise<Response> => {
        try {
          const pathParams: Record<string, string> = {};
          const url = new URL(req.url, 'http://localhost');
          const params = url.searchParams;
          const body: GetPredictionMarketDetailRequest = {
            slug: params.get('slug') ?? '',
            eventId: params.get('event_id') ?? '',
            bookDepth: Number(params.get('book_depth') ?? '0'),
            tradeLimit: Number(params.get('trade_limit') ?? '0'),
            refresh: params.get('refresh') === 'true',
          };
          if (options?.validateRequest) {
            const bodyViolations = options.validateRequest('getPredictionMarketDetail', body);
            if (bodyViolations) throw new ValidationError(bodyViolations);
          }

          const ctx: ServerContext = {
            request: req,
            pathParams,
            headers: Object.fromEntries(req.headers.entries()),
          };

          const result = await handler.getPredictionMarketDetail(ctx, body);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (err: unknown) {
          if (err instanceof ValidationError) {
            return new Response(JSON.stringify({ violations: err.violations }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (options?.onError) return options.onError(err, req);
          const message = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  ];
}
