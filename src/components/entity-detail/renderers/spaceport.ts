import type { Spaceport } from '@/types';
import { fetchLaunchesForSpaceport, type SpaceportLaunch } from '@/services/spaceport-launches';
import { row, statusBadgeClass } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const LAUNCH_ACTIVITY_LABELS: Record<string, string> = {
  High: 'High Activity',
  Medium: 'Medium Activity',
  Low: 'Low Activity',
};

interface SpaceportPanelData {
  port: Spaceport;
  launches: SpaceportLaunch[];
}

function fmtLaunchDate(launch: SpaceportLaunch): string {
  if (launch.t0) {
    try {
      const d = new Date(launch.t0);
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });
    } catch { /* fall through */ }
  }
  return launch.dateStr;
}

function buildHeader(container: HTMLElement, ctx: EntityRenderContext, port: Spaceport): void {
  const header = ctx.el('div', 'edp-header');
  header.append(ctx.el('h2', 'edp-title', port.name));
  header.append(ctx.el('div', 'edp-subtitle', `${port.operator} · ${port.country}`));
  const badgeRow = ctx.el('div', 'edp-badge-row');
  badgeRow.append(ctx.badge(port.status.toUpperCase(), statusBadgeClass(port.status)));
  badgeRow.append(ctx.badge(LAUNCH_ACTIVITY_LABELS[port.launches] ?? port.launches, 'edp-badge'));
  header.append(badgeRow);
  container.append(header);
}

function buildInfoCard(container: HTMLElement, ctx: EntityRenderContext, port: Spaceport): void {
  const [card, body] = ctx.sectionCard('Spaceport Info');
  body.append(row(ctx, 'Country', port.country));
  body.append(row(ctx, 'Operator', port.operator));
  body.append(row(ctx, 'Status', port.status.charAt(0).toUpperCase() + port.status.slice(1)));
  body.append(row(ctx, 'Launch Activity', LAUNCH_ACTIVITY_LABELS[port.launches] ?? port.launches));
  body.append(row(ctx, 'Coordinates', `${port.lat.toFixed(4)}°, ${port.lon.toFixed(4)}°`));
  container.append(card);
}

function buildLaunchesCard(container: HTMLElement, ctx: EntityRenderContext, launches: SpaceportLaunch[]): void {
  const [card, body] = ctx.sectionCard(`Upcoming Launches (${launches.length})`);

  if (launches.length === 0) {
    body.append(ctx.makeEmpty('No upcoming launches scheduled'));
    container.append(card);
    return;
  }

  for (const launch of launches) {
    const item = ctx.el('div', 'edp-launch-item');

    // Mission name + vehicle badge row
    const titleRow = ctx.el('div', 'edp-launch-title-row');
    const name = ctx.el('span', 'edp-launch-name', launch.name);
    titleRow.append(name);
    if (launch.vehicle) {
      titleRow.append(ctx.badge(launch.vehicle, 'edp-badge edp-badge-dim'));
    }
    item.append(titleRow);

    // Provider + pad
    const meta = ctx.el('div', 'edp-launch-meta');
    const parts = [launch.provider, launch.pad].filter(Boolean);
    meta.textContent = parts.join(' · ');
    item.append(meta);

    // Date
    const dateEl = ctx.el('div', 'edp-launch-date', fmtLaunchDate(launch));
    item.append(dateEl);

    // Mission description
    if (launch.missionDescription) {
      const desc = ctx.el('p', 'edp-launch-desc', launch.missionDescription);
      item.append(desc);
    } else if (launch.description) {
      const desc = ctx.el('p', 'edp-launch-desc', launch.description);
      item.append(desc);
    }

    // Weather if available
    if (launch.weather) {
      const wx = ctx.el('div', 'edp-launch-weather',
        `${launch.weather.condition} · ${Math.round(launch.weather.tempF)}°F · ${Math.round(launch.weather.windMph)} mph wind`);
      item.append(wx);
    }

    body.append(item);
  }

  container.append(card);
}

export class SpaceportRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const port = data as Spaceport;
    const container = ctx.el('div', 'edp-generic');
    buildHeader(container, ctx, port);
    buildInfoCard(container, ctx, port);

    const [launchCard, launchBody] = ctx.sectionCard('Upcoming Launches');
    launchBody.append(ctx.makeLoading('Loading launch schedule…'));
    container.append(launchCard);

    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<SpaceportPanelData> {
    const port = data as Spaceport;
    const launches = await fetchLaunchesForSpaceport(port.id, signal);
    return { port, launches };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const { port, launches } = enrichedData as SpaceportPanelData;
    container.replaceChildren();
    buildHeader(container, ctx, port);
    buildInfoCard(container, ctx, port);
    buildLaunchesCard(container, ctx, launches);
  }
}
