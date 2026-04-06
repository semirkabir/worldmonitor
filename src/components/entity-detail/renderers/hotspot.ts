import type { Hotspot } from '@/types';
import { getHotspotEscalation, getEscalationChange24h } from '@/services/hotspot-escalation';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const LEVEL_BADGE: Record<string, string> = {
  high: 'edp-badge edp-badge-severity',
  elevated: 'edp-badge edp-badge-warning',
  low: 'edp-badge edp-badge-dim',
};

const SCORE_LABEL: Record<number, string> = {
  1: 'Stable',
  2: 'Watch',
  3: 'Elevated',
  4: 'High',
  5: 'Critical',
};

const TREND_LABEL: Record<string, string> = {
  rising: 'Rising',
  escalating: 'Rising',
  falling: 'Falling',
  'de-escalating': 'Falling',
  stable: 'Stable',
};

function formatCoordinates(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

function getScoreTone(score: number): 'watch' | 'elevated' | 'critical' {
  if (score >= 4) return 'critical';
  if (score >= 3) return 'elevated';
  return 'watch';
}

function getTrendTone(trend: string): 'rising' | 'falling' | 'stable' {
  if (trend === 'rising' || trend === 'escalating') return 'rising';
  if (trend === 'falling' || trend === 'de-escalating') return 'falling';
  return 'stable';
}

function appendMetric(
  ctx: EntityRenderContext,
  parent: HTMLElement,
  label: string,
  value: string,
  className = 'edp-hotspot-inline-stat',
): void {
  const stat = ctx.el('div', className);
  stat.append(ctx.el('span', 'edp-hotspot-inline-label', label));
  stat.append(ctx.el('strong', 'edp-hotspot-inline-value', value));
  parent.append(stat);
}

function appendFact(
  ctx: EntityRenderContext,
  parent: HTMLElement,
  label: string,
  value: string,
): void {
  const fact = ctx.el('div', 'edp-fact-card');
  fact.append(ctx.el('span', 'edp-fact-label', label));
  fact.append(ctx.el('strong', 'edp-fact-value', value));
  parent.append(fact);
}

export class HotspotRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const hotspot = data as Hotspot;
    const container = ctx.el('div', 'edp-generic edp-hotspot-detail');

    const header = ctx.el('section', 'edp-header edp-header-card');
    header.append(ctx.el('h2', 'edp-title', hotspot.name));
    if (hotspot.location) header.append(ctx.el('div', 'edp-subtitle', hotspot.location));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    const level = hotspot.level ?? 'low';
    badgeRow.append(ctx.badge(level.toUpperCase(), LEVEL_BADGE[level] ?? 'edp-badge'));
    if (hotspot.status) badgeRow.append(ctx.badge(hotspot.status, 'edp-badge edp-badge-dim'));
    header.append(badgeRow);

    if (hotspot.description) {
      header.append(ctx.el('p', 'edp-description edp-header-summary', hotspot.description));
    }
    container.append(header);

    const dynamic = getHotspotEscalation(hotspot.id);
    const change = getEscalationChange24h(hotspot.id);
    const score = dynamic?.combinedScore ?? hotspot.escalationScore ?? 3;
    const trend = dynamic?.trend ?? hotspot.escalationTrend ?? 'stable';
    const scoreLabel = SCORE_LABEL[Math.round(score)] ?? 'Watch';
    const trendLabel = TREND_LABEL[trend] ?? 'Stable';

    const [summaryCard, summaryBody] = ctx.sectionCard('Situation Snapshot');
    const factGrid = ctx.el('div', 'edp-fact-grid');
    if (hotspot.location) appendFact(ctx, factGrid, 'Location', hotspot.location);
    appendFact(ctx, factGrid, 'Coordinates', formatCoordinates(hotspot.lat, hotspot.lon));
    appendFact(ctx, factGrid, 'Status', hotspot.status ?? 'Monitoring');
    summaryBody.append(factGrid);
    container.append(summaryCard);

    const [escCard, escBody] = ctx.sectionCard('Escalation Assessment');
    escCard.classList.add('edp-hotspot-score-card');

    const scoreTop = ctx.el('div', 'edp-hotspot-score-top');
    const scoreTile = ctx.el('div', `edp-hotspot-score-tile edp-hotspot-score-${getScoreTone(score)}`);
    scoreTile.append(ctx.el('div', 'edp-hotspot-score-value', `${score.toFixed(1)}/5`));
    scoreTile.append(ctx.el('div', 'edp-hotspot-score-label', scoreLabel));
    scoreTop.append(scoreTile);

    const scoreMeta = ctx.el('div', 'edp-hotspot-score-meta');
    appendMetric(ctx, scoreMeta, 'Trend', trendLabel, `edp-hotspot-inline-stat edp-hotspot-inline-${getTrendTone(trend)}`);
    if (dynamic?.staticBaseline) {
      appendMetric(ctx, scoreMeta, 'Baseline', `${dynamic.staticBaseline}/5`);
    }
    if (change !== null) {
      appendMetric(ctx, scoreMeta, '24h Change', `${change.change > 0 ? '+' : ''}${change.change.toFixed(1)}`);
    }
    scoreTop.append(scoreMeta);
    escBody.append(scoreTop);

    if (dynamic?.components) {
      const components = ctx.el('div', 'edp-hotspot-components');
      const componentItems = [
        ['News', Math.round(dynamic.components.newsActivity), 'news'],
        ['CII', Math.round(dynamic.components.ciiContribution), 'cii'],
        ['Geo', Math.round(dynamic.components.geoConvergence), 'geo'],
        ['Military', Math.round(dynamic.components.militaryActivity), 'military'],
      ] as const;

      for (const [label, value, tone] of componentItems) {
        const item = ctx.el('div', 'edp-hotspot-component');
        item.append(ctx.el('span', 'edp-hotspot-component-label', label));
        const meter = ctx.el('div', 'edp-hotspot-component-meter');
        const fill = ctx.el('div', `edp-hotspot-component-fill edp-hotspot-component-fill-${tone}`);
        fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
        meter.append(fill);
        item.append(meter);
        item.append(ctx.el('strong', 'edp-hotspot-component-value', String(value)));
        components.append(item);
      }

      escBody.append(components);
    }
    container.append(escCard);

    if (hotspot.escalationIndicators && hotspot.escalationIndicators.length > 0) {
      const [indCard, indBody] = ctx.sectionCard('Indicators');
      const tags = ctx.el('div', 'edp-tags');
      for (const ind of hotspot.escalationIndicators) tags.append(ctx.badge(ind, 'edp-tag'));
      indBody.append(tags);
      container.append(indCard);
    }

    const entities = hotspot.agencies ?? hotspot.keywords;
    if (entities && entities.length > 0) {
      const [entCard, entBody] = ctx.sectionCard('Key Entities');
      const tags = ctx.el('div', 'edp-tags');
      for (const entity of entities) tags.append(ctx.badge(entity.toUpperCase(), 'edp-tag'));
      entBody.append(tags);
      container.append(entCard);
    }

    if (hotspot.whyItMatters) {
      const [whyCard, whyBody] = ctx.sectionCard('Why It Matters');
      const callout = ctx.el('div', 'edp-callout edp-callout-attention');
      callout.append(ctx.el('p', 'edp-description edp-callout-text', hotspot.whyItMatters));
      whyBody.append(callout);
      container.append(whyCard);
    }

    if (hotspot.history) {
      const history = hotspot.history;
      const [histCard, histBody] = ctx.sectionCard('Historical Context');
      histBody.classList.add('edp-hotspot-history');
      if (history.lastMajorEvent) {
        const value = history.lastMajorEventDate
          ? `${history.lastMajorEvent} (${history.lastMajorEventDate})`
          : history.lastMajorEvent;
        histBody.append(row(ctx, 'Last Major Event', value));
      }
      if (history.precedentDescription) histBody.append(row(ctx, 'Precedent', history.precedentDescription));
      if (history.cyclicalRisk) histBody.append(row(ctx, 'Cyclical Risk', history.cyclicalRisk));
      container.append(histCard);
    }

    return container;
  }
}
