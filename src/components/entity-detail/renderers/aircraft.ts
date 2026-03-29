import type { PositionSample } from '@/services/aviation';
import { getAircraftDetails, analyzeAircraftDetails, type WingbitsAircraftDetails, type EnrichedAircraftInfo } from '@/services/wingbits';
import { fetchFlightStatus, type FlightInstance } from '@/services/aviation';
import { getPlanePhoto, getPlanePhotoByHex, type PlanespottersPhoto } from '@/services/planespotters';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';
import { sanitizeUrl } from '@/utils/sanitize';

interface AircraftPanelData {
  position: PositionSample;
  details: WingbitsAircraftDetails | null;
  analysis: EnrichedAircraftInfo | null;
  photo: PlanespottersPhoto | null;
  flightStatus: FlightInstance | null;
}

function normalizeFlightNumber(callsign: string): string {
  return callsign.replace(/\s+/g, '').toUpperCase();
}

async function getFlightStatusForCallsign(callsign: string, signal: AbortSignal): Promise<FlightInstance | null> {
  const flightNumber = normalizeFlightNumber(callsign);
  if (!/^[A-Z]{2,3}\d{1,4}[A-Z]?$/.test(flightNumber)) return null;

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const matches = await fetchFlightStatus(flightNumber);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return matches[0] || null;
}

function fmtAltitude(pos: PositionSample): string {
  return pos.altitudeFt > 0 ? `${pos.altitudeFt.toLocaleString()} ft` : 'Ground';
}

function fmtObservedAt(pos: PositionSample): string {
  try {
    return new Date(pos.observedAt).toLocaleString();
  } catch {
    return '—';
  }
}

function buildHeader(container: HTMLElement, ctx: EntityRenderContext, pos: PositionSample, analysis?: EnrichedAircraftInfo | null, photo?: PlanespottersPhoto | null): void {
  const header = ctx.el('div', 'edp-header');
  header.append(ctx.el('h2', 'edp-title', pos.callsign || pos.icao24 || 'Aircraft'));

  const subtitleParts = [
    analysis?.operator || photo?.operator || null,
    analysis?.model || photo?.model || null,
    pos.source || null,
  ].filter(Boolean) as string[];

  if (subtitleParts.length > 0) {
    header.append(ctx.el('div', 'edp-subtitle', subtitleParts.join(' · ')));
  }

  const badgeRow = ctx.el('div', 'edp-badge-row');
  badgeRow.append(ctx.badge(pos.onGround ? 'GROUND' : 'AIRBORNE', pos.onGround ? 'edp-badge edp-badge-dim' : 'edp-badge edp-badge-status'));
  if (analysis?.model || photo?.model) badgeRow.append(ctx.badge(analysis?.model || photo?.model || '', 'edp-badge'));
  if (analysis?.typecode) badgeRow.append(ctx.badge(analysis.typecode, 'edp-badge'));
  if (analysis?.isMilitary) badgeRow.append(ctx.badge(analysis.militaryBranch || 'MILITARY', 'edp-badge edp-badge-severity'));
  header.append(badgeRow);
  container.append(header);
}

function buildLiveStats(container: HTMLElement, ctx: EntityRenderContext, pos: PositionSample): void {
  const grid = ctx.el('div', 'edp-stat-grid');

  const altitude = ctx.el('div', 'edp-stat-highlight');
  altitude.append(ctx.el('div', 'edp-stat-highlight-value', pos.altitudeFt > 0 ? pos.altitudeFt.toLocaleString() : 'GND'));
  altitude.append(ctx.el('div', 'edp-stat-highlight-label', 'Altitude Ft'));
  grid.append(altitude);

  const speed = ctx.el('div', 'edp-stat-highlight');
  speed.append(ctx.el('div', 'edp-stat-highlight-value', Math.round(pos.groundSpeedKts).toLocaleString()));
  speed.append(ctx.el('div', 'edp-stat-highlight-label', 'Ground Speed Kts'));
  grid.append(speed);

  container.append(grid);
}

function buildPhoto(container: HTMLElement, ctx: EntityRenderContext, photo: PlanespottersPhoto | null): void {
  if (!photo?.imageUrl) return;

  const wrap = ctx.el('div', 'edp-aircraft-photo');
  const img = ctx.el('img', 'edp-aircraft-photo-img') as HTMLImageElement;
  img.src = sanitizeUrl(photo.imageUrl);
  img.alt = 'Aircraft photo';
  img.loading = 'lazy';
  wrap.append(img);

  if (photo.photographer || photo.linkUrl) {
    const credit = ctx.el('div', 'edp-aircraft-photo-credit');
    if (photo.linkUrl) {
      const link = ctx.el('a', 'edp-aircraft-photo-link') as HTMLAnchorElement;
      link.href = sanitizeUrl(photo.linkUrl);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = photo.photographer ? `Photo: ${photo.photographer} via planespotters.net` : 'Photo via planespotters.net';
      credit.append(link);
    } else {
      credit.textContent = photo.photographer ? `Photo: ${photo.photographer}` : 'Photo via planespotters.net';
    }
    wrap.append(credit);
  }

  container.append(wrap);
}

function buildFlightCard(container: HTMLElement, ctx: EntityRenderContext, pos: PositionSample): void {
  const [card, body] = ctx.sectionCard('Flight Data');
  body.append(row(ctx, 'Icao24', pos.icao24 || '—'));
  body.append(row(ctx, 'Callsign', pos.callsign || '—'));
  body.append(row(ctx, 'Altitude', fmtAltitude(pos)));
  body.append(row(ctx, 'Ground Speed', `${Math.round(pos.groundSpeedKts)} kts`));
  body.append(row(ctx, 'Heading', `${Math.round(pos.trackDeg)}°`));
  body.append(row(ctx, 'On Ground', pos.onGround ? 'Yes' : 'No'));
  body.append(row(ctx, 'ADS-B Source', pos.source || '—'));
  body.append(row(ctx, 'Coordinates', `${pos.lat.toFixed(4)}°, ${pos.lon.toFixed(4)}°`));
  body.append(row(ctx, 'Last Seen', fmtObservedAt(pos)));
  container.append(card);
}

function buildAircraftCard(container: HTMLElement, ctx: EntityRenderContext, details: WingbitsAircraftDetails | null, analysis: EnrichedAircraftInfo | null, photo: PlanespottersPhoto | null): void {
  const [card, body] = ctx.sectionCard('Aircraft');
  body.append(row(ctx, 'Operator', analysis?.operator || details?.operator || photo?.operator || '—'));
  body.append(row(ctx, 'Type', analysis?.model || details?.model || photo?.model || '—'));
  body.append(row(ctx, 'Type Code', analysis?.typecode || details?.typecode || '—'));
  body.append(row(ctx, 'Manufacturer', analysis?.manufacturer || details?.manufacturerName || photo?.manufacturer || '—'));
  body.append(row(ctx, 'Registration', analysis?.registration || details?.registration || photo?.registration || '—'));
  body.append(row(ctx, 'Owner', analysis?.owner || details?.owner || '—'));
  if (details?.operatorIcao) body.append(row(ctx, 'Operator ICAO', details.operatorIcao));
  if (details?.operatorCallsign) body.append(row(ctx, 'Operator Callsign', details.operatorCallsign));
  if (analysis?.builtYear) body.append(row(ctx, 'Built', analysis.builtYear));
  if (details?.engines) body.append(row(ctx, 'Engines', details.engines));
  if (details?.categoryDescription) body.append(row(ctx, 'Category', details.categoryDescription));
  container.append(card);
}

function buildStatusCard(container: HTMLElement, ctx: EntityRenderContext, status: FlightInstance | null): void {
  if (!status) return;

  const [card, body] = ctx.sectionCard('Commercial Flight');
  body.append(row(ctx, 'Flight Number', status.flightNumber || '—'));
  body.append(row(ctx, 'Carrier', status.carrier.name || status.carrier.iata || '—'));
  body.append(row(ctx, 'Route', `${status.origin.iata || '—'} → ${status.destination.iata || '—'}`));
  body.append(row(ctx, 'Status', status.status || '—'));
  if (status.gate) body.append(row(ctx, 'Gate', status.gate));
  if (status.terminal) body.append(row(ctx, 'Terminal', status.terminal));
  if (status.aircraftType) body.append(row(ctx, 'Aircraft Type', status.aircraftType));
  container.append(card);
}

export class AircraftRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const pos = data as PositionSample;
    const container = ctx.el('div', 'edp-generic');

    buildHeader(container, ctx, pos, null, null);
    buildLiveStats(container, ctx, pos);

    const [aircraftCard, aircraftBody] = ctx.sectionCard('Aircraft');
    aircraftBody.append(ctx.makeLoading('Loading aircraft details…'));
    container.append(aircraftCard);

    buildFlightCard(container, ctx, pos);

    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<AircraftPanelData> {
    const pos = data as PositionSample;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const details = await getAircraftDetails(pos.icao24);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const analysis = details ? analyzeAircraftDetails(details) : null;
    const flightStatus = await getFlightStatusForCallsign(pos.callsign, signal);
    const photo = await getPlanePhotoByHex(pos.icao24, signal)
      || await getPlanePhoto(details?.registration || analysis?.registration || null, signal);
    return { position: pos, details, analysis, photo, flightStatus };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const { position, details, analysis, photo, flightStatus } = enrichedData as AircraftPanelData;
    container.replaceChildren();
    buildHeader(container, ctx, position, analysis, photo);
    buildLiveStats(container, ctx, position);
    buildPhoto(container, ctx, photo);
    buildAircraftCard(container, ctx, details, analysis, photo);
    buildStatusCard(container, ctx, flightStatus);
    buildFlightCard(container, ctx, position);
  }
}
