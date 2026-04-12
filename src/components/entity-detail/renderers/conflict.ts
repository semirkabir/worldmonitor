import type { AppContext } from '@/app/app-context';
import { getConflictProfile } from '@/config/conflict-profiles';
import { buildConflictOpsSnapshot } from '@/services/conflict-ops';
import { registerAisCallback, unregisterAisCallback, type AisPositionData } from '@/services/maritime';
import type { ConflictZone } from '@/types';
import type { ConflictOpsIncident, ConflictOpsSnapshot, ConflictSeriesPoint } from '@/types/conflict-ops';
import type { EntityRenderer, EntityRenderContext } from '../types';

const INTENSITY_BADGE: Record<string, string> = {
  high: 'edp-badge edp-badge-severity',
  medium: 'edp-badge edp-badge-warning',
  low: 'edp-badge edp-badge-dim',
};

type PlaybackMode = 'live' | 'playback';

function formatDateTime(value: number): string {
  if (!Number.isFinite(value)) return '—';
  try {
    return new Date(value).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function toneClass(tone?: string): string {
  if (tone === 'danger') return 'is-danger';
  if (tone === 'warning') return 'is-warning';
  if (tone === 'positive') return 'is-positive';
  if (tone === 'info') return 'is-info';
  return '';
}

function pointInBbox(vessel: AisPositionData, bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number }): boolean {
  return vessel.lat >= bbox.minLat && vessel.lat <= bbox.maxLat && vessel.lon >= bbox.minLon && vessel.lon <= bbox.maxLon;
}

function toBbox(coords: [number, number][]): { minLat: number; minLon: number; maxLat: number; maxLon: number } {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const [lon, lat] of coords) {
    minLat = Math.min(minLat, lat);
    minLon = Math.min(minLon, lon);
    maxLat = Math.max(maxLat, lat);
    maxLon = Math.max(maxLon, lon);
  }
  return { minLat, minLon, maxLat, maxLon };
}

function classifyDirection(conflictId: string, vessel: AisPositionData): 'inbound' | 'outbound' | 'stationary' {
  const heading = vessel.heading ?? vessel.course ?? 0;
  if (conflictId === 'strait_hormuz') {
    if (heading >= 45 && heading <= 180) return 'inbound';
    if (heading >= 200 && heading <= 340) return 'outbound';
    return 'stationary';
  }
  if (conflictId === 'yemen_redsea') {
    if (heading <= 45 || heading >= 315) return 'inbound';
    if (heading >= 135 && heading <= 225) return 'outbound';
    return 'stationary';
  }
  if (heading >= 45 && heading <= 180) return 'inbound';
  if (heading >= 200 && heading <= 340) return 'outbound';
  return 'stationary';
}

function createSeriesChart(series: ConflictSeriesPoint[], mode: PlaybackMode, activeIndex: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'edp-conflict-chart-wrap';
  if (series.length === 0) return wrap;

  const width = 560;
  const height = 180;
  const padX = 18;
  const padY = 16;
  const maxValue = Math.max(1, ...series.flatMap((point) => [point.primary, point.secondary ?? 0]));
  const stepX = (width - padX * 2) / Math.max(1, series.length - 1);
  const pointAt = (value: number, index: number): [number, number] => [
    padX + (stepX * index),
    height - padY - ((value / maxValue) * (height - padY * 2)),
  ];
  const linePath = (key: 'primary' | 'secondary'): string => series.map((point, index) => {
    const value = key === 'primary' ? point.primary : (point.secondary ?? 0);
    const [x, y] = pointAt(value, index);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'edp-conflict-chart-svg');

  const baseline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  baseline.setAttribute('x1', String(padX));
  baseline.setAttribute('x2', String(width - padX));
  baseline.setAttribute('y1', String(height - padY));
  baseline.setAttribute('y2', String(height - padY));
  baseline.setAttribute('stroke', 'rgba(255,255,255,0.18)');
  baseline.setAttribute('stroke-width', '1');
  svg.appendChild(baseline);

  const primary = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  primary.setAttribute('d', linePath('primary'));
  primary.setAttribute('fill', 'none');
  primary.setAttribute('stroke', '#38bdf8');
  primary.setAttribute('stroke-width', '2.5');
  svg.appendChild(primary);

  const secondary = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  secondary.setAttribute('d', linePath('secondary'));
  secondary.setAttribute('fill', 'none');
  secondary.setAttribute('stroke', '#f59e0b');
  secondary.setAttribute('stroke-width', '2');
  secondary.setAttribute('opacity', '0.85');
  svg.appendChild(secondary);

  const fallbackPoint = series[series.length - 1];
  if (!fallbackPoint) return wrap;
  const focusPoint = series[Math.min(activeIndex, series.length - 1)] ?? fallbackPoint;
  const [focusX, focusY] = pointAt(mode === 'playback' ? focusPoint.primary : fallbackPoint.primary, mode === 'playback' ? activeIndex : series.length - 1);
  const focus = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  focus.setAttribute('cx', focusX.toFixed(1));
  focus.setAttribute('cy', focusY.toFixed(1));
  focus.setAttribute('r', '4.5');
  focus.setAttribute('fill', '#38bdf8');
  svg.appendChild(focus);

  wrap.appendChild(svg);
  return wrap;
}

function incidentList(ctx: EntityRenderContext, incidents: ConflictOpsIncident[]): HTMLElement {
  const list = ctx.el('div', 'edp-conflict-ops-feed');
  for (const incident of incidents) {
    const row = ctx.el('div', `edp-conflict-ops-feed-row ${incident.severity === 'high' ? 'is-danger' : ''}`.trim());
    const head = ctx.el('div', 'edp-conflict-ops-feed-head');
    head.append(ctx.el('span', 'edp-conflict-ops-feed-source', incident.category));
    head.append(ctx.el('span', 'edp-conflict-ops-feed-time', formatDateTime(incident.timestamp)));
    row.append(head);
    row.append(ctx.el('div', 'edp-conflict-ops-feed-title', incident.title));
    if (incident.summary) row.append(ctx.el('div', 'edp-conflict-ops-feed-summary', incident.summary));
    list.append(row);
  }
  return list;
}

function genericFallback(conflict: ConflictZone, ctx: EntityRenderContext): HTMLElement {
  const container = ctx.el('div', 'edp-generic edp-conflict-detail');
  const header = ctx.el('section', 'edp-header edp-header-card');
  header.append(ctx.el('h2', 'edp-title', conflict.name));
  if (conflict.location) header.append(ctx.el('div', 'edp-subtitle', conflict.location));
  const badgeRow = ctx.el('div', 'edp-badge-row');
  if (conflict.intensity) badgeRow.append(ctx.badge(conflict.intensity.toUpperCase(), INTENSITY_BADGE[conflict.intensity] ?? 'edp-badge'));
  header.append(badgeRow);
  if (conflict.description) header.append(ctx.el('p', 'edp-description edp-header-summary', conflict.description));
  container.append(header);
  if (conflict.keyDevelopments?.length) {
    const [card, body] = ctx.sectionCard('Key Developments');
    const list = ctx.el('ul', 'edp-conflict-list');
    for (const item of conflict.keyDevelopments) list.append(ctx.el('li', 'edp-conflict-list-item', item));
    body.append(list);
    container.append(card);
  }
  return container;
}

function appendMetricCard(ctx: EntityRenderContext, parent: HTMLElement, label: string, value: string, tone?: string, delta?: string): void {
  const card = ctx.el('div', `edp-conflict-ops-metric ${toneClass(tone)}`.trim());
  card.append(ctx.el('span', 'edp-conflict-ops-metric-label', label));
  card.append(ctx.el('strong', 'edp-conflict-ops-metric-value', value));
  if (delta) card.append(ctx.el('span', 'edp-conflict-ops-metric-delta', delta));
  parent.append(card);
}

function renderAssets(ctx: EntityRenderContext, snapshot: ConflictOpsSnapshot): HTMLElement | null {
  if (!snapshot.nearbyAssets || snapshot.nearbyAssets.length === 0) return null;
  const [card, body] = ctx.sectionCard('Nearby Infrastructure');
  const grid = ctx.el('div', 'edp-conflict-ops-assets');
  for (const asset of snapshot.nearbyAssets) {
    const row = ctx.el('div', 'edp-conflict-ops-asset');
    row.append(ctx.el('span', 'edp-conflict-ops-asset-name', asset.name));
    row.append(ctx.el('span', 'edp-conflict-ops-asset-meta', `${asset.type} • ${asset.distanceKm.toFixed(0)} km`));
    grid.append(row);
  }
  body.append(grid);
  return card;
}

function renderOps(snapshot: ConflictOpsSnapshot, conflict: ConflictZone, ctx: EntityRenderContext): HTMLElement {
  const container = ctx.el('div', 'edp-generic edp-conflict-ops');
  const header = ctx.el('section', 'edp-header edp-header-card');
  header.append(ctx.el('h2', 'edp-title', conflict.name));
  if (conflict.location) header.append(ctx.el('div', 'edp-subtitle', `${conflict.location} • ${snapshot.profile.viewFamily.toUpperCase()} OPS`));
  const badgeRow = ctx.el('div', 'edp-badge-row');
  if (conflict.intensity) badgeRow.append(ctx.badge(conflict.intensity.toUpperCase(), INTENSITY_BADGE[conflict.intensity] ?? 'edp-badge'));
  badgeRow.append(ctx.badge(snapshot.profile.playbackEnabled ? 'PLAYBACK READY' : 'LIVE', 'edp-badge edp-badge-dim'));
  header.append(badgeRow);
  if (conflict.description) header.append(ctx.el('p', 'edp-description edp-header-summary', conflict.description));
  container.append(header);

  const [overviewCard, overviewBody] = ctx.sectionCard('Operations Overview');
  const controls = ctx.el('div', 'edp-conflict-ops-controls');
  const liveBtn = ctx.el('button', 'edp-conflict-ops-mode is-active', 'Live') as HTMLButtonElement;
  liveBtn.type = 'button';
  const playbackBtn = ctx.el('button', 'edp-conflict-ops-mode', 'Playback') as HTMLButtonElement;
  playbackBtn.type = 'button';
  controls.append(liveBtn, playbackBtn);
  overviewBody.append(controls);

  const metricGrid = ctx.el('div', 'edp-conflict-ops-metrics');
  for (const metric of snapshot.metrics) appendMetricCard(ctx, metricGrid, metric.label, metric.value, metric.tone, metric.delta);
  overviewBody.append(metricGrid);

  const chartCard = ctx.el('div', 'edp-conflict-ops-chart-card');
  chartCard.append(ctx.el('div', 'edp-conflict-ops-chart-title', snapshot.profile.labels?.primaryChartTitle || 'Operational Timeline'));
  const chartMeta = ctx.el('div', 'edp-conflict-ops-chart-meta', `As of ${formatDateTime(snapshot.asOf)}`);
  chartCard.append(chartMeta);
  const chartHost = ctx.el('div', 'edp-conflict-ops-chart-host');
  const sliderWrap = ctx.el('div', 'edp-conflict-ops-slider-wrap');
  sliderWrap.hidden = true;
  const slider = ctx.el('input', 'edp-conflict-ops-slider') as HTMLInputElement;
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(Math.max(0, snapshot.series.length - 1));
  slider.step = '1';
  slider.value = String(Math.max(0, snapshot.series.length - 1));
  sliderWrap.append(slider);
  chartCard.append(chartHost, sliderWrap);
  overviewBody.append(chartCard);

  const legend = ctx.el('div', 'edp-conflict-ops-legend');
  legend.append(ctx.el('span', 'edp-conflict-ops-legend-primary', snapshot.profile.labels?.chartLegendA || 'Primary'));
  legend.append(ctx.el('span', 'edp-conflict-ops-legend-secondary', snapshot.profile.labels?.chartLegendB || 'Alerts'));
  overviewBody.append(legend);

  const renderChart = (mode: PlaybackMode): void => {
    const activeIndex = Number(slider.value);
    chartHost.replaceChildren(createSeriesChart(snapshot.series, mode, activeIndex));
    const point = snapshot.series[Math.min(activeIndex, snapshot.series.length - 1)] ?? snapshot.series[snapshot.series.length - 1];
    if (point) chartMeta.textContent = mode === 'playback' ? `Playback ${formatDateTime(point.timestamp)}` : `As of ${formatDateTime(snapshot.asOf)}`;
  };
  let mode: PlaybackMode = 'live';
  liveBtn.addEventListener('click', () => {
    mode = 'live';
    liveBtn.classList.add('is-active');
    playbackBtn.classList.remove('is-active');
    sliderWrap.hidden = true;
    renderChart(mode);
  });
  playbackBtn.addEventListener('click', () => {
    mode = 'playback';
    playbackBtn.classList.add('is-active');
    liveBtn.classList.remove('is-active');
    sliderWrap.hidden = false;
    renderChart(mode);
  });
  slider.addEventListener('input', () => renderChart(mode));
  renderChart(mode);

  const bullets = ctx.el('div', 'edp-conflict-ops-bullets');
  for (const line of snapshot.summary) bullets.append(ctx.el('div', 'edp-conflict-ops-bullet', line));
  overviewBody.append(bullets);
  container.append(overviewCard);

  if (snapshot.profile.viewFamily === 'maritime') {
    const [card, body] = ctx.sectionCard('Maritime Picture');
    const metrics = ctx.el('div', 'edp-conflict-ops-kpi-grid');
    if (snapshot.crossings) {
      appendMetricCard(ctx, metrics, 'Crossing Events', String(snapshot.crossings.crossingEvents), 'info');
      appendMetricCard(ctx, metrics, 'Inbound', String(snapshot.crossings.inbound), 'positive');
      appendMetricCard(ctx, metrics, 'Outbound', String(snapshot.crossings.outbound), 'warning');
      appendMetricCard(ctx, metrics, 'Dark Transit', String(snapshot.crossings.darkTransitCount ?? 0), 'danger');
    }
    body.append(metrics);

    if (snapshot.oilMetrics?.length) {
      const oilGrid = ctx.el('div', 'edp-conflict-ops-oil-grid');
      for (const metric of snapshot.oilMetrics) appendMetricCard(ctx, oilGrid, metric.label, metric.value, metric.tone, metric.delta);
      body.append(oilGrid);
    }

    const liveHost = ctx.el('div', 'edp-conflict-live-vessels');
    liveHost.append(ctx.makeLoading('Listening for live AIS vessels in the conflict AOI…'));
    body.append(liveHost);
    container.append(card);

    const bbox = toBbox(snapshot.profile.aoi.polygon);
    const tracked = new Map<string, AisPositionData[]>();
    const liveCallback = (batch: AisPositionData[]): void => {
      for (const vessel of batch) {
        if (!pointInBbox(vessel, bbox)) continue;
        const history = tracked.get(vessel.mmsi) ?? [];
        history.push(vessel);
        if (history.length > 24) history.shift();
        tracked.set(vessel.mmsi, history);
      }

      const vessels = [...tracked.values()]
        .map((history) => history[history.length - 1])
        .filter((item): item is AisPositionData => !!item)
        .sort((a, b) => (b.speed ?? 0) - (a.speed ?? 0));

      const inbound = vessels.filter((vessel) => classifyDirection(conflict.id, vessel) === 'inbound').length;
      const outbound = vessels.filter((vessel) => classifyDirection(conflict.id, vessel) === 'outbound').length;

      const next = ctx.el('div', 'edp-conflict-live-board');
      const liveStats = ctx.el('div', 'edp-conflict-ops-kpi-grid');
      appendMetricCard(ctx, liveStats, 'Commercial Vessels', String(vessels.length), 'info');
      appendMetricCard(ctx, liveStats, 'Inbound', String(inbound), 'positive');
      appendMetricCard(ctx, liveStats, 'Outbound', String(outbound), 'warning');
      next.append(liveStats);

      const table = ctx.el('div', 'edp-conflict-live-table');
      for (const vessel of vessels.slice(0, 10)) {
        const row = ctx.el('div', 'edp-conflict-live-row');
        row.append(ctx.el('span', 'edp-conflict-live-name', vessel.name || vessel.mmsi));
        row.append(ctx.el('span', 'edp-conflict-live-meta', `${classifyDirection(conflict.id, vessel)} • ${(vessel.speed ?? 0).toFixed(1)} kn`));
        table.append(row);
      }
      next.append(table);
      liveHost.replaceChildren(next);
    };
    registerAisCallback(liveCallback);
    ctx.signal.addEventListener('abort', () => unregisterAisCallback(liveCallback), { once: true });
  }

  if (snapshot.profile.viewFamily === 'warfare') {
    const [card, body] = ctx.sectionCard('Warfare Signals');
    const grid = ctx.el('div', 'edp-conflict-ops-kpi-grid');
    appendMetricCard(ctx, grid, 'Drone Reports', String(snapshot.warfare?.droneReports ?? 0), 'warning');
    appendMetricCard(ctx, grid, 'Strike Events', String(snapshot.warfare?.strikeEvents ?? 0), 'danger');
    appendMetricCard(ctx, grid, 'Killings Reported', snapshot.warfare?.killingsReported ?? '—', 'danger');
    appendMetricCard(ctx, grid, 'Nearby Military', `${snapshot.nearbyMilitary?.flights ?? 0}F / ${snapshot.nearbyMilitary?.vessels ?? 0}V`, 'info');
    body.append(grid);
    container.append(card);
  }

  if (snapshot.profile.viewFamily === 'humanitarian') {
    const [card, body] = ctx.sectionCard('Humanitarian Stress');
    const grid = ctx.el('div', 'edp-conflict-ops-kpi-grid');
    appendMetricCard(ctx, grid, 'Displaced', snapshot.humanitarian?.displaced ?? conflict.displaced ?? '—', 'warning');
    appendMetricCard(ctx, grid, 'Aid Access', snapshot.humanitarian?.aidStatus ?? '—', 'info');
    appendMetricCard(ctx, grid, 'Casualties', conflict.casualties ?? '—', 'danger');
    body.append(grid);
    container.append(card);
  }

  if (snapshot.profile.viewFamily === 'border') {
    const [card, body] = ctx.sectionCard('Border Watch');
    const grid = ctx.el('div', 'edp-conflict-ops-kpi-grid');
    appendMetricCard(ctx, grid, 'Flights Nearby', String(snapshot.nearbyMilitary?.flights ?? 0), 'warning');
    appendMetricCard(ctx, grid, 'Vessels Nearby', String(snapshot.nearbyMilitary?.vessels ?? 0), 'info');
    appendMetricCard(ctx, grid, 'Alerts', String(snapshot.incidents.filter((item) => item.severity === 'high').length), 'danger');
    body.append(grid);
    container.append(card);
  }

  if (snapshot.incidents.length > 0) {
    const [card, body] = ctx.sectionCard('Incident Feed');
    body.append(incidentList(ctx, snapshot.incidents));
    container.append(card);
  }

  const assetsCard = renderAssets(ctx, snapshot);
  if (assetsCard) container.append(assetsCard);

  return container;
}

export class ConflictRenderer implements EntityRenderer {
  private currentConflict: ConflictZone | null = null;

  constructor(private readonly appCtx?: AppContext) {}

  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const conflict = data as ConflictZone;
    this.currentConflict = conflict;
    if (!getConflictProfile(conflict)) return genericFallback(conflict, ctx);
    const container = ctx.el('div', 'edp-generic edp-conflict-ops');
    const header = ctx.el('section', 'edp-header edp-header-card');
    header.append(ctx.el('h2', 'edp-title', conflict.name));
    if (conflict.location) header.append(ctx.el('div', 'edp-subtitle', conflict.location));
    const badgeRow = ctx.el('div', 'edp-badge-row');
    if (conflict.intensity) badgeRow.append(ctx.badge(conflict.intensity.toUpperCase(), INTENSITY_BADGE[conflict.intensity] ?? 'edp-badge'));
    badgeRow.append(ctx.badge('OPS VIEW', 'edp-badge edp-badge-dim'));
    header.append(badgeRow);
    if (conflict.description) header.append(ctx.el('p', 'edp-description edp-header-summary', conflict.description));
    container.append(header);
    container.append(ctx.makeLoading('Building conflict-specific operations view…'));
    return container;
  }

  async enrich(data: unknown, _signal: AbortSignal): Promise<unknown> {
    const conflict = data as ConflictZone;
    if (!this.appCtx) return null;
    return buildConflictOpsSnapshot(this.appCtx, conflict);
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const snapshot = enrichedData as ConflictOpsSnapshot | null;
    if (!this.currentConflict) return;
    if (!snapshot) {
      container.replaceChildren(genericFallback(this.currentConflict, ctx));
      return;
    }
    container.replaceChildren(renderOps(snapshot, this.currentConflict, ctx));
  }
}
