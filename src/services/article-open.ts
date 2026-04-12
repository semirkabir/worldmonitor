import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';

export interface ArticleDetailData {
  url: string;
  title: string;
  source?: string;
  publishedAt?: string;
}

const NON_ARTICLE_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'vimeo.com',
  'player.vimeo.com',
  'tiktok.com',
  'www.tiktok.com',
  'instagram.com',
  'www.instagram.com',
  'twitter.com',
  'x.com',
  'www.x.com',
  'soundcloud.com',
  'spotify.com',
  'open.spotify.com',
];

const NON_ARTICLE_PATH_PARTS = [
  '/video/',
  '/videos/',
  '/video-clip/',
  '/watch/',
  '/live/',
  '/liveblog/',
  '/audio/',
  '/podcast/',
  '/podcasts/',
  '/gallery/',
  '/galleries/',
  '/photos/',
  '/photo/',
  '/picture/',
  '/pictures/',
  '/newsfeed/',
  '/shorts/',
  '/reel/',
  '/embed/',
];

const NON_ARTICLE_EXTENSIONS = ['.mp4', '.mp3', '.m3u8', '.mov', '.avi', '.wav'];

function isLikelyReadableArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (NON_ARTICLE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      return false;
    }
    if (NON_ARTICLE_PATH_PARTS.some((part) => pathname.includes(part))) {
      return false;
    }
    if (NON_ARTICLE_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

interface ArticleLinkOptions {
  url: string;
  title: string;
  source?: string | null;
  publishedAt?: string | Date | null;
}

function toPublishedAtValue(value?: string | Date | null): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function buildArticleDetailData(options: ArticleLinkOptions): ArticleDetailData | null {
  const safeUrl = sanitizeUrl(options.url);
  const title = options.title.trim();
  if (!safeUrl || !title || !isLikelyReadableArticleUrl(safeUrl)) return null;
  return {
    url: safeUrl,
    title,
    source: options.source?.trim() || undefined,
    publishedAt: toPublishedAtValue(options.publishedAt) || undefined,
  };
}

export function buildArticleLinkDataset(options: ArticleLinkOptions): Record<string, string> | null {
  const detail = buildArticleDetailData(options);
  if (!detail) return null;
  const dataset: Record<string, string> = {
    articleUrl: detail.url,
    articleTitle: detail.title,
  };
  if (detail.source) dataset.articleSource = detail.source;
  if (detail.publishedAt) dataset.articlePublishedAt = detail.publishedAt;
  return dataset;
}

export function buildArticleLinkAttributes(options: ArticleLinkOptions): string {
  const dataset = buildArticleLinkDataset(options);
  if (!dataset) return '';
  return Object.entries(dataset)
    .map(([key, value]) => `data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${escapeHtml(value)}"`)
    .join(' ');
}

export function applyArticleLinkDataset(el: HTMLElement, options: ArticleLinkOptions): void {
  const dataset = buildArticleLinkDataset(options);
  if (!dataset) return;
  Object.assign(el.dataset, dataset);
}

export function isModifiedArticleClick(event: MouseEvent): boolean {
  return event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey;
}

export function readArticleDetailFromElement(el: HTMLElement): ArticleDetailData | null {
  const url = el.dataset.articleUrl || '';
  const title = el.dataset.articleTitle || '';
  return buildArticleDetailData({
    url,
    title,
    source: el.dataset.articleSource,
    publishedAt: el.dataset.articlePublishedAt,
  });
}

export function dispatchArticleDetail(data: ArticleDetailData): boolean {
  document.dispatchEvent(new CustomEvent('wm:open-entity-detail', {
    detail: { type: 'article', data },
  }));
  return true;
}

export function openArticleFromElement(el: HTMLElement): boolean {
  const detail = readArticleDetailFromElement(el);
  if (!detail) return false;
  return dispatchArticleDetail(detail);
}

export function openArticleFromClick(event: MouseEvent, el: HTMLElement): boolean {
  if (isModifiedArticleClick(event)) return false;
  const didOpen = openArticleFromElement(el);
  if (!didOpen) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}
