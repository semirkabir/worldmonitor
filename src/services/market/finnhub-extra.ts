export interface EarningsEvent {
  symbol: string;
  name: string;
  date: string;
  hour: string; // "bmo" or "amc"
  epsEstimate: number;
  epsActual: number;
  revenueEstimate: number;
  revenueActual: number;
  quarter: number;
  year: number;
}

export interface IPOEvent {
  symbol: string;
  name: string;
  exchange: string;
  expectedPrice: string;
  numberOfShares: number;
  status: string;
  filingDate: string;
  announcementDate: string;
  priceRangeLow: string;
  priceRangeHigh: string;
}

export interface InsiderTransaction {
  symbol: string;
  name: string;
  change: number;
  transactionPrice: number;
  transactionValue: number;
  transactionDate: string;
  transactionCode: string;
  filingDate: string;
  share: number;
}

export interface SocialSentiment {
  date: string;
  symbol: string;
  redditPosts: number;
  redditUpvotes: number;
  redditComments: number;
  redditMentions: number;
  twitterMentions: number;
  redditScore: number;
  twitterScore: number;
}

export interface RecommendationTrend {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface FinnhubEarningsResponse {
  earningsCalendar: Array<{
    symbol: string;
    name: string;
    date: string;
    hour: string;
    epsEstimate: number;
    epsActual: number;
    revenueEstimate: number;
    revenueActual: number;
    quarter: number;
    year: number;
  }>;
}

export interface FinnhubIPOResponse {
  ipoCalendar: Array<{
    symbol: string;
    name: string;
    exchange: string;
    expectedPrice: string;
    numberOfShares: number;
    status: string;
    filingDate: string;
    announcementDate: string;
    priceRangeLow: string;
    priceRangeHigh: string;
  }>;
}

async function fetchFinnhub(endpoint: string, params: Record<string, string | undefined>): Promise<unknown> {
  const url = new URL('/api/market-data', window.location.origin);
  url.searchParams.set('endpoint', endpoint);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(error.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function fetchEarningsCalendar(from?: string, to?: string): Promise<EarningsEvent[]> {
  const data = await fetchFinnhub('earnings-calendar', {
    from: from ?? new Date().toISOString().split('T')[0],
    to: to ?? new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
  }) as FinnhubEarningsResponse;
  return data.earningsCalendar || [];
}

export async function fetchIPOCalendar(from?: string, to?: string): Promise<IPOEvent[]> {
  const data = await fetchFinnhub('ipo-calendar', {
    from: from ?? new Date().toISOString().split('T')[0],
    to: to ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  }) as FinnhubIPOResponse;
  return data.ipoCalendar || [];
}

export async function fetchInsiderTransactions(symbol: string): Promise<InsiderTransaction[]> {
  return fetchFinnhub('insider-transactions', { symbol }) as Promise<InsiderTransaction[]>;
}

export async function fetchSocialSentiment(symbol: string): Promise<SocialSentiment[]> {
  return fetchFinnhub('social-sentiment', { symbol }) as Promise<SocialSentiment[]>;
}

export async function fetchRecommendationTrends(symbol: string): Promise<RecommendationTrend[]> {
  return fetchFinnhub('recommendation-trends', { symbol }) as Promise<RecommendationTrend[]>;
}
