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
  1: 'Stable', 2: 'Watch', 3: 'Elevated', 4: 'High', 5: 'Critical',
};

const TREND_SYMBOL: Record<string, string> = {
  rising: '↑', falling: '↓', stable: '→',
};

export class HotspotRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const hotspot = data as Hotspot;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', hotspot.name));
    if (hotspot.location) header.append(ctx.el('div', 'edp-subtitle', hotspot.location));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    const level = hotspot.level ?? 'low';
    badgeRow.append(ctx.badge(level.toUpperCase(), LEVEL_BADGE[level] ?? 'edp-badge'));
    if (hotspot.status) badgeRow.append(ctx.badge(hotspot.status, 'edp-badge edp-badge-dim'));
    header.append(badgeRow);
    container.append(header);

    // Description
    if (hotspot.description) container.append(ctx.el('p', 'edp-description', hotspot.description));

    // Escalation
    const dynamic = getHotspotEscalation(hotspot.id);
    const change = getEscalationChange24h(hotspot.id);
    const score = dynamic?.combinedScore ?? hotspot.escalationScore ?? 3;
    const trend = dynamic?.trend ?? hotspot.escalationTrend ?? 'stable';
    const trendSymbol = TREND_SYMBOL[trend] ?? '→';
    const scoreLabel = SCORE_LABEL[Math.round(score)] ?? '';

    const [escCard, escBody] = ctx.sectionCard('Escalation Assessment');
    escBody.append(row(ctx, 'Score', `${score.toFixed(1)}/5 — ${scoreLabel}`));
    escBody.append(row(ctx, 'Trend', `${trendSymbol} ${trend.charAt(0).toUpperCase() + trend.slice(1)}`));
    if (change !== null) {
      escBody.append(row(ctx, '24h Change', `${change.change > 0 ? '+' : ''}${change.change.toFixed(1)}`));
    }
    if (dynamic?.staticBaseline) {
      escBody.append(row(ctx, 'Baseline', `${dynamic.staticBaseline}/5`));
    }
    container.append(escCard);

    // Components (news, cii, geo, military)
    if (dynamic?.components) {
      const c = dynamic.components;
      const [compCard, compBody] = ctx.sectionCard('Signal Components');
      compBody.append(row(ctx, 'News', String(Math.round(c.newsActivity))));
      compBody.append(row(ctx, 'CII', String(Math.round(c.ciiContribution))));
      compBody.append(row(ctx, 'Geo', String(Math.round(c.geoConvergence))));
      compBody.append(row(ctx, 'Military', String(Math.round(c.militaryActivity))));
      container.append(compCard);
    }

    // Escalation indicators
    if (hotspot.escalationIndicators && hotspot.escalationIndicators.length > 0) {
      const [indCard, indBody] = ctx.sectionCard('Indicators');
      const tags = ctx.el('div', 'edp-tags');
      for (const ind of hotspot.escalationIndicators) tags.append(ctx.badge(ind, 'edp-tag'));
      indBody.append(tags);
      container.append(indCard);
    }

    // Key entities (agencies/keywords)
    const entities = hotspot.agencies ?? hotspot.keywords;
    if (entities && entities.length > 0) {
      const [entCard, entBody] = ctx.sectionCard('Key Entities');
      const tags = ctx.el('div', 'edp-tags');
      for (const e of entities) tags.append(ctx.badge(e.toUpperCase(), 'edp-tag'));
      entBody.append(tags);
      container.append(entCard);
    }

    // Why it matters
    if (hotspot.whyItMatters) {
      const [whyCard, whyBody] = ctx.sectionCard('Why It Matters');
      whyBody.append(ctx.el('p', 'edp-description', hotspot.whyItMatters));
      container.append(whyCard);
    }

    // Historical context
    if (hotspot.history) {
      const h = hotspot.history;
      const [histCard, histBody] = ctx.sectionCard('Historical Context');
      if (h.lastMajorEvent) {
        const val = h.lastMajorEventDate ? `${h.lastMajorEvent} (${h.lastMajorEventDate})` : h.lastMajorEvent;
        histBody.append(row(ctx, 'Last Major Event', val));
      }
      if (h.precedentDescription) histBody.append(row(ctx, 'Precedent', h.precedentDescription));
      if (h.cyclicalRisk) histBody.append(row(ctx, 'Cyclical Risk', h.cyclicalRisk));
      container.append(histCard);
    }

    return container;
  }
}
