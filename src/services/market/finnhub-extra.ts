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

// ─── Company Profile ─────────────────────────────────────────────────────────

export interface CompanyProfile {
  country: string;
  currency: string;
  exchange: string;
  finnhubIndustry: string;
  gicsSector?: string;
  gicsIndustry?: string;
  ipo: string;
  logo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
  // Extended fields (returned by Finnhub for US stocks)
  description?: string;
  ceo?: string;
  employeeTotal?: number;
  address?: string;
  city?: string;
  state?: string;
}

export async function fetchCompanyProfile(symbol: string): Promise<CompanyProfile | null> {
  const data = await fetchFinnhub('company-profile', { symbol }) as CompanyProfile;
  if (!data || !data.name) return null;
  return data;
}

// ─── Company Metrics (Basic Financials) ──────────────────────────────────────

export interface CompanyMetrics {
  '10DayAverageTradingVolume'?: number;
  '52WeekHigh'?: number;
  '52WeekLow'?: number;
  beta?: number;
  bookValuePerShareAnnual?: number;
  dividendYieldIndicatedAnnual?: number;
  epsAnnual?: number;
  epsGrowthTTMYoy?: number;
  marketCapitalization?: number;
  peAnnual?: number;
  peBasicExclExtraTTM?: number;
  pbAnnual?: number;
  psAnnual?: number;
  revenuePerShareAnnual?: number;
  roaRfy?: number;
  roeRfy?: number;
  roiAnnual?: number;
  totalDebtToEquityAnnual?: number;
  currentRatioAnnual?: number;
  netProfitMarginAnnual?: number;
  operatingMarginAnnual?: number;
  grossMarginAnnual?: number;
  freeCashFlowPerShareAnnual?: number;
  revenueGrowthTTMYoy?: number;
  [key: string]: number | undefined;
}

export async function fetchCompanyMetrics(symbol: string): Promise<CompanyMetrics | null> {
  const data = await fetchFinnhub('company-metrics', { symbol }) as { metric?: CompanyMetrics };
  return data?.metric ?? null;
}

// ─── Company Peers ───────────────────────────────────────────────────────────

export async function fetchCompanyPeers(symbol: string): Promise<string[]> {
  const data = await fetchFinnhub('company-peers', { symbol });
  return Array.isArray(data) ? data.filter((s: string) => s !== symbol) : [];
}

// ─── Company News ────────────────────────────────────────────────────────────

export interface CompanyNewsItem {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export async function fetchCompanyNews(symbol: string): Promise<CompanyNewsItem[]> {
  const data = await fetchFinnhub('company-news', { symbol });
  return Array.isArray(data) ? data.slice(0, 20) : [];
}

// ─── Price Target ────────────────────────────────────────────────────────────

export interface PriceTarget {
  lastUpdated: string;
  targetHigh: number;
  targetLow: number;
  targetMean: number;
  targetMedian: number;
}

export async function fetchPriceTarget(symbol: string): Promise<PriceTarget | null> {
  const data = await fetchFinnhub('price-target', { symbol }) as PriceTarget;
  if (!data || !data.targetMean) return null;
  return data;
}

// ─── Financials Reported ─────────────────────────────────────────────────────

export interface FinancialReport {
  accessNumber: string;
  symbol: string;
  cik: string;
  year: number;
  quarter: number;
  form: string;
  startDate: string;
  endDate: string;
  filedDate: string;
  report: {
    bs?: Array<{ concept: string; label: string; value: number; unit: string }>;
    ic?: Array<{ concept: string; label: string; value: number; unit: string }>;
    cf?: Array<{ concept: string; label: string; value: number; unit: string }>;
  };
}

export async function fetchFinancialsReported(symbol: string, freq: 'annual' | 'quarterly' = 'annual'): Promise<FinancialReport[]> {
  const url = new URL('/api/market-data', window.location.origin);
  url.searchParams.set('endpoint', 'financials-reported');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('freq', freq);

  const resp = await fetch(url.toString());
  if (!resp.ok) return [];
  const data = await resp.json() as { data?: FinancialReport[] };
  return data?.data?.slice(0, 4) ?? [];
}

// ─── Option Chain ─────────────────────────────────────────────────────────────

export interface OptionContract {
  contractName: string;
  strike: number;
  expirationDate: string;
  impliedVolatility: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  inTheMoney: boolean;
  side: 'CALL' | 'PUT';
}

export interface OptionChainExpiry {
  expirationDate: string;
  calls: OptionContract[];
  puts: OptionContract[];
}

export async function fetchOptionChain(symbol: string): Promise<OptionChainExpiry[]> {
  const data = await fetchFinnhub('option-chain', { symbol }) as {
    data?: Array<{
      expirationDate: string;
      options: { CALL?: OptionContract[]; PUT?: OptionContract[] };
    }>;
  };
  if (!data?.data) return [];
  return data.data.map(expiry => ({
    expirationDate: expiry.expirationDate,
    calls: expiry.options.CALL ?? [],
    puts: expiry.options.PUT ?? [],
  }));
}

// ─── Institutional Ownership ──────────────────────────────────────────────────

export interface InstitutionalHolder {
  name: string;
  share: number;
  date: string;
  change: number;
  filingDate: string;
  percent: number;
}

export async function fetchInstitutionalOwnership(symbol: string): Promise<InstitutionalHolder[]> {
  const data = await fetchFinnhub('stock-ownership', { symbol }) as { ownership?: InstitutionalHolder[] };
  return data?.ownership ?? [];
}

// ─── Earnings Surprises ───────────────────────────────────────────────────────

export interface EarningsSurprise {
  actual: number;
  estimate: number;
  period: string;
  quarter: number;
  surprise: number;
  surprisePercent: number;
  symbol: string;
  year: number;
}

export async function fetchEarningsSurprises(symbol: string): Promise<EarningsSurprise[]> {
  const data = await fetchFinnhub('earnings-surprises', { symbol });
  return Array.isArray(data) ? data : [];
}
