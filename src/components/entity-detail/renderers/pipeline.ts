import type { Pipeline } from '@/types';
import { row, rowTags, statusBadgeClass } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';
import { fetchGdeltArticles, formatArticleDate, extractDomain, type GdeltArticle } from '@/services/gdelt-intel';
import { sanitizeUrl } from '@/utils/sanitize';
import { applyArticleLinkDataset } from '@/services/article-open';

const PIPELINE_DESC: Record<string, string> = {
  oil: 'Crude oil pipeline transporting petroleum between production fields and terminals.',
  gas: 'Natural gas pipeline providing energy transport infrastructure.',
  products: 'Refined petroleum products pipeline (gasoline, diesel, jet fuel).',
};

const TYPE_KEYWORDS: Record<string, string[]> = {
  oil: ['oil pipeline', 'crude oil'],
  gas: ['gas pipeline', 'natural gas'],
  products: ['petroleum pipeline', 'refined products'],
};

function buildPipelineQuery(pipeline: Pipeline): string {
  const nameTerms: string[] = [`"${pipeline.name}"`];
  if (pipeline.operator) nameTerms.push(`"${pipeline.operator}"`);

  const countries: string[] = [];
  if (pipeline.origin?.country) countries.push(pipeline.origin.country);
  if (pipeline.destination?.country) countries.push(pipeline.destination.country);
  if (pipeline.transitCountries) countries.push(...pipeline.transitCountries);
  if (pipeline.countries) countries.push(...pipeline.countries);
  const uniqueCountries = [...new Set(countries.filter(Boolean))];

  const typeTerms = TYPE_KEYWORDS[pipeline.type] ?? [];

  let query = `(${nameTerms.join(' OR ')})`;
  if (uniqueCountries.length > 0 && uniqueCountries.length <= 4) {
    query += ` ${uniqueCountries.join(' ')}`;
  }
  if (typeTerms.length > 0) {
    query += ` (${typeTerms.join(' OR ')})`;
  }
  return `${query} sourcelang:eng`;
}

function buildArticleEl(ctx: EntityRenderContext, article: GdeltArticle): HTMLElement {
  const domain = article.source || extractDomain(article.url);
  const timeAgo = formatArticleDate(article.date);
  const toneClass = article.tone ? (article.tone < -2 ? 'tone-negative' : article.tone > 2 ? 'tone-positive' : '') : '';

  const link = ctx.el('a', `gdelt-intel-article ${toneClass}`.trim()) as HTMLAnchorElement;
  link.href = sanitizeUrl(article.url) ?? '#';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const header = ctx.el('div', 'article-header');
  header.append(ctx.el('span', 'article-source', domain));
  header.append(ctx.el('span', 'article-time', timeAgo));
  link.append(header);
  link.append(ctx.el('div', 'article-title', article.title));

  applyArticleLinkDataset(link, {
    url: article.url,
    title: article.title,
    source: domain,
    publishedAt: article.date,
  });

  return link;
}

export class PipelineRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const pipeline = data as Pipeline;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', pipeline.name));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(pipeline.type.toUpperCase(), 'edp-badge'));
    badgeRow.append(ctx.badge(pipeline.status.toUpperCase(), statusBadgeClass(pipeline.status)));
    header.append(badgeRow);
    container.append(header);

    // Description
    container.append(ctx.el('p', 'edp-description', PIPELINE_DESC[pipeline.type] ?? 'Energy infrastructure pipeline.'));

    // Pipeline Info
    const [detailCard, detailBody] = ctx.sectionCard('Pipeline Info');
    if (pipeline.operator) detailBody.append(row(ctx, 'Operator', pipeline.operator));
    if (pipeline.capacity) detailBody.append(row(ctx, 'Capacity', pipeline.capacity));
    if (pipeline.capacityMbpd) detailBody.append(row(ctx, 'Capacity', `${pipeline.capacityMbpd} Mbpd`));
    if (pipeline.capacityBcmY) detailBody.append(row(ctx, 'Capacity', `${pipeline.capacityBcmY} BCM/yr`));
    if (pipeline.length) detailBody.append(row(ctx, 'Length', pipeline.length));
    container.append(detailCard);

    // Route
    if (pipeline.origin || pipeline.destination) {
      const [routeCard, routeBody] = ctx.sectionCard('Route');
      if (pipeline.origin) {
        const origin = [pipeline.origin.name, pipeline.origin.country].filter(Boolean).join(', ');
        routeBody.append(row(ctx, 'Origin', origin));
      }
      if (pipeline.destination) {
        const dest = [pipeline.destination.name, pipeline.destination.country].filter(Boolean).join(', ');
        routeBody.append(row(ctx, 'Destination', dest));
      }
      if (pipeline.transitCountries && pipeline.transitCountries.length > 0) {
        rowTags(ctx, routeBody, 'Transit', pipeline.transitCountries);
      }
      container.append(routeCard);
    } else if (pipeline.countries && pipeline.countries.length > 0) {
      const [routeCard, routeBody] = ctx.sectionCard('Countries');
      const tags = ctx.el('div', 'edp-tags');
      for (const c of pipeline.countries) tags.append(ctx.badge(c, 'edp-tag'));
      routeBody.append(tags);
      container.append(routeCard);
    }

    // Related News placeholder (replaced by renderEnriched)
    const [newsCard, newsBody] = ctx.sectionCard('Related News');
    newsCard.classList.add('edp-pipeline-news');
    newsBody.append(ctx.makeLoading('Fetching related news…'));
    container.append(newsCard);

    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<GdeltArticle[]> {
    const pipeline = data as Pipeline;
    const query = buildPipelineQuery(pipeline);
    const articles = await fetchGdeltArticles(query, 6, '72h');
    if (signal.aborted) return [];
    return articles;
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const articles = enrichedData as GdeltArticle[];
    const newsCard = container.querySelector<HTMLElement>('.edp-pipeline-news');
    if (!newsCard) return;

    const newsBody = newsCard.querySelector<HTMLElement>('.edp-card-body');
    if (!newsBody) return;

    if (!articles.length) {
      newsBody.replaceChildren(ctx.makeEmpty('No recent news found for this pipeline.'));
      return;
    }

    const list = ctx.el('div', 'gdelt-intel-articles');
    for (const article of articles) {
      list.append(buildArticleEl(ctx, article));
    }
    newsBody.replaceChildren(list);
  }
}
