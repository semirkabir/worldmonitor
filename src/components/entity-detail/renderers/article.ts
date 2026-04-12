import { fetchArticle, type ArticleContent, type ArticleError } from '@/services/article-reader';
import type { ArticleDetailData } from '@/services/article-open';
import { sanitizeUrl } from '@/utils/sanitize';
import { rawHtml, replaceChildren } from '@/utils/dom-utils';
import type { EntityRenderer, EntityRenderContext } from '../types';

interface ArticleEnrichedData {
  article: ArticleDetailData;
  result: ArticleContent | ArticleError;
}

const SAFE_TAGS = new Set([
  'a', 'article', 'blockquote', 'br', 'code', 'div', 'em', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'hr', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong',
  'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
]);
const SAFE_ATTRS = new Set(['alt', 'class', 'colspan', 'href', 'loading', 'rel', 'rowspan', 'src', 'target', 'title']);

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatPublishedAt(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sanitizeArticleHtml(html: string): DocumentFragment {
  const fragment = rawHtml(html);
  const walk = (parent: Element | DocumentFragment): void => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (!SAFE_TAGS.has(tag)) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        continue;
      }
      for (const attr of Array.from(el.attributes)) {
        if (!SAFE_ATTRS.has(attr.name.toLowerCase())) {
          el.removeAttribute(attr.name);
        }
      }
      if (tag === 'a') {
        const safeHref = sanitizeUrl(el.getAttribute('href') || '');
        if (!safeHref) {
          el.removeAttribute('href');
        } else {
          el.setAttribute('href', safeHref);
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
      }
      if (tag === 'img') {
        const safeSrc = sanitizeUrl(el.getAttribute('src') || '');
        if (!safeSrc) {
          el.remove();
          continue;
        }
        el.setAttribute('src', safeSrc);
        el.setAttribute('loading', 'lazy');
        (el as HTMLImageElement).referrerPolicy = 'no-referrer';
      }
      walk(el);
    }
  };
  walk(fragment);
  return fragment;
}

function buildExternalLink(ctx: EntityRenderContext, article: ArticleDetailData): HTMLAnchorElement {
  const link = ctx.el('a', 'edp-article-open-original') as HTMLAnchorElement;
  link.href = article.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open original';
  return link;
}

export class ArticleRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const article = data as ArticleDetailData;
    const container = ctx.el('div', 'edp-article-detail');

    const header = ctx.el('section', 'edp-header edp-header-card edp-article-header');
    header.append(ctx.el('div', 'edp-article-source', article.source || extractDomain(article.url)));
    header.append(ctx.el('h2', 'edp-title edp-article-title', article.title));
    const publishedAt = formatPublishedAt(article.publishedAt);
    if (publishedAt) header.append(ctx.el('div', 'edp-subtitle edp-article-date', publishedAt));
    header.append(buildExternalLink(ctx, article));
    container.append(header);

    const host = ctx.el('div', 'edp-article-host');
    host.append(ctx.makeLoading('Loading article...'));
    container.append(host);
    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<ArticleEnrichedData> {
    const article = data as ArticleDetailData;
    const result = await fetchArticle(article.url);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return { article, result };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const { article, result } = enrichedData as ArticleEnrichedData;
    const host = container.querySelector<HTMLElement>('.edp-article-host');
    if (!host) return;

    if ('error' in result) {
      const errorWrap = ctx.el('div', 'edp-article-error');
      errorWrap.append(
        ctx.el('div', 'edp-article-error-icon', '⚠'),
        ctx.el('div', 'edp-article-error-title', 'Unable to load article'),
        ctx.el('div', 'edp-article-error-detail', result.error),
        buildExternalLink(ctx, article),
      );
      replaceChildren(host, errorWrap);
      return;
    }

    const articleWrap = ctx.el('article', 'edp-article-reader');
    const byline = result.byline.trim();
    const resolvedTitle = result.title.trim() || article.title;
    const resolvedSource = article.source || extractDomain(article.url);

    const meta = ctx.el('div', 'edp-article-meta');
    meta.append(ctx.el('span', 'edp-article-meta-source', resolvedSource));
    if (byline) meta.append(ctx.el('span', 'edp-article-meta-byline', byline));
    articleWrap.append(meta);

    if (resolvedTitle && resolvedTitle !== article.title) {
      articleWrap.append(ctx.el('h3', 'edp-article-resolved-title', resolvedTitle));
    }

    if (result.imageUrl) {
      const hero = ctx.el('div', 'edp-article-hero');
      const image = ctx.el('img', 'edp-article-hero-img') as HTMLImageElement;
      image.src = sanitizeUrl(result.imageUrl);
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.onerror = () => hero.remove();
      hero.append(image);
      articleWrap.append(hero);
    }

    const content = ctx.el('div', 'edp-article-content');
    content.append(sanitizeArticleHtml(result.content));
    articleWrap.append(content);

    const footer = ctx.el('div', 'edp-article-footer');
    if (result.cached) footer.append(ctx.el('span', 'edp-article-cached', 'Cached copy'));
    footer.append(buildExternalLink(ctx, article));
    articleWrap.append(footer);

    replaceChildren(host, articleWrap);
  }
}
