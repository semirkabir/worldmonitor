/**
 * Unified market service module -- replaces legacy service:
 *   - src/services/markets.ts (Finnhub + Yahoo + CoinGecko)
 *
 * All data now flows through the MarketServiceClient RPCs.
 */

import {
  MarketServiceClient,
  type ListMarketQuotesResponse,
  type ListCommodityQuotesResponse,
  type ListCryptoQuotesResponse,
  type MarketQuote as ProtoMarketQuote,
  type CommodityQuote as ProtoCommodityQuote,
  type CryptoQuote as ProtoCryptoQuote,
} from '@/generated/client/worldmonitor/market/v1/service_client';
import type { MarketData, CryptoData } from '@/types';
import { createCircuitBreaker } from '@/utils';
import { getHydratedData } from '@/services/bootstrap';

// ---- Client + Circuit Breakers ----

const client = new MarketServiceClient('', { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) });
const stockBreaker = createCircuitBreaker<ListMarketQuotesResponse>({ name: 'Market Quotes', cacheTtlMs: 0 });
const commodityBreaker = createCircuitBreaker<ListCommodityQuotesResponse>({ name: 'Commodity Quotes', cacheTtlMs: 0 });
const cryptoBreaker = createCircuitBreaker<ListCryptoQuotesResponse>({ name: 'Crypto Quotes' });

const emptyStockFallback: ListMarketQuotesResponse = { quotes: [], finnhubSkipped: false, skipReason: '', rateLimited: false };
const emptyCommodityFallback: ListCommodityQuotesResponse = { quotes: [] };
const emptyCryptoFallback: ListCryptoQuotesResponse = { quotes: [] };

// ---- Proto -> legacy adapters ----

function toMarketData(proto: ProtoMarketQuote, meta?: { name?: string; display?: string }): MarketData {
  return {
    symbol: proto.symbol,
    name: meta?.name || proto.name,
    display: meta?.display || proto.display || proto.symbol,
    price: proto.price != null ? proto.price : null,
    change: proto.change ?? null,
    sparkline: proto.sparkline.length > 0 ? proto.sparkline : undefined,
  };
}

function toCommodityMarketData(proto: ProtoCommodityQuote, meta?: { name?: string; display?: string }): MarketData {
  return {
    symbol: proto.symbol,
    name: meta?.name || proto.name,
    display: meta?.display || proto.display || proto.symbol,
    price: proto.price != null ? proto.price : null,
    change: proto.change ?? null,
    sparkline: proto.sparkline.length > 0 ? proto.sparkline : undefined,
  };
}

function toCryptoData(proto: ProtoCryptoQuote): CryptoData {
  return {
    name: proto.name,
    symbol: proto.symbol,
    price: proto.price,
    change: proto.change,
    sparkline: proto.sparkline.length > 0 ? proto.sparkline : undefined,
  };
}

// ========================================================================
// Exported types (preserving legacy interface)
// ========================================================================

export interface MarketFetchResult {
  data: MarketData[];
  skipped?: boolean;
  reason?: string;
  rateLimited?: boolean;
}

// ========================================================================
// Stocks -- replaces fetchMultipleStocks + fetchStockQuote
// ========================================================================

const lastSuccessfulByKey = new Map<string, MarketData[]>();

function symbolSetKey(symbols: string[]): string {
  return [...symbols].sort().join(',');
}

export async function fetchMultipleStocks(
  symbols: Array<{ symbol: string; name: string; display: string }>,
  options: { onBatch?: (results: MarketData[]) => void; useCommodityBreaker?: boolean } = {},
): Promise<MarketFetchResult> {
  const allSymbolStrings = symbols.map((s) => s.symbol);
  const setKey = symbolSetKey(allSymbolStrings);
  const symbolMetaMap = new Map(symbols.map((s) => [s.symbol, s]));

  const commodityMode = !!options.useCommodityBreaker;
  if (commodityMode) {
    const resp = await commodityBreaker.execute(async () => {
      return client.listCommodityQuotes({ symbols: allSymbolStrings });
    }, emptyCommodityFallback);

    const returnedSymbols = new Set(resp.quotes.map((q) => q.symbol));
    const results = resp.quotes.map((q) => {
      const meta = symbolMetaMap.get(q.symbol);
      return toCommodityMarketData(q as ProtoCommodityQuote, meta);
    });

    for (const sym of symbols) {
      if (!returnedSymbols.has(sym.symbol)) {
        results.push({ symbol: sym.symbol, name: sym.name, display: sym.display || sym.symbol, price: null, change: null });
      }
    }

    if (results.length > 0) {
      options.onBatch?.(results);
      lastSuccessfulByKey.set(setKey, results);
    }

    return {
      data: results.length > 0 ? results : (lastSuccessfulByKey.get(setKey) || []),
    };
  }

  const resp = await stockBreaker.execute(async () => {
    return client.listMarketQuotes({ symbols: allSymbolStrings });
  }, emptyStockFallback);

  const returnedSymbols = new Set(resp.quotes.map((q) => q.symbol));
  const results = resp.quotes.map((q) => {
    const meta = symbolMetaMap.get(q.symbol);
    return toMarketData(q as ProtoMarketQuote, meta);
  });

  // Append placeholder rows for any requested symbols the server didn't return,
  // so user-added watchlist entries always appear (with '—' for price/change).
  for (const sym of symbols) {
    if (!returnedSymbols.has(sym.symbol)) {
      results.push({ symbol: sym.symbol, name: sym.name, display: sym.display || sym.symbol, price: null, change: null });
    }
  }

  // Fire onBatch with whatever we got
  if (results.length > 0) {
    options.onBatch?.(results);
    lastSuccessfulByKey.set(setKey, results);
  }

  const data = results.length > 0 ? results : (lastSuccessfulByKey.get(setKey) || []);
  return {
    data,
    skipped: resp.finnhubSkipped || undefined,
    reason: resp.skipReason || undefined,
    rateLimited: resp.rateLimited || undefined,
  };
}

export async function fetchStockQuote(
  symbol: string,
  name: string,
  display: string,
): Promise<MarketData> {
  const result = await fetchMultipleStocks([{ symbol, name, display }]);
  return result.data[0] || { symbol, name, display, price: null, change: null };
}

// ========================================================================
// Crypto -- replaces fetchCrypto
// ========================================================================

let lastSuccessfulCrypto: CryptoData[] = [];

export async function fetchCrypto(): Promise<CryptoData[]> {
  const hydrated = getHydratedData('cryptoQuotes') as ListCryptoQuotesResponse | undefined;
  if (hydrated?.quotes?.length) {
    const mapped = hydrated.quotes.map(toCryptoData).filter(c => c.price > 0);
    if (mapped.length > 0) { lastSuccessfulCrypto = mapped; return mapped; }
  }

  const resp = await cryptoBreaker.execute(async () => {
    return client.listCryptoQuotes({ ids: [] }); // empty = all defaults
  }, emptyCryptoFallback);

  const results = resp.quotes
    .map(toCryptoData)
    .filter(c => c.price > 0);

  if (results.length > 0) {
    lastSuccessfulCrypto = results;
    return results;
  }

  return lastSuccessfulCrypto;
}
