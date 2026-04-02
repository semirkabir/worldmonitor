/**
 * RPC: ListSecFilings
 * Fetches recent SEC EDGAR filings for a company by ticker symbol.
 * Uses the SEC EDGAR submissions API (free, no API key required).
 */
import type {
  ServerContext,
  ListSecFilingsRequest,
  ListSecFilingsResponse,
  SecFiling,
} from '../../../../src/generated/server/worldmonitor/market/v1/service_server';
import { cachedFetchJson } from '../../../_shared/redis';
import { parseStringArray } from './_shared';

const SEC_USER_AGENT = 'WorldMonitor/1.0 (contact@worldmonitor.io)';
const REDIS_CACHE_KEY_PREFIX = 'market:sec-filings:v1';
const REDIS_CACHE_TTL = 1800; // 30 minutes
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * Top company ticker → CIK mapping.
 * CIK numbers are zero-padded to 10 digits for the EDGAR API.
 */
const TICKER_TO_CIK: Record<string, string> = {
  AAPL: '0000320193',
  MSFT: '0000789019',
  GOOG: '0001652044',
  GOOGL: '0001652044',
  AMZN: '0001018724',
  META: '0001326801',
  TSLA: '0001318605',
  NVDA: '0001045810',
  BRK: '0001067983',
  JPM: '0000019617',
  V: '0001403161',
  JNJ: '0000200406',
  WMT: '0000104169',
  PG: '0000080424',
  MA: '0001141391',
  UNH: '0000731766',
  HD: '0000354950',
  DIS: '0001744489',
  BAC: '0000070858',
  XOM: '0000034088',
  PFE: '0000078003',
  CSCO: '0000858877',
  VZ: '0000732712',
  INTC: '0000050863',
  CMCSA: '0001166691',
  KO: '0000021344',
  PEP: '0000077476',
  ABT: '0000001800',
  AVGO: '0001649338',
  NKE: '0000320187',
  MRK: '0000310158',
  ORCL: '0001341439',
  CRM: '0001108524',
  AMD: '0000002488',
  NFLX: '0001065280',
  COST: '0000909832',
  TMO: '0000097745',
  QCOM: '0000804328',
  ABBV: '0001551152',
  DHR: '0000313616',
  LLY: '0000059478',
  TXN: '0000097476',
  NEE: '0000753308',
  UPS: '0001090727',
  BMY: '0000014272',
  PM: '0001413329',
  RTX: '0000101829',
  HON: '0000773840',
  IBM: '0000051143',
  CAT: '0000018230',
  GE: '0000040554',
  BA: '0000012927',
  GS: '0000886982',
  MMM: '0000066740',
  AMGN: '0000318154',
  SBUX: '0000829224',
  CVX: '0000093410',
  LOW: '0000060667',
  MS: '0000895421',
  BLK: '0001364742',
  MDLZ: '0001103982',
  ISRG: '0001035267',
  ADP: '0000008670',
  GILD: '0000882095',
  SYK: '0000310764',
  BKNG: '0001075531',
  PYPL: '0001633917',
  UBER: '0001543151',
  ABNB: '0001559720',
  SQ: '0001512673',
  SNAP: '0001564408',
  COIN: '0001679788',
  RIVN: '0001874178',
  PLTR: '0001321655',
  RBLX: '0001315098',
  SHOP: '0001594805',
  SNOW: '0001640147',
  CRWD: '0001535527',
  ZS: '0001713683',
  DDOG: '0001561550',
  NET: '0001477333',
  MDB: '0001441816',
  PANW: '0001327567',
  ROKU: '0001428439',
  TTD: '0001671933',
  TWLO: '0001447669',
  OKTA: '0001660134',
  ZM: '0001585521',
  DOCU: '0001261654',
  U: '0001810806',
  PATH: '0001734722',
  SOFI: '0001818874',
  HOOD: '0001783879',
  LCID: '0001811210',
  AFRM: '0001820953',
  AI: '0001527166',
  ARM: '0001973239',
};

interface EdgarSubmissions {
  cik: string;
  entityType: string;
  name: string;
  tickers: string[];
  recent: {
    accessionNumber: string[];
    filingDate: string[];
    form: string[];
    primaryDocument: string[];
    primaryDocDescription: string[];
  };
}

function buildEdgarUrl(accessionNumber: string, primaryDoc: string): string {
  const cleaned = accessionNumber.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cleaned.slice(0, 10)}/${cleaned}/${primaryDoc}`;
}

export async function listSecFilings(
  _ctx: ServerContext,
  req: ListSecFilingsRequest,
): Promise<ListSecFilingsResponse> {
  const ticker = (req.ticker || '').toUpperCase().trim();
  if (!ticker) {
    return { filings: [], ticker: '', companyName: '' };
  }

  const limit = Math.min(Math.max(req.limit || 20, 1), 50);
  const filingTypesRaw = parseStringArray(req.filingTypes);
  const filingTypeFilter = new Set(filingTypesRaw.map(t => t.toUpperCase()));

  const cacheKey = `${REDIS_CACHE_KEY_PREFIX}:${ticker}`;

  const result = await cachedFetchJson<ListSecFilingsResponse>(cacheKey, REDIS_CACHE_TTL, async () => {
    const cik = TICKER_TO_CIK[ticker];
    if (!cik) {
      console.warn(`[SEC] No CIK mapping for ticker: ${ticker}`);
      return null;
    }

    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;

    const resp = await fetch(url, {
      headers: {
        'User-Agent': SEC_USER_AGENT,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!resp.ok) {
      console.error(`[SEC] EDGAR returned ${resp.status} for ${ticker} (CIK ${cik})`);
      return null;
    }

    const data = (await resp.json()) as EdgarSubmissions;
    const recent = data.recent;
    if (!recent?.form?.length) {
      return { filings: [], ticker, companyName: data.name || ticker };
    }

    const filings: SecFiling[] = [];
    const maxEntries = Math.min(recent.form.length, 200); // scan up to 200 recent filings

    for (let i = 0; i < maxEntries && filings.length < 50; i++) {
      const form = recent.form[i] ?? '';
      // Skip amendments and minor forms unless specifically requested
      if (filingTypeFilter.size > 0 && !filingTypeFilter.has(form)) continue;

      const accession = recent.accessionNumber[i] ?? '';
      const primaryDoc = recent.primaryDocument[i] ?? '';
      const description = recent.primaryDocDescription[i] ?? form;

      filings.push({
        accessionNumber: accession,
        filingType: form,
        filedAt: recent.filingDate[i] ?? '',
        title: description,
        url: primaryDoc ? buildEdgarUrl(accession, primaryDoc) : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${encodeURIComponent(form)}&dateb=&owner=include&count=10`,
        issuerName: data.name || ticker,
        issuerCik: cik,
      });
    }

    return { filings, ticker, companyName: data.name || ticker };
  });

  if (!result) {
    return { filings: [], ticker, companyName: '' };
  }

  // Apply client-side filters on cached data
  let filings = result.filings;
  if (filingTypeFilter.size > 0) {
    filings = filings.filter(f => filingTypeFilter.has(f.filingType));
  }

  return {
    filings: filings.slice(0, limit),
    ticker: result.ticker,
    companyName: result.companyName,
  };
}
