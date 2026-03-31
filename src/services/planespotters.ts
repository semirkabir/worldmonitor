import { sanitizeUrl } from '@/utils/sanitize';

export interface PlanespottersPhoto {
  thumbnailUrl: string;
  imageUrl: string;
  linkUrl: string;
  photographer: string | null;
  registration: string | null;
  operator: string | null;
  manufacturer: string | null;
  model: string | null;
}

interface PlanespottersApiPhoto {
  thumbnail?: { src?: string };
  thumbnail_large?: { src?: string };
  link?: string;
  photographer?: string;
}

interface PlanespottersApiResponse {
  photos?: PlanespottersApiPhoto[];
}

const MANUFACTURER_MARKERS = [
  'airbus', 'boeing', 'embraer', 'bombardier', 'cessna', 'beechcraft', 'piper',
  'mcdonnell-douglas', 'mcdonnell', 'sukhoi', 'atr', 'de-havilland', 'fairchild',
  'gulfstream', 'learjet', 'fokker', 'lockheed', 'pilatus', 'saab', 'antonov',
] as const;

function titleCaseFromSlug(text: string): string {
  return text
    .split('-')
    .filter(Boolean)
    .map((part) => part.length <= 3 && /\d/.test(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractMetadataFromLink(link: string | undefined): Pick<PlanespottersPhoto, 'registration' | 'operator' | 'manufacturer' | 'model'> {
  const fallback = { registration: null, operator: null, manufacturer: null, model: null };
  if (!link) return fallback;

  const match = link.match(/\/photo\/\d+\/([^?/#]+)/i);
  if (!match?.[1]) return fallback;

  const slug = match[1].toLowerCase();
  const parts = slug.split('-').filter(Boolean);
  if (parts.length < 3) return fallback;

  const registration = parts[0] ? parts[0].toUpperCase() : null;
  const manufacturerIndex = parts.findIndex((part, index) => index > 0 && MANUFACTURER_MARKERS.includes(part as typeof MANUFACTURER_MARKERS[number]));
  if (manufacturerIndex <= 0) {
    return { registration, operator: null, manufacturer: null, model: null };
  }

  const operator = titleCaseFromSlug(parts.slice(1, manufacturerIndex).join('-')) || null;
  const manufacturerSlug = parts[manufacturerIndex] || '';
  const manufacturer = manufacturerSlug ? titleCaseFromSlug(manufacturerSlug) : null;
  const model = titleCaseFromSlug(parts.slice(manufacturerIndex + 1).join('-')) || null;

  return { registration, operator, manufacturer, model };
}

async function requestPhoto(endpoint: string, signal?: AbortSignal): Promise<PlanespottersPhoto | null> {
  try {
    const resp = await fetch(endpoint, { method: 'GET', signal, headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    const data = (await resp.json()) as PlanespottersApiResponse;
    return normalizePhoto(data.photos?.[0]);
  } catch {
    return null;
  }
}

function normalizePhoto(photo: PlanespottersApiPhoto | undefined): PlanespottersPhoto | null {
  if (!photo) return null;

  const thumbnailUrl = sanitizeUrl(photo.thumbnail_large?.src || photo.thumbnail?.src || '');
  const imageUrl = sanitizeUrl(photo.thumbnail_large?.src || photo.thumbnail?.src || '');
  const linkUrl = sanitizeUrl(photo.link || '');

  if (!thumbnailUrl && !imageUrl) return null;

  const meta = extractMetadataFromLink(photo.link);

  return {
    thumbnailUrl,
    imageUrl,
    linkUrl,
    photographer: photo.photographer || null,
    registration: meta.registration,
    operator: meta.operator,
    manufacturer: meta.manufacturer,
    model: meta.model,
  };
}

export async function getPlanePhoto(registration?: string | null, signal?: AbortSignal): Promise<PlanespottersPhoto | null> {
  const reg = (registration || '').trim().toUpperCase();
  if (!reg) return null;

  return requestPhoto(`/api/planespotters?reg=${encodeURIComponent(reg)}`, signal);
}

export async function getPlanePhotoByHex(icao24?: string | null, signal?: AbortSignal): Promise<PlanespottersPhoto | null> {
  const hex = (icao24 || '').trim().toLowerCase();
  if (!hex) return null;

  return requestPhoto(`/api/planespotters?hex=${encodeURIComponent(hex)}`, signal);
}
