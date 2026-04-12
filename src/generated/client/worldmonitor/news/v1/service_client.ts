// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export type ThreatLevel = 'THREAT_LEVEL_UNSPECIFIED' | 'THREAT_LEVEL_LOW' | 'THREAT_LEVEL_MEDIUM' | 'THREAT_LEVEL_HIGH' | 'THREAT_LEVEL_CRITICAL';

export interface ThreatClassification { level: ThreatLevel; category: string; confidence: number; source: string; }
export interface NewsItem { source: string; title: string; link: string; publishedAt: number; isAlert: boolean; threat: ThreatClassification; location: { latitude: number; longitude: number }; locationName: string; }
export interface CategoryBucket { items: NewsItem[]; }

export interface SummarizeArticleResponse { summary: string; model: string; provider: string; tokens: number; fallback: boolean; error: string; errorType: string; status: string; statusDetail: string; }
export interface ListFeedDigestResponse { categories: Record<string, CategoryBucket>; feedStatuses: Record<string, string>; generatedAt: string; }

export class NewsServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('news', baseURL, options); }
  declare summarizeArticle: (req?: { provider?: string; headlines?: string[]; mode?: string; geoContext?: string; variant?: string; lang?: string }) => Promise<SummarizeArticleResponse>;
  declare getSummarizeArticleCache: (req?: { cacheKey?: string }) => Promise<SummarizeArticleResponse>;
  declare listFeedDigest: (req?: { variant?: string; lang?: string }) => Promise<ListFeedDigestResponse>;
}
