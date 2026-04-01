import type { Hotspot, NewsItem } from '@/types';
import { fetchHotspotContext, formatArticleDate, extractDomain, type GdeltArticle } from '@/services/gdelt-intel';
import { getHotspotEscalation, getEscalationChange24h } from '@/services/hotspot-escalation';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

function tokenizeForMatch(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function matchKeyword(tokens: string[], keyword: string): boolean {
  return tokens.some(t => t.includes(keyword.toLowerCase()));
}

function findMatchingKeywords(tokens: string[], keywords: string[]): string[] {
  return keywords.filter(kw => matchKeyword(tokens, kw));
}

function getRelatedNewsForHotspot(hotspot: Hotspot, allNews: NewsItem[]): NewsItem[] {
  const conflictTopics = ['gaza', 'ukraine', 'ukrainian', 'russia', 'russian', 'israel', 'israeli', 'iran', 'iranian', 'china', 'chinese', 'taiwan', 'taiwanese', 'korea', 'korean', 'syria', 'syrian'];

  return allNews
    .map((item) => {
      const tokens = tokenizeForMatch(item.title);
      const matchedKeywords = findMatchingKeywords(tokens, hotspot.keywords);

      if (matchedKeywords.length === 0) return null;

      const conflictMatches = conflictTopics.filter(t =>
        matchKeyword(tokens, t) && !hotspot.keywords.some(k => k.toLowerCase().includes(t))
      );

      if (conflictMatches.length > 0) {
        const strongLocalMatch = matchedKeywords.some(kw =>
          kw.toLowerCase() === hotspot.name.toLowerCase() ||
          hotspot.agencies?.some(a => matchKeyword(tokens, a))
        );
        if (!strongLocalMatch) return null;
      }

      const score = matchedKeywords.length;
      return { item, score };
    })
    .filter((x): x is { item: NewsItem; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.item);
}

const LEVEL_COLORS: Record<string, string> = {
  low: 'edp-badge edp-badge-status',
  elevated: 'edp-badge edp-badge-warning',
  high: 'edp-badge edp-badge-severity',
};

function buildHeader(container: HTMLElement, ctx: EntityRenderContext, hotspot: Hotspot): void {
  const header = ctx.el('div', 'edp-header');
  header.append(ctx.el('h2', 'edp-title', hotspot.name));

  const subtitleParts: string[] = [];
  if (hotspot.location) subtitleParts.push(hotspot.location);
  if (subtitleParts.length > 0) {
    header.append(ctx.el('div', 'edp-subtitle', subtitleParts.join(', ')));
  }

  const badgeRow = ctx.el('div', 'edp-badge-row');
  if (hotspot.level) {
    badgeRow.append(ctx.badge(hotspot.level.toUpperCase(), LEVEL_COLORS[hotspot.level] ?? 'edp-badge'));
  }
  if (hotspot.status) {
    badgeRow.append(ctx.badge(hotspot.status.toUpperCase(), 'edp-badge edp-badge-dim'));
  }
  if (badgeRow.childElementCount > 0) header.append(badgeRow);
  container.append(header);
}

function buildInfoCard(container: HTMLElement, ctx: EntityRenderContext, hotspot: Hotspot): void {
  const [card, body] = ctx.sectionCard('Intel Summary');

  if (hotspot.description) {
    body.append(ctx.el('p', 'edp-description', hotspot.description));
  }

  body.append(row(ctx, 'Coordinates', `${hotspot.lat.toFixed(2)}°, ${hotspot.lon.toFixed(2)}°`));
  if (hotspot.location) body.append(row(ctx, 'Location', hotspot.location));
  if (hotspot.status) body.append(row(ctx, 'Status', hotspot.status));

  container.append(card);
}

function buildEscalationCard(container: HTMLElement, ctx: EntityRenderContext, hotspot: Hotspot, dynamicScore?: { combinedScore: number; trend: string; staticBaseline: number; components: { newsActivity: number; ciiContribution: number; geoConvergence: number; militaryActivity: number }; escalationIndicators?: string[] } | null, change24h?: { change: number } | null): void {
  const ESCALATION_LABELS: Record<number, string> = {
    1: 'Stable',
    2: 'Watch',
    3: 'Elevated',
    4: 'High',
    5: 'Critical',
  };

  const [card, body] = ctx.sectionCard('Escalation Assessment');

  const score = dynamicScore?.combinedScore ?? hotspot.escalationScore ?? 3;
  const scoreInt = Math.round(score);
  const label = ESCALATION_LABELS[scoreInt] ?? 'Unknown';
  const trend = dynamicScore?.trend ?? hotspot.escalationTrend ?? 'stable';
  const trendIcons: Record<string, string> = { escalating: '↑', stable: '→', 'de-escalating': '↓' };

  const scoreDisplay = ctx.el('div', 'edp-escalation-score');
  scoreDisplay.innerHTML = `
    <span class="edp-score-value">${score.toFixed(1)}/5</span>
    <span class="edp-score-label">${label}</span>
  `;
  body.append(scoreDisplay);

  const trendDisplay = ctx.el('div', 'edp-escalation-trend');
  trendDisplay.innerHTML = `<span class="edp-trend-icon">${trendIcons[trend] || ''}</span> ${trend.toUpperCase()}`;
  body.append(trendDisplay);

  const baseline = dynamicScore?.staticBaseline ?? hotspot.escalationScore ?? 3;
  body.append(row(ctx, 'Baseline', `${baseline}/5`));

  if (change24h) {
    body.append(row(ctx, '24h Change', `${change24h.change >= 0 ? '+' : ''}${change24h.change}`));
  }

  if (dynamicScore?.components) {
    const [compCard, compBody] = ctx.sectionCard('Components');
    const components = [
      { label: 'NEWS', value: dynamicScore.components.newsActivity },
      { label: 'CII', value: dynamicScore.components.ciiContribution },
      { label: 'GEO', value: dynamicScore.components.geoConvergence },
      { label: 'MILITARY', value: dynamicScore.components.militaryActivity },
    ];

    for (const comp of components) {
      const rowEl = ctx.el('div', 'edp-component-row');
      const labelEl = ctx.el('span', 'edp-component-label', comp.label);
      const barBg = ctx.el('div', 'edp-component-bar-bg');
      const bar = ctx.el('div', 'edp-component-bar');
      bar.style.width = `${Math.min(comp.value, 100)}%`;
      barBg.append(bar);
      const valueEl = ctx.el('span', 'edp-component-value', Math.round(comp.value).toString());
      rowEl.append(labelEl, barBg, valueEl);
      compBody.append(rowEl);
    }
    container.append(compCard);
  }

  const indicators = dynamicScore?.escalationIndicators ?? hotspot.escalationIndicators;
  if (indicators && indicators.length > 0) {
    const tagWrap = ctx.el('div', 'edp-tags');
    for (const indicator of indicators) {
      tagWrap.append(ctx.badge(indicator, 'edp-tag'));
    }
    body.append(tagWrap);
  }

  container.append(card);
}

function buildAgenciesCard(container: HTMLElement, ctx: EntityRenderContext, hotspot: Hotspot): void {
  if (!hotspot.agencies || hotspot.agencies.length === 0) return;

  const [card, body] = ctx.sectionCard('Key Entities');
  const tagWrap = ctx.el('div', 'edp-tags');
  for (const agency of hotspot.agencies) {
    tagWrap.append(ctx.badge(agency, 'edp-tag'));
  }
  body.append(tagWrap);
  container.append(card);
}

function buildHistoryCard(container: HTMLElement, ctx: EntityRenderContext, hotspot: Hotspot): void {
  if (!hotspot.history) return;

  const [card, body] = ctx.sectionCard('Historical Context');

  if (hotspot.history.lastMajorEvent) {
    const date = hotspot.history.lastMajorEventDate ? ` (${hotspot.history.lastMajorEventDate})` : '';
    body.append(row(ctx, 'Last Major Event', `${hotspot.history.lastMajorEvent}${date}`));
  }
  if (hotspot.history.precedentDescription) {
    body.append(row(ctx, 'Precedent', hotspot.history.precedentDescription));
  }
  if (hotspot.history.cyclicalRisk) {
    body.append(row(ctx, 'Cyclical Risk', hotspot.history.cyclicalRisk));
  }

  container.append(card);
}

function buildWhyItMattersCard(container: HTMLElement, ctx: EntityRenderContext, hotspot: Hotspot): void {
  if (!hotspot.whyItMatters) return;

  const [card, body] = ctx.sectionCard('Why It Matters');
  body.append(ctx.el('p', 'edp-description', hotspot.whyItMatters));
  container.append(card);
}

function buildNewsCard(container: HTMLElement, ctx: EntityRenderContext, articles: GdeltArticle[], localNews: NewsItem[]): void {
  const totalItems = articles.length + localNews.length;
  const [card, body] = ctx.sectionCard(`Related Headlines (${totalItems})`);

  if (totalItems === 0) {
    body.append(ctx.makeEmpty('No recent coverage found'));
    container.append(card);
    return;
  }

  // Local news first
  for (const news of localNews.slice(0, 5)) {
    const item = ctx.el('div', 'edp-news-item');
    
    const title = ctx.el('a', 'edp-news-title', news.title || 'Untitled');
    if (news.link) {
      title.setAttribute('href', news.link);
      title.setAttribute('target', '_blank');
      title.setAttribute('rel', 'noopener noreferrer');
    }
    item.append(title);

    const meta = ctx.el('div', 'edp-news-meta');
    const parts = [news.source || '', news.pubDate ? formatArticleDate(news.pubDate.toISOString()) : ''].filter(Boolean);
    meta.textContent = parts.join(' · ');
    item.append(meta);

    body.append(item);
  }

  // GDELT articles
  for (const article of articles.slice(0, 6)) {
    const item = ctx.el('div', 'edp-news-item');
    
    const title = ctx.el('a', 'edp-news-title', article.title || 'Untitled');
    if (article.url) {
      title.setAttribute('href', article.url);
      title.setAttribute('target', '_blank');
      title.setAttribute('rel', 'noopener noreferrer');
    }
    item.append(title);

    const meta = ctx.el('div', 'edp-news-meta');
    const parts = [extractDomain(article.url), formatArticleDate(article.date)].filter(Boolean);
    meta.textContent = parts.join(' · ');
    item.append(meta);

    if (article.image) {
      const img = ctx.el('img', 'edp-news-image') as HTMLImageElement;
      img.src = article.image;
      img.alt = '';
      img.loading = 'lazy';
      item.append(img);
    }

    body.append(item);
  }

  container.append(card);
}

interface HotspotEnrichedData {
  hotspot: Hotspot;
  articles: GdeltArticle[];
  localNews: NewsItem[];
  dynamicScore: ReturnType<typeof getHotspotEscalation>;
  change24h: ReturnType<typeof getEscalationChange24h>;
}

export class HotspotRenderer implements EntityRenderer {
  private getNews: () => NewsItem[] = () => [];

  setNewsGetter(getter: () => NewsItem[]): void {
    this.getNews = getter;
  }

  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const hotspot = data as Hotspot;
    const dynamicScore = getHotspotEscalation(hotspot.id);
    const change24h = getEscalationChange24h(hotspot.id);
    const container = ctx.el('div', 'edp-generic');
    buildHeader(container, ctx, hotspot);
    buildInfoCard(container, ctx, hotspot);
    buildEscalationCard(container, ctx, hotspot, dynamicScore, change24h);
    buildAgenciesCard(container, ctx, hotspot);
    buildHistoryCard(container, ctx, hotspot);
    buildWhyItMattersCard(container, ctx, hotspot);

    const [newsCard, newsBody] = ctx.sectionCard('Related Headlines');
    newsBody.append(ctx.makeLoading('Loading headlines...'));
    container.append(newsCard);

    return container;
  }

  async enrich(data: unknown, _signal: AbortSignal): Promise<HotspotEnrichedData> {
    const hotspot = data as Hotspot;
    const news = this.getNews();
    const localNews = getRelatedNewsForHotspot(hotspot, news);
    console.log('[HotspotRenderer] enrich - hotspot:', hotspot.name);
    console.log('[HotspotRenderer] enrich - keywords:', hotspot.keywords);
    console.log('[HotspotRenderer] enrich - news count:', news.length);
    console.log('[HotspotRenderer] enrich - localNews:', localNews.length);
    
    const articles = await fetchHotspotContext(hotspot);
    const dynamicScore = getHotspotEscalation(hotspot.id);
    const change24h = getEscalationChange24h(hotspot.id);
    
    console.log('[HotspotRenderer] enrich - gdelt articles:', articles.length);
    return { hotspot, articles, localNews, dynamicScore, change24h };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const { hotspot, articles, localNews, dynamicScore, change24h } = enrichedData as HotspotEnrichedData;
    container.replaceChildren();
    buildHeader(container, ctx, hotspot);
    buildInfoCard(container, ctx, hotspot);
    buildEscalationCard(container, ctx, hotspot, dynamicScore, change24h);
    buildAgenciesCard(container, ctx, hotspot);
    buildHistoryCard(container, ctx, hotspot);
    buildWhyItMattersCard(container, ctx, hotspot);
    buildNewsCard(container, ctx, articles, localNews);
  }
}
