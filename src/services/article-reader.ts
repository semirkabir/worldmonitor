import { proxyUrl } from '../utils/proxy';

const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface ArticleContent {
  title: string;
  byline: string;
  content: string;
  imageUrl: string;
  url: string;
  cached: boolean;
}

export interface ArticleError {
  error: string;
  url: string;
}

const inMemoryCache = new Map<string, { data: ArticleContent | ArticleError; timestamp: number }>();
const inFlightRequests = new Map<string, Promise<ArticleContent | ArticleError>>();

/**
 * Fetches and extracts readable article content via the server endpoint.
 * Uses a two-tier caching strategy:
 * - Client-side in-memory cache (5 min TTL) for instant back/forth navigation
 * - Server-side Redis cache (15 min TTL) shared across all users
 * - Request coalescing: concurrent clicks on same URL share one fetch
 */
export async function fetchArticle(articleUrl: string): Promise<ArticleContent | ArticleError> {
  // Check client-side cache first
  const cached = inMemoryCache.get(articleUrl);
  if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL) {
    return cached.data;
  }

  // Check for in-flight request (coalescing)
  const inFlight = inFlightRequests.get(articleUrl);
  if (inFlight) {
    return inFlight;
  }

  // Start the fetch
  const promise = doFetchArticle(articleUrl).then(result => {
    inMemoryCache.set(articleUrl, { data: result, timestamp: Date.now() });
    inFlightRequests.delete(articleUrl);
    return result;
  }).catch(error => {
    inFlightRequests.delete(articleUrl);
    throw error;
  });

  inFlightRequests.set(articleUrl, promise);
  return promise;
}

async function doFetchArticle(articleUrl: string): Promise<ArticleContent | ArticleError> {
  const apiUrl = proxyUrl(`/api/fetch-article?url=${encodeURIComponent(articleUrl)}`);

  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      error: data.error || 'Failed to fetch article',
      url: articleUrl,
    };
  }

  return {
    title: data.title || '',
    byline: data.byline || '',
    content: data.content || '',
    imageUrl: data.imageUrl || '',
    url: data.url || articleUrl,
    cached: data.cached || false,
  };
}

/**
 * Clears the client-side cache for a specific URL.
 */
export function clearArticleCache(articleUrl: string): void {
  inMemoryCache.delete(articleUrl);
}

/**
 * Clears the entire client-side cache.
 */
export function clearAllArticleCache(): void {
  inMemoryCache.clear();
}
