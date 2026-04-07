import type { ConflictZone } from '@/types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const INTENSITY_BADGE: Record<string, string> = {
  high: 'edp-badge edp-badge-severity',
  medium: 'edp-badge edp-badge-warning',
  low: 'edp-badge edp-badge-dim',
};

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value).toLocaleString()}`;
}

function formatUsdFull(value: number): string {
  return `$${Math.floor(value).toLocaleString('en-US')}`;
}

function formatValue(value: number | string | undefined): string {
  if (value == null) return '—';
  return typeof value === 'number' ? value.toLocaleString() : value;
}

function computeTrackedCost(conflict: ConflictZone): {
  totalCostUsd: number;
  elapsedDays: number;
} | null {
  const tracking = conflict.costTracking;
  if (!tracking) return null;

  const strikeStartMs = new Date(tracking.strikeStart).getTime();
  if (!Number.isFinite(strikeStartMs)) return null;

  const elapsedMs = Math.max(0, Date.now() - strikeStartMs);
  const elapsedDays = elapsedMs / 86_400_000;
  const totalCostUsd = elapsedDays <= tracking.firstPhaseDays
    ? (elapsedDays / tracking.firstPhaseDays) * tracking.firstPhaseCostUsd
    : tracking.firstPhaseCostUsd + ((elapsedDays - tracking.firstPhaseDays) * tracking.ongoingDailyCostUsd);

  return { totalCostUsd, elapsedDays };
}

function bindLiveTrackedCost(
  conflict: ConflictZone,
  ctx: EntityRenderContext,
  amountEl: HTMLElement,
  daysEl: HTMLElement,
): void {
  const render = (): void => {
    const tracked = computeTrackedCost(conflict);
    if (!tracked) return;
    amountEl.textContent = formatUsdFull(tracked.totalCostUsd);
    daysEl.textContent = tracked.elapsedDays.toFixed(2);
  };

  render();
  const intervalId = window.setInterval(render, 1000);
  ctx.signal.addEventListener('abort', () => window.clearInterval(intervalId), { once: true });
}

function appendFact(ctx: EntityRenderContext, parent: HTMLElement, label: string, value: string, className?: string): void {
  const fact = ctx.el('div', className ? `edp-fact-card ${className}` : 'edp-fact-card');
  fact.append(ctx.el('span', 'edp-fact-label', label));
  fact.append(ctx.el('strong', 'edp-fact-value', value));
  parent.append(fact);
}

function appendCasualtyCard(
  ctx: EntityRenderContext,
  parent: HTMLElement,
  title: string,
  tone: 'us' | 'military' | 'civilian',
  metrics: Array<{ label: string; value: string }>,
): void {
  const card = ctx.el('div', `edp-conflict-casualty-card edp-conflict-casualty-${tone}`);
  card.append(ctx.el('div', 'edp-conflict-casualty-title', title));
  for (const metric of metrics) {
    const slug = metric.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const row = ctx.el('div', `edp-conflict-casualty-row edp-conflict-casualty-row-${slug}`);
    row.append(ctx.el('span', 'edp-conflict-casualty-label', metric.label));
    row.append(ctx.el('strong', 'edp-conflict-casualty-value', metric.value));
    card.append(row);
  }
  parent.append(card);
}

export class ConflictRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const conflict = data as ConflictZone;
    const container = ctx.el('div', 'edp-generic edp-conflict-detail');

    const header = ctx.el('section', 'edp-header edp-header-card');
    header.append(ctx.el('h2', 'edp-title', conflict.name));
    if (conflict.location) header.append(ctx.el('div', 'edp-subtitle', conflict.location));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    if (conflict.intensity) {
      badgeRow.append(ctx.badge(conflict.intensity.toUpperCase(), INTENSITY_BADGE[conflict.intensity] ?? 'edp-badge'));
    }
    if (conflict.startDate) badgeRow.append(ctx.badge(`SINCE ${conflict.startDate.toUpperCase()}`, 'edp-badge edp-badge-dim'));
    header.append(badgeRow);

    if (conflict.description) {
      header.append(ctx.el('p', 'edp-description edp-header-summary', conflict.description));
    }
    container.append(header);

    const [snapshotCard, snapshotBody] = ctx.sectionCard('Situation Snapshot');
    const snapshotGrid = ctx.el('div', 'edp-fact-grid edp-conflict-snapshot-grid');
    if (conflict.startDate) appendFact(ctx, snapshotGrid, 'Start Date', conflict.startDate);
    if (conflict.location) appendFact(ctx, snapshotGrid, 'Location', conflict.location);
    if (conflict.casualties) appendFact(ctx, snapshotGrid, 'Headline Casualties', conflict.casualties, 'edp-conflict-fact-emphasis');
    if (conflict.displaced) appendFact(ctx, snapshotGrid, 'Displacement', conflict.displaced, 'edp-conflict-fact-wide');
    if (conflict.parties?.length) appendFact(ctx, snapshotGrid, 'Belligerents', String(conflict.parties.length));
    appendFact(ctx, snapshotGrid, 'Center', `${conflict.center[1].toFixed(1)}°N, ${conflict.center[0].toFixed(1)}°E`);
    snapshotBody.append(snapshotGrid);
    container.append(snapshotCard);

    const trackedCost = computeTrackedCost(conflict);
    if (conflict.costTracking && trackedCost) {
      const tracking = conflict.costTracking;
      const [costCard, costBody] = ctx.sectionCard('Cost Estimate');

      const hero = ctx.el('div', 'edp-conflict-cost-hero');
      hero.append(ctx.el('div', 'edp-conflict-cost-label', 'Estimated U.S. taxpayer cost'));
      const liveAmount = ctx.el('div', 'edp-conflict-cost-value', formatUsdFull(trackedCost.totalCostUsd));
      hero.append(liveAmount);
      hero.append(ctx.el('div', 'edp-conflict-cost-formula', `${formatUsd(tracking.firstPhaseCostUsd)} for first ${tracking.firstPhaseDays} days + ${formatUsd(tracking.ongoingDailyCostUsd)}/day ongoing`));
      costBody.append(hero);

      const meta = ctx.el('div', 'edp-fact-grid');
      const elapsedFact = ctx.el('div', 'edp-fact-card');
      elapsedFact.append(ctx.el('span', 'edp-fact-label', 'Days Elapsed'));
      const elapsedValue = ctx.el('strong', 'edp-fact-value', trackedCost.elapsedDays.toFixed(2));
      elapsedFact.append(elapsedValue);
      meta.append(elapsedFact);
      appendFact(ctx, meta, 'Initial Pentagon Window', `${tracking.firstPhaseDays} days`);
      appendFact(ctx, meta, 'Ongoing Daily Rate', formatUsd(tracking.ongoingDailyCostUsd));
      costBody.append(meta);
      bindLiveTrackedCost(conflict, ctx, liveAmount, elapsedValue);

      if (tracking.note) {
        const note = ctx.el('div', 'edp-callout edp-callout-attention');
        note.append(ctx.el('p', 'edp-description edp-callout-text', tracking.note));
        costBody.append(note);
      }

      const source = ctx.el('p', 'edp-conflict-source-line');
      source.textContent = tracking.sourceLabel;
      if (tracking.lastUpdated) source.textContent += ` • Updated ${tracking.lastUpdated}`;
      if (tracking.sourceUrl) {
        const link = ctx.el('a', 'edp-wiki-link') as HTMLAnchorElement;
        link.href = tracking.sourceUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Open source';
        costBody.append(source, link);
      } else {
        costBody.append(source);
      }
      container.append(costCard);
    }

    if (conflict.casualtyBreakdown) {
      const casualties = conflict.casualtyBreakdown;
      const [casualtiesCard, casualtiesBody] = ctx.sectionCard('Human Cost');
      const grid = ctx.el('div', 'edp-conflict-casualty-grid');

      appendCasualtyCard(ctx, grid, 'U.S. Service Members', 'us', [
        { label: 'Killed', value: formatValue(casualties.usServiceMembersKilled) },
        { label: 'Wounded', value: formatValue(casualties.usServiceMembersWounded) },
      ]);
      appendCasualtyCard(ctx, grid, 'Iranian Military', 'military', [
        { label: 'Killed', value: formatValue(casualties.militaryKilled) },
      ]);
      appendCasualtyCard(ctx, grid, 'Iranian Civilians', 'civilian', [
        { label: 'Killed', value: formatValue(casualties.civilianKilled) },
        { label: 'Wounded', value: formatValue(casualties.civilianWounded) },
      ]);
      casualtiesBody.append(grid);

      if (casualties.note) {
        const note = ctx.el('p', 'edp-conflict-source-line');
        note.textContent = casualties.note;
        casualtiesBody.append(note);
      }
      if (casualties.sourceSummary || casualties.lastUpdated) {
        const source = ctx.el('p', 'edp-conflict-source-line');
        const pieces = [casualties.sourceSummary, casualties.lastUpdated ? `Updated ${casualties.lastUpdated}` : ''].filter(Boolean);
        source.textContent = pieces.join(' • ');
        casualtiesBody.append(source);
      }
      container.append(casualtiesCard);
    }

    if (conflict.keyDevelopments?.length) {
      const [devCard, devBody] = ctx.sectionCard('Key Developments');
      const list = ctx.el('ul', 'edp-conflict-list');
      for (const item of conflict.keyDevelopments) {
        list.append(ctx.el('li', 'edp-conflict-list-item', item));
      }
      devBody.append(list);
      container.append(devCard);
    }

    if (conflict.parties?.length) {
      const [partiesCard, partiesBody] = ctx.sectionCard('Belligerents');
      const tags = ctx.el('div', 'edp-tags');
      for (const party of conflict.parties) tags.append(ctx.badge(party, 'edp-tag'));
      partiesBody.append(tags);
      container.append(partiesCard);
    }

    return container;
  }
}
