import type { PositionSample } from '@/services/aviation';
import { getAircraftDetails, analyzeAircraftDetails, type WingbitsAircraftDetails, type EnrichedAircraftInfo } from '@/services/wingbits';
import { fetchFlightStatus, type FlightInstance } from '@/services/aviation';
import { getPlanePhoto, getPlanePhotoByHex, type PlanespottersPhoto } from '@/services/planespotters';
import type { EntityRenderer, EntityRenderContext } from '../types';
import { sanitizeUrl } from '@/utils/sanitize';

interface AircraftPanelData {
  position: PositionSample;
  details: WingbitsAircraftDetails | null;
  analysis: EnrichedAircraftInfo | null;
  photo: PlanespottersPhoto | null;
  flightStatus: FlightInstance | null;
}

const AIRLINE_ICAO_TO_IATA: Record<string, string> = {
  AAL: 'AA',
  AAR: 'OZ',
  ACA: 'AC',
  AFR: 'AF',
  AIC: 'AI',
  ANA: 'NH',
  ASA: 'AS',
  BAW: 'BA',
  CAL: 'CI',
  CES: 'MU',
  CPA: 'CX',
  DAL: 'DL',
  DLH: 'LH',
  ETD: 'EY',
  ETH: 'ET',
  EZY: 'U2',
  FFT: 'F9',
  IGO: '6E',
  JAL: 'JL',
  JBU: 'B6',
  KAL: 'KE',
  KLM: 'KL',
  NKS: 'NK',
  QFA: 'QF',
  QTR: 'QR',
  RYR: 'FR',
  SIA: 'SQ',
  SIF: 'PF',
  SWA: 'WN',
  THY: 'TK',
  UAE: 'EK',
  UAL: 'UA',
  VTI: 'UK',
};

const AIRLINE_NAME_TO_IATA: Record<string, string> = {
  airsial: 'PF',
  airsiall: 'PF',
  airsiallimited: 'PF',
  britishairways: 'BA',
  deltaairlines: 'DL',
  americanairlines: 'AA',
  unitedairlines: 'UA',
  qatarairways: 'QR',
  emirates: 'EK',
  lufthansa: 'LH',
  airfrance: 'AF',
  klm: 'KL',
  ryanair: 'FR',
  easyjet: 'U2',
  singaporeairlines: 'SQ',
  cathaypacific: 'CX',
};

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

function fmtClock(value: Date | null | undefined): string {
  if (!value) return '--';
  try {
    return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '--';
  }
}

function fmtDateLabel(value: string | null | undefined): string {
  if (!value) return 'Live track';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Live track';
  return parsed.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDurationMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '--';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}m`;
  if (mins <= 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function fmtAltitude(pos: PositionSample): string {
  return pos.altitudeFt > 0 ? `${pos.altitudeFt.toLocaleString()} ft` : 'Ground';
}

function fmtObservedAt(pos: PositionSample): string {
  try {
    return new Date(pos.observedAt).toLocaleString([], {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '--';
  }
}

function fmtRelativeMinutes(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return 'On time';
  return `+${minutes} min`;
}

function getHeadingCardinal(trackDeg: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((trackDeg % 360) + 360) % 360;
  return directions[Math.round(normalized / 45) % directions.length] || 'N';
}

function getProgressEndpoints(status: FlightInstance | null): {
  leftCode: string;
  leftName: string;
  rightCode: string;
  rightName: string;
} {
  if (!status) {
    return {
      leftCode: '--',
      leftName: 'Takeoff unknown',
      rightCode: '--',
      rightName: 'Destination unknown',
    };
  }

  return {
    leftCode: status.origin.iata || '--',
    leftName: status.origin.name || 'Takeoff unknown',
    rightCode: status.destination.iata || '--',
    rightName: status.destination.name || 'Destination unknown',
  };
}

function getCarrierBadgeLabel(
  status: FlightInstance | null,
  details: WingbitsAircraftDetails | null,
  analysis: EnrichedAircraftInfo | null,
  photo: PlanespottersPhoto | null,
  pos: PositionSample,
): string {
  const code = resolveAirlineCode(status, details, analysis, photo, pos);
  if (code) return code.slice(0, 3);
  const callsignPrefix = (pos.callsign || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
  return callsignPrefix || '✈';
}

function getCarrierBadgeHue(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = ((hash << 5) - hash + label.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

function getTrackNarrative(pos: PositionSample, status: FlightInstance | null): string {
  if (status && hasRoute(status)) {
    const origin = status.origin.iata || status.origin.name || 'takeoff';
    const destination = status.destination.iata || status.destination.name || 'destination';
    return `Routing ${origin} to ${destination}`;
  }

  return `Heading ${getHeadingCardinal(pos.trackDeg)} from ${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}`;
}

function getAircraftStatusLabel(pos: PositionSample, status: FlightInstance | null): string {
  if (status?.cancelled) return 'Cancelled';
  if (status?.diverted) return 'Diverted';
  switch (status?.status) {
    case 'scheduled': return 'Scheduled';
    case 'boarding': return 'Boarding';
    case 'departed': return 'Departed';
    case 'airborne': return 'En route';
    case 'landed': return 'Landed';
    case 'arrived': return 'Arrived';
    case 'cancelled': return 'Cancelled';
    case 'diverted': return 'Diverted';
    default: return pos.onGround ? 'On ground' : 'Airborne';
  }
}

function getAircraftStatusTone(pos: PositionSample, status: FlightInstance | null): string {
  if (status?.cancelled) return 'edp-flight-status-critical';
  if (status?.diverted) return 'edp-flight-status-warning';
  if ((status?.delayMinutes ?? 0) > 15) return 'edp-flight-status-warning';
  if (status?.status === 'arrived' || status?.status === 'landed') return 'edp-flight-status-dim';
  return pos.onGround ? 'edp-flight-status-dim' : 'edp-flight-status-live';
}

function getFlightProgress(pos: PositionSample, status: FlightInstance | null): number {
  if (!status) return pos.onGround ? 0.08 : 0.56;
  if (status.cancelled) return 0;
  if (status.status === 'arrived' || status.status === 'landed') return 1;

  const departure = status.estimatedDeparture ?? status.scheduledDeparture;
  const arrival = status.estimatedArrival ?? status.scheduledArrival;
  if (!departure || !arrival) return pos.onGround ? 0.1 : 0.6;

  const start = departure.getTime();
  const end = arrival.getTime();
  if (end <= start) return pos.onGround ? 0.1 : 0.6;

  return Math.max(0, Math.min(1, (Date.now() - start) / (end - start)));
}

function getCarrierName(status: FlightInstance | null, analysis: EnrichedAircraftInfo | null, photo: PlanespottersPhoto | null): string {
  return status?.carrier.name || analysis?.operator || photo?.operator || 'Unknown carrier';
}

function getAircraftName(details: WingbitsAircraftDetails | null, analysis: EnrichedAircraftInfo | null, photo: PlanespottersPhoto | null): string {
  return analysis?.model || details?.model || photo?.model || 'Aircraft';
}

function getRegistration(details: WingbitsAircraftDetails | null, analysis: EnrichedAircraftInfo | null, photo: PlanespottersPhoto | null): string {
  return analysis?.registration || details?.registration || photo?.registration || '--';
}

function normalizeAirlineName(value: string | null | undefined): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveAirlineCode(
  status: FlightInstance | null,
  details: WingbitsAircraftDetails | null,
  analysis: EnrichedAircraftInfo | null,
  photo: PlanespottersPhoto | null,
  pos: PositionSample,
): string | null {
  const carrierIata = status?.carrier.iata?.trim().toUpperCase();
  if (carrierIata && /^[A-Z0-9]{2,3}$/.test(carrierIata)) return carrierIata;

  const operatorIcao = (details?.operatorIcao || analysis?.operatorIcao || '').trim().toUpperCase();
  if (operatorIcao && AIRLINE_ICAO_TO_IATA[operatorIcao]) return AIRLINE_ICAO_TO_IATA[operatorIcao];

  const callsignPrefix = (pos.callsign || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  if (callsignPrefix && AIRLINE_ICAO_TO_IATA[callsignPrefix]) return AIRLINE_ICAO_TO_IATA[callsignPrefix];

  const operatorKey = normalizeAirlineName(status?.carrier.name || analysis?.operator || details?.operator || photo?.operator || null);
  if (operatorKey && AIRLINE_NAME_TO_IATA[operatorKey]) return AIRLINE_NAME_TO_IATA[operatorKey];

  return null;
}

function getLogoText(
  status: FlightInstance | null,
  details: WingbitsAircraftDetails | null,
  analysis: EnrichedAircraftInfo | null,
  photo: PlanespottersPhoto | null,
  pos: PositionSample,
): string {
  const code = resolveAirlineCode(status, details, analysis, photo, pos);
  if (code) return code.slice(0, 3);

  const name = analysis?.operator || photo?.operator || pos.callsign || pos.icao24;
  const initials = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');

  return initials || pos.icao24.slice(0, 2).toUpperCase();
}

function getAirlineLogoUrls(
  status: FlightInstance | null,
  details: WingbitsAircraftDetails | null,
  analysis: EnrichedAircraftInfo | null,
  photo: PlanespottersPhoto | null,
  pos: PositionSample,
): string[] {
  const code = resolveAirlineCode(status, details, analysis, photo, pos);
  if (!code || !/^[A-Z0-9]{2,3}$/.test(code)) return [];
  return [
    sanitizeUrl(`https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/${code}.svg`),
    sanitizeUrl(`https://images.kiwi.com/airlines/64/${code}.png`),
    sanitizeUrl(`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`),
  ];
}

function hasRoute(status: FlightInstance | null): boolean {
  return Boolean(status && (status.origin.iata || status.origin.name || status.destination.iata || status.destination.name));
}

function appendFact(ctx: EntityRenderContext, grid: HTMLElement, label: string, value: string): void {
  const item = ctx.el('div', 'edp-flight-fact');
  item.append(ctx.el('div', 'edp-flight-fact-label', label));
  item.append(ctx.el('div', 'edp-flight-fact-value', value));
  grid.append(item);
}

function buildRouteSection(
  ctx: EntityRenderContext,
  status: FlightInstance,
  pos: PositionSample,
): HTMLElement {
  const section = ctx.el('div', 'edp-flight-route-section');

  const strip = ctx.el('div', 'edp-flight-route-strip');

  const origin = ctx.el('div', 'edp-flight-stop');
  origin.append(ctx.el('div', 'edp-flight-stop-eyebrow', status.terminal ? `Terminal ${status.terminal}` : 'Departure'));
  origin.append(ctx.el('div', 'edp-flight-stop-code', status.origin.iata || '--'));
  origin.append(ctx.el('div', 'edp-flight-stop-name', status.origin.name || 'Origin unavailable'));
  origin.append(ctx.el('div', 'edp-flight-stop-time', fmtClock(status.estimatedDeparture ?? status.scheduledDeparture)));
  strip.append(origin);

  const connector = ctx.el('div', 'edp-flight-route-connector');
  connector.append(ctx.el('div', 'edp-flight-route-line'));
  connector.append(ctx.el('div', 'edp-flight-route-arrow', '->'));
  strip.append(connector);

  const destination = ctx.el('div', 'edp-flight-stop');
  destination.append(ctx.el('div', 'edp-flight-stop-eyebrow', status.gate ? `Gate ${status.gate}` : 'Arrival'));
  destination.append(ctx.el('div', 'edp-flight-stop-code', status.destination.iata || '--'));
  destination.append(ctx.el('div', 'edp-flight-stop-name', status.destination.name || 'Destination unavailable'));
  destination.append(ctx.el('div', 'edp-flight-stop-time', fmtClock(status.estimatedArrival ?? status.scheduledArrival)));
  strip.append(destination);

  section.append(strip);

  const snapshot = ctx.el('div', 'edp-flight-snapshot-row');
  appendFact(ctx, snapshot, 'Duration', fmtDurationMinutes(
    status.scheduledDeparture && status.scheduledArrival
      ? Math.round((status.scheduledArrival.getTime() - status.scheduledDeparture.getTime()) / 60000)
      : null,
  ));
  appendFact(ctx, snapshot, 'Delay', fmtRelativeMinutes(status.delayMinutes));
  appendFact(ctx, snapshot, 'Altitude', fmtAltitude(pos));
  appendFact(ctx, snapshot, 'Speed', `${Math.round(pos.groundSpeedKts)} kts`);
  section.append(snapshot);

  return section;
}

function buildTrackSection(
  ctx: EntityRenderContext,
  pos: PositionSample,
  status: FlightInstance | null,
  details: WingbitsAircraftDetails | null,
  analysis: EnrichedAircraftInfo | null,
  photo: PlanespottersPhoto | null,
): HTMLElement {
  const section = ctx.el('div', 'edp-flight-track-section');

  const stats = ctx.el('div', 'edp-flight-track-stats');
  appendFact(ctx, stats, 'Altitude', fmtAltitude(pos));
  appendFact(ctx, stats, 'Speed', `${Math.round(pos.groundSpeedKts)} kts`);
  appendFact(ctx, stats, 'Track', `${getHeadingCardinal(pos.trackDeg)} • ${Math.round(pos.trackDeg)} deg`);
  section.append(stats);

  const summary = ctx.el('div', 'edp-flight-track-note');
  summary.append(ctx.el('div', 'edp-flight-track-note-title', getAircraftName(details, analysis, photo)));
  summary.append(ctx.el('div', 'edp-flight-track-note-body', `${getCarrierName(status, analysis, photo)} • ${getTrackNarrative(pos, status)} • ${fmtObservedAt(pos)}`));
  section.append(summary);

  return section;
}

function buildInfoGrid(
  ctx: EntityRenderContext,
  pos: PositionSample,
  details: WingbitsAircraftDetails | null,
  analysis: EnrichedAircraftInfo | null,
  photo: PlanespottersPhoto | null,
  status: FlightInstance | null,
): HTMLElement {
  const grid = ctx.el('div', 'edp-flight-facts-grid');
  appendFact(ctx, grid, 'Callsign', pos.callsign || '--');
  appendFact(ctx, grid, 'Registration', getRegistration(details, analysis, photo));
  appendFact(ctx, grid, 'Aircraft', getAircraftName(details, analysis, photo));
  appendFact(ctx, grid, 'Source', status?.source || pos.source || '--');
  appendFact(ctx, grid, 'Position', `${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}`);
  appendFact(ctx, grid, 'Last seen', fmtObservedAt(pos));
  return grid;
}

function buildHeroMedia(ctx: EntityRenderContext, photo: PlanespottersPhoto | null): HTMLElement | null {
  if (!photo?.imageUrl) return null;

  const media = ctx.el('div', 'edp-flight-media');
  const img = ctx.el('img', 'edp-flight-media-img') as HTMLImageElement;
  img.src = sanitizeUrl(photo.imageUrl);
  img.alt = photo.model || photo.registration || 'Aircraft photo';
  img.loading = 'lazy';
  media.append(img);

  const credit = ctx.el('div', 'edp-flight-media-credit');
  if (photo.linkUrl) {
    const link = ctx.el('a', 'edp-flight-media-link') as HTMLAnchorElement;
    link.href = sanitizeUrl(photo.linkUrl);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = photo.photographer ? `Photo: ${photo.photographer} via planespotters.net` : 'Photo via planespotters.net';
    credit.append(link);
  } else {
    credit.textContent = photo.photographer ? `Photo: ${photo.photographer}` : 'Photo via planespotters.net';
  }

  media.append(credit);
  return media;
}

function buildBrandLogo(
  ctx: EntityRenderContext,
  status: FlightInstance | null,
  details: WingbitsAircraftDetails | null,
  analysis: EnrichedAircraftInfo | null,
  photo: PlanespottersPhoto | null,
  pos: PositionSample,
): HTMLElement {
  const wrap = ctx.el('div', 'edp-flight-brand-logo');
  const fallback = ctx.el('span', 'edp-flight-brand-logo-fallback', getLogoText(status, details, analysis, photo, pos));
  wrap.append(fallback);

  const logoUrls = getAirlineLogoUrls(status, details, analysis, photo, pos);
  if (logoUrls.length > 0) {
    const img = ctx.el('img', 'edp-flight-brand-logo-img') as HTMLImageElement;
    img.alt = status?.carrier.name || status?.carrier.iata || 'Airline logo';
    img.loading = 'lazy';
    let logoIndex = 0;
    img.addEventListener('load', () => {
      wrap.classList.add('edp-flight-brand-logo-loaded');
    });
    img.addEventListener('error', () => {
      logoIndex += 1;
      if (logoIndex < logoUrls.length) {
        const nextLogo = logoUrls[logoIndex];
        if (nextLogo) {
          img.src = nextLogo;
          return;
        }
      }
      img.remove();
      wrap.classList.remove('edp-flight-brand-logo-loaded');
    });
    const initialLogo = logoUrls[logoIndex];
    if (initialLogo) img.src = initialLogo;
    wrap.prepend(img);
  }

  return wrap;
}

function buildRouteHero(
  container: HTMLElement,
  ctx: EntityRenderContext,
  pos: PositionSample,
  details: WingbitsAircraftDetails | null,
  analysis: EnrichedAircraftInfo | null,
  photo: PlanespottersPhoto | null,
  status: FlightInstance | null,
): void {
  const hero = ctx.el('section', 'edp-flight-hero');

  const header = ctx.el('div', 'edp-flight-hero-header');
  header.append(ctx.el('div', 'edp-flight-meta-line', `${status?.flightNumber || pos.callsign || pos.icao24} • ${fmtDateLabel(status?.date)}`));

  const media = buildHeroMedia(ctx, photo);
  if (media) header.append(media);

  hero.append(header);

  const top = ctx.el('div', 'edp-flight-hero-top');
  const brand = ctx.el('div', 'edp-flight-brand');
  brand.append(buildBrandLogo(ctx, status, details, analysis, photo, pos));

  const meta = ctx.el('div', 'edp-flight-meta');
  const title = hasRoute(status)
    ? `${status?.origin.iata || '--'} to ${status?.destination.iata || '--'}`
    : (pos.callsign || pos.icao24 || 'Aircraft track');
  meta.append(ctx.el('h2', 'edp-flight-route-title', title));

  const subtitle = hasRoute(status)
    ? `${status?.origin.name || 'Origin'} to ${status?.destination.name || 'Destination'}`
    : `${getCarrierName(status, analysis, photo)} • ${getAircraftName(details, analysis, photo)}`;
  meta.append(ctx.el('div', 'edp-flight-meta-subtitle', subtitle));

  brand.append(meta);
  top.append(brand);

  const statusPill = ctx.el('div', `edp-flight-status ${getAircraftStatusTone(pos, status)}`);
  statusPill.textContent = getAircraftStatusLabel(pos, status);
  top.append(statusPill);
  hero.append(top);

  if (status && hasRoute(status)) {
    hero.append(buildRouteSection(ctx, status, pos));
  } else {
    hero.append(buildTrackSection(ctx, pos, status, details, analysis, photo));
  }

  const progressWrap = ctx.el('div', 'edp-flight-progress-wrap');
  const progressEndpoints = getProgressEndpoints(status);
  const progressSummary = ctx.el('div', 'edp-flight-progress-summary');
  const leftEndpoint = ctx.el('div', 'edp-flight-progress-endpoint');
  leftEndpoint.append(ctx.el('div', 'edp-flight-progress-code', progressEndpoints.leftCode));
  leftEndpoint.append(ctx.el('div', 'edp-flight-progress-name', progressEndpoints.leftName));
  progressSummary.append(leftEndpoint);
  progressSummary.append(ctx.el('span', 'edp-flight-progress-meta', pos.onGround ? 'Ground track' : `${Math.round(pos.groundSpeedKts)} kts • ${fmtAltitude(pos)}`));
  const rightEndpoint = ctx.el('div', 'edp-flight-progress-endpoint edp-flight-progress-endpoint-right');
  rightEndpoint.append(ctx.el('div', 'edp-flight-progress-code', progressEndpoints.rightCode));
  rightEndpoint.append(ctx.el('div', 'edp-flight-progress-name', progressEndpoints.rightName));
  progressSummary.append(rightEndpoint);
  progressWrap.append(progressSummary);

  const progressBar = ctx.el('div', 'edp-flight-progress-bar');
  const progressFill = ctx.el('div', 'edp-flight-progress-fill') as HTMLDivElement;
  const progressPercent = Math.max(8, Math.round(getFlightProgress(pos, status) * 100));
  progressFill.style.width = `${progressPercent}%`;
  const plane = ctx.el('div', 'edp-flight-progress-plane', getCarrierBadgeLabel(status, details, analysis, photo, pos));
  plane.style.setProperty('--flight-badge-hue', String(getCarrierBadgeHue(plane.textContent || 'FLT')));
  plane.style.setProperty('--plane-left', `${progressPercent}%`);
  progressBar.append(progressFill, plane);
  progressWrap.append(progressBar);
  hero.append(progressWrap);

  hero.append(buildInfoGrid(ctx, pos, details, analysis, photo, status));
  container.append(hero);
}

export class AircraftRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const pos = data as PositionSample;
    const container = ctx.el('div', 'edp-generic');
    const hero = ctx.el('section', 'edp-flight-hero edp-flight-hero-skeleton');

    const header = ctx.el('div', 'edp-flight-hero-header');
    header.append(ctx.el('div', 'edp-flight-meta-line', `${pos.callsign || pos.icao24} • Live track`));
    hero.append(header);

    const top = ctx.el('div', 'edp-flight-hero-top');
    const brand = ctx.el('div', 'edp-flight-brand');
    brand.append(buildBrandLogo(ctx, null, null, null, null, pos));
    const meta = ctx.el('div', 'edp-flight-meta');
    meta.append(ctx.el('h2', 'edp-flight-route-title', pos.callsign || pos.icao24 || 'Aircraft track'));
    brand.append(meta);
    top.append(brand);
    top.append(ctx.el('div', 'edp-flight-status edp-flight-status-dim', 'Loading'));
    hero.append(top);

    hero.append(ctx.makeLoading('Loading route and aircraft details...'));
    container.append(hero);
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
    buildRouteHero(container, ctx, position, details, analysis, photo, flightStatus);
  }
}
