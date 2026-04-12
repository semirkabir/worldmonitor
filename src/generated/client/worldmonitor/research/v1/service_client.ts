// Manually maintained fallback while buf-generated files are unavailable locally.
export { ApiError, ValidationError } from '../../../_generic';
import { GenericServiceClient } from '../../../_generic';

export interface ArxivPaper { id: string; title: string; summary: string; authors: string[]; categories: string[]; publishedAt: number; url: string; }
export interface GithubRepo { fullName: string; description: string; language: string; stars: number; starsToday: number; forks: number; url: string; }
export interface HackernewsItem { id: number; title: string; url: string; score: number; commentCount: number; by: string; submittedAt: number; }
export interface TechEventCoords { lat: number; lng: number; country: string; original: string; virtual: boolean; }
export interface TechEvent { id: string; title: string; type: string; location: string; coords: TechEventCoords; startDate: string; endDate: string; url: string; source: string; description: string; }

export interface ListArxivPapersResponse { papers: ArxivPaper[]; pagination?: { nextCursor: string; totalCount: number }; }
export interface ListTrendingReposResponse { repos: GithubRepo[]; pagination?: { nextCursor: string; totalCount: number }; }
export interface ListHackernewsItemsResponse { items: HackernewsItem[]; pagination?: { nextCursor: string; totalCount: number }; }
export interface ListTechEventsResponse { success: boolean; count: number; conferenceCount: number; mappableCount: number; lastUpdated: string; events: TechEvent[]; error: string; }

export class ResearchServiceClient extends GenericServiceClient {
  constructor(baseURL: string, options?: { fetch?: typeof fetch; defaultHeaders?: Record<string, string> }) { super('research', baseURL, options); }
  declare listArxivPapers: (req?: { pageSize?: number; cursor?: string; category?: string; query?: string }) => Promise<ListArxivPapersResponse>;
  declare listTrendingRepos: (req?: { pageSize?: number; cursor?: string; language?: string; period?: string }) => Promise<ListTrendingReposResponse>;
  declare listHackernewsItems: (req?: { pageSize?: number; cursor?: string; feedType?: string }) => Promise<ListHackernewsItemsResponse>;
  declare listTechEvents: (req?: { type?: string; mappable?: boolean; limit?: number; days?: number }) => Promise<ListTechEventsResponse>;
}
