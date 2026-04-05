import type { Hotspot } from '@/types';
import { t } from '@/services/i18n';
import {
  IntelligenceServiceClient,
  type GdeltArticle as ProtoGdeltArticle,
  type SearchGdeltDocumentsResponse,
} from '@/generated/client/worldmonitor/intelligence/v1/service_client';

export interface GdeltArticle {
  title: string;
  url: string;
  source: string;
  date: string;
  image?: string;
  language?: string;
  tone?: number;
}

export interface IntelTopic {
  id: string;
  name: string;
  query: string;
  icon: string;
  description: string;
}

export interface TopicIntelligence {
  topic: IntelTopic;
  articles: GdeltArticle[];
  fetchedAt: Date;
}

export const INTEL_TOPICS: IntelTopic[] = [
  {
    id: 'cyber',
    name: 'Cyber Threats',
    query: '(cyberattack OR ransomware OR hacking OR "data breach" OR APT) sourcelang:eng',
    icon: '🔓',
    description: 'Cyber attacks, ransomware, and digital threats',
  },
  {
    id: 'ukraine',
    name: 'Ukraine',
    query: 'Ukraine OR Zelensky OR "Russian invasion"',
    icon: '🇺🇦',
    description: 'Ukraine war and related military activity',
  },
  {
    id: 'iran-war',
    name: 'Iran War',
    query: 'Iran OR Israel OR Gaza OR Hezbollah',
    icon: '🇮🇷',
    description: 'Iran-Israel conflict and Middle East tensions',
  },
  {
    id: 'china-taiwan',
    name: 'China, Taiwan',
    query: 'Taiwan OR "Xi Jinping" OR PLA',
    icon: '🇨🇳',
    description: 'China-Taiwan tensions and Indo-Pacific security',
  },
];

export const POSITIVE_GDELT_TOPICS: IntelTopic[] = [
  {
    id: 'science-breakthroughs',
    name: 'Science Breakthroughs',
    query: '(breakthrough OR discovery OR "new treatment" OR "clinical trial success") sourcelang:eng',
    icon: '',
    description: 'Scientific discoveries and medical advances',
  },
  {
    id: 'climate-progress',
    name: 'Climate Progress',
    query: '(renewable energy OR "solar installation" OR "wind farm" OR "emissions decline" OR "green hydrogen") sourcelang:eng',
    icon: '',
    description: 'Renewable energy milestones and climate wins',
  },
  {
    id: 'conservation-wins',
    name: 'Conservation Wins',
    query: '(species recovery OR "population rebound" OR "conservation success" OR "habitat restored" OR "marine sanctuary") sourcelang:eng',
    icon: '',
    description: 'Wildlife recovery and habitat restoration',
  },
  {
    id: 'humanitarian-progress',
    name: 'Humanitarian Progress',
    query: '(poverty decline OR "literacy rate" OR "vaccination campaign" OR "peace agreement" OR "humanitarian aid") sourcelang:eng',
    icon: '',
    description: 'Poverty reduction, education, and peace',
  },
  {
    id: 'innovation',
    name: 'Innovation',
    query: '("clean technology" OR "AI healthcare" OR "3D printing" OR "electric vehicle" OR "fusion energy") sourcelang:eng',
    icon: '',
    description: 'Technology for good and clean innovation',
  },
];

export function getIntelTopics(): IntelTopic[] {
  return INTEL_TOPICS.map(topic => ({
    ...topic,
    name: t(`intel.topics.${topic.id}.name`),
    description: t(`intel.topics.${topic.id}.description`),
  }));
}

// ---- Sebuf client ----

const client = new IntelligenceServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });
const CACHE_TTL = 5 * 60 * 1000;
const articleCache = new Map<string, { articles: GdeltArticle[]; timestamp: number }>();

/** Map proto GdeltArticle (all required strings) to service GdeltArticle (optional fields) */
function toGdeltArticle(a: ProtoGdeltArticle): GdeltArticle {
  return {
    title: a.title,
    url: a.url,
    source: a.source,
    date: a.date,
    image: a.image || undefined,
    language: a.language || undefined,
    tone: a.tone || undefined,
  };
}

export async function fetchGdeltArticles(
  query: string,
  maxrecords = 10,
  timespan = '24h'
): Promise<GdeltArticle[]> {
  const cacheKey = `${query}:${maxrecords}:${timespan}`;
  const cached = articleCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.articles;
  }

  console.log(`[GDELT-Intel] fetchGdeltArticles: query="${query.slice(0,80)}", maxrecords=${maxrecords}, timespan=${timespan}`);
  const articles = await fetchGdeltDirect(query, maxrecords, timespan);
  articleCache.set(cacheKey, { articles, timestamp: Date.now() });
  return articles;
}

async function fetchGdeltDirect(
  query: string,
  maxRecords: number,
  timespan: string,
): Promise<GdeltArticle[]> {
  // GDELT API — try multiple methods in order of preference:
  // 1. Direct browser call (works in production, CORS supported)
  // 2. Vite proxy (works in local dev via /api/gdelt rewrite in vite.config.ts)
  // 3. Server RPC (fallback, currently broken in edge runtime)

  const buildGdeltParams = () => {
    const p = new URLSearchParams();
    p.set('query', query);
    p.set('mode', 'artlist');
    p.set('maxrecords', String(maxRecords));
    p.set('format', 'json');
    p.set('sort', 'date');
    p.set('timespan', timespan);
    return p.toString();
  };

  const params = buildGdeltParams();

  // Try 1: direct GDELT API
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) throw new Error(`GDELT returned ${resp.status}`);
    const text = await resp.text();
    if (!text.startsWith('{')) throw new Error(`GDELT returned non-JSON: ${text.slice(0, 80)}`);
    const data = JSON.parse(text);
    const articles: GdeltArticle[] = (data.articles || []).map((a: any) => toGdeltArticleRaw(a));
    console.log(`[GDELT-Intel] Direct result: ${articles.length} articles`);
    return articles;
  } catch (e) {
    console.warn(`[GDELT-Intel] Direct GDELT call failed:`, e);
  }

  // Try 2: Vite dev proxy (/api/gdelt → https://api.gdeltproject.org)
  try {
    const url = `/api/gdelt/api/v2/doc/doc?${params}`;  // relative URL — fetch() resolves automatically
    const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) throw new Error(`Proxy returned ${resp.status}`);
    const text = await resp.text();
    if (!text.startsWith('{')) throw new Error(`Proxy returned non-JSON: ${text.slice(0, 80)}`);
    const data = JSON.parse(text);
    const articles: GdeltArticle[] = (data.articles || []).map((a: any) => toGdeltArticleRaw(a));
    console.log(`[GDELT-Intel] Proxy result: ${articles.length} articles`);
    return articles;
  } catch (e) {
    console.warn(`[GDELT-Intel] Vite proxy call failed:`, e);
  }

  // Try 3: server RPC
  try {
    const rpcResp = await client.searchGdeltDocuments({
      query, maxRecords, timespan, toneFilter: '', sort: '',
    });
    if (!rpcResp.articles?.length) return [];
    return (rpcResp.articles as ProtoGdeltArticle[]).map(toGdeltArticle);
  } catch {
    return [];
  }
}

function toGdeltArticleRaw(a: any): GdeltArticle {
  return {
    title: a.title || '',
    url: a.url || '',
    source: a.domain || a.source?.domain || '',
    date: a.seendate || '',
    image: a.socialimage || undefined,
    language: a.language || undefined,
    tone: typeof a.tone === 'number' ? a.tone : undefined,
  };
}

export async function fetchHotspotContext(hotspot: Hotspot): Promise<GdeltArticle[]> {
  const keywords = hotspot.keywords;
  console.log('[GDELT] fetchHotspotContext - hotspot:', hotspot.name, 'keywords:', keywords);
  
  if (!keywords || keywords.length === 0) {
    console.warn('[GDELT] No keywords for hotspot:', hotspot.name);
    return [];
  }
  
  const query = `(${keywords.slice(0, 5).join(' OR ')})`;
  console.log('[GDELT] Query:', query);
  const articles = await fetchGdeltArticles(query, 8, '48h');
  console.log('[GDELT] Results:', articles.length, 'articles for hotspot:', hotspot.name);
  return articles;
}

export async function fetchTopicIntelligence(topic: IntelTopic): Promise<TopicIntelligence> {
  const articles = await fetchGdeltArticles(topic.query, 10, '24h');
  return {
    topic,
    articles,
    fetchedAt: new Date(),
  };
}

export async function fetchAllTopicIntelligence(): Promise<TopicIntelligence[]> {
  const results = await Promise.allSettled(
    INTEL_TOPICS.map(topic => fetchTopicIntelligence(topic))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<TopicIntelligence> => r.status === 'fulfilled')
    .map(r => r.value);
}

export function formatArticleDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    // GDELT returns compact format: "20260111T093000Z"
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const hour = dateStr.slice(9, 11);
    const min = dateStr.slice(11, 13);
    const sec = dateStr.slice(13, 15);
    const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
    if (isNaN(date.getTime())) return '';

    const now = Date.now();
    const diff = now - date.getTime();

    if (diff < 0) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  } catch {
    return '';
  }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

// ---- Positive GDELT queries (Happy variant) ----

export async function fetchPositiveGdeltArticles(
  query: string,
  toneFilter = 'tone>5',
  sort = 'ToneDesc',
  maxrecords = 15,
  timespan = '72h',
): Promise<GdeltArticle[]> {
  const cacheKey = `positive:${query}:${toneFilter}:${sort}:${maxrecords}:${timespan}`;
  const cached = articleCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.articles;
  }

  // Call GDELT API directly — circuit breaker causes cross-topic cache pollution
  let resp: SearchGdeltDocumentsResponse;
  try {
    resp = await client.searchGdeltDocuments({
      query,
      maxRecords: maxrecords,
      timespan,
      toneFilter,
      sort,
    });
  } catch (e) {
    console.warn(`[GDELT-Intel] Positive RPC error:`, e);
    return cached?.articles || [];
  }

  const articles: GdeltArticle[] = (resp.articles || []).map(toGdeltArticle);
  articleCache.set(cacheKey, { articles, timestamp: Date.now() });
  return articles;
}

export async function fetchPositiveTopicIntelligence(topic: IntelTopic): Promise<TopicIntelligence> {
  const articles = await fetchPositiveGdeltArticles(topic.query);
  return { topic, articles, fetchedAt: new Date() };
}

export async function fetchAllPositiveTopicIntelligence(): Promise<TopicIntelligence[]> {
  const results = await Promise.allSettled(
    POSITIVE_GDELT_TOPICS.map(topic => fetchPositiveTopicIntelligence(topic))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<TopicIntelligence> => r.status === 'fulfilled')
    .map(r => r.value);
}
