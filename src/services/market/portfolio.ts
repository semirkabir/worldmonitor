/**
 * Portfolio data service — fetches congressional trades, institutional holdings,
 * and manages user portfolio positions.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CongressTrade {
  politician: string;
  chamber: 'House' | 'Senate';
  ticker: string;
  assetDescription: string;
  transactionType: string;
  transactionDate: string;
  disclosureDate: string;
  amount: string;
  party: string;
  district: string;
  state: string;
}

export interface CongressTradesResponse {
  trades: CongressTrade[];
  updatedAt: string;
}

export interface InstitutionalHolding {
  issuer: string;
  title: string;
  cusip: string;
  value: number;
  shares: number;
}

export interface InstitutionalHoldingsResponse {
  name: string;
  cik: string;
  filingDate: string;
  holdings: InstitutionalHolding[];
  totalHoldings: number;
}

export interface UserPosition {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  addedAt: string;
}

// ─── Notable institutional investors (13F filers) ─────────────────────────────

export interface NotableInvestor {
  name: string;
  cik: string;
  description: string;
}

export const NOTABLE_INVESTORS: NotableInvestor[] = [
  { name: 'Berkshire Hathaway', cik: '1067983', description: 'Warren Buffett' },
  { name: 'Bridgewater Associates', cik: '1350694', description: 'Ray Dalio' },
  { name: 'Citadel Advisors', cik: '1423053', description: 'Ken Griffin' },
  { name: 'Renaissance Technologies', cik: '1037389', description: 'Jim Simons' },
  { name: 'Soros Fund Management', cik: '1029160', description: 'George Soros' },
  { name: 'Pershing Square', cik: '1336528', description: 'Bill Ackman' },
  { name: 'Appaloosa Management', cik: '1656456', description: 'David Tepper' },
  { name: 'Tiger Global', cik: '1167483', description: 'Chase Coleman' },
  { name: 'Third Point', cik: '1040273', description: 'Dan Loeb' },
  { name: 'Elliott Management', cik: '1048445', description: 'Paul Singer' },
  { name: 'Two Sigma Investments', cik: '1179392', description: 'David Siegel' },
  { name: 'Millennium Management', cik: '1273087', description: 'Israel Englander' },
  { name: 'Point72 Asset Management', cik: '1603466', description: 'Steve Cohen' },
  { name: 'D.E. Shaw', cik: '1009207', description: 'David Shaw' },
  { name: 'ARK Investment Management', cik: '1579982', description: 'Cathie Wood' },
  { name: 'Icahn Capital', cik: '921669', description: 'Carl Icahn' },
];

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchCongressTrades(): Promise<CongressTradesResponse> {
  const url = new URL('/api/portfolio-data', window.location.origin);
  url.searchParams.set('source', 'congress-trades');
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function fetchInstitutionalHoldings(cik: string): Promise<InstitutionalHoldingsResponse> {
  const url = new URL('/api/portfolio-data', window.location.origin);
  url.searchParams.set('source', '13f-holdings');
  url.searchParams.set('cik', cik);
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ─── User Portfolio (localStorage) ────────────────────────────────────────────

const STORAGE_KEY = 'wm-portfolio-v1';

export function getUserPositions(): UserPosition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserPositions(positions: UserPosition[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  document.dispatchEvent(new CustomEvent('wm-portfolio-changed'));
}

export function addUserPosition(position: Omit<UserPosition, 'addedAt'>): void {
  const positions = getUserPositions();
  const existing = positions.findIndex(p => p.symbol === position.symbol);
  if (existing >= 0) {
    // Average cost basis
    const old = positions[existing]!;
    const totalShares = old.shares + position.shares;
    const totalCost = (old.shares * old.avgCost) + (position.shares * position.avgCost);
    positions[existing] = { ...old, shares: totalShares, avgCost: totalCost / totalShares };
  } else {
    positions.push({ ...position, addedAt: new Date().toISOString() });
  }
  saveUserPositions(positions);
}

export function removeUserPosition(symbol: string): void {
  const positions = getUserPositions().filter(p => p.symbol !== symbol);
  saveUserPositions(positions);
}
