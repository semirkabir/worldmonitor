const GEO_CELL_SIZE = 0.5;

interface DedupSignature {
  eventType: string;
  geoCell: string;
  descKey: string;
  timestamp: number;
}

const dedupStore = new Map<string, DedupSignature>();

const WINDOW_MISSILE = 1 * 60 * 60 * 1000;
const WINDOW_AIR_STRIKE = 1 * 60 * 60 * 1000;
const WINDOW_DRONE = 2 * 60 * 60 * 1000;
const WINDOW_INTERCEPTION = 1 * 60 * 60 * 1000;
const WINDOW_GROUND = 4 * 60 * 60 * 1000;
const WINDOW_DEFAULT = 2 * 60 * 60 * 1000;

function getGeoCell(lat: number, lon: number): string {
  const cellLat = Math.floor(lat / GEO_CELL_SIZE) * GEO_CELL_SIZE;
  const cellLon = Math.floor(lon / GEO_CELL_SIZE) * GEO_CELL_SIZE;
  return `${cellLat},${cellLon}`;
}

function getDescKey(description: string): string {
  const cleaned = description.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return cleaned.slice(0, 30);
}

export function getEventTypeKey(eventType: string): string {
  const type = eventType.toLowerCase();
  if (type.includes('missile')) return 'missile';
  if (type.includes('air') || type.includes('bomb')) return 'air_strike';
  if (type.includes('drone')) return 'drone';
  if (type.includes('intercept') || type.includes('defense')) return 'interception';
  if (type.includes('ground') || type.includes('troop') || type.includes('armor')) return 'ground';
  return 'default';
}

export function createEventSignature(
  eventType: string,
  lat: number,
  lon: number,
  description: string
): string {
  const geoCell = getGeoCell(lat, lon);
  const descKey = getDescKey(description);
  const typeKey = getEventTypeKey(eventType);
  return `${typeKey}|${geoCell}|${descKey}`;
}

export function isEventDuplicate(
  eventType: string,
  lat: number,
  lon: number,
  description: string,
  _eventId?: string
): boolean {
  const signature = createEventSignature(eventType, lat, lon, description);
  
  const existing = dedupStore.get(signature);
  if (existing) {
    const key = getEventTypeKey(eventType);
    let windowMs = WINDOW_DEFAULT;
    if (key === 'missile') windowMs = WINDOW_MISSILE;
    else if (key === 'air_strike') windowMs = WINDOW_AIR_STRIKE;
    else if (key === 'drone') windowMs = WINDOW_DRONE;
    else if (key === 'interception') windowMs = WINDOW_INTERCEPTION;
    else if (key === 'ground') windowMs = WINDOW_GROUND;
    if (Date.now() - existing.timestamp < windowMs) {
      return true;
    }
  }
  
  return false;
}

export function registerEvent(
  eventType: string,
  lat: number,
  lon: number,
  description: string,
  _eventId?: string
): void {
  const signature = createEventSignature(eventType, lat, lon, description);
  const key = getEventTypeKey(eventType);
  let windowMs = WINDOW_DEFAULT;
  if (key === 'missile') windowMs = WINDOW_MISSILE;
  else if (key === 'air_strike') windowMs = WINDOW_AIR_STRIKE;
  else if (key === 'drone') windowMs = WINDOW_DRONE;
  else if (key === 'interception') windowMs = WINDOW_INTERCEPTION;
  else if (key === 'ground') windowMs = WINDOW_GROUND;
  
  dedupStore.set(signature, {
    eventType: key,
    geoCell: getGeoCell(lat, lon),
    descKey: getDescKey(description),
    timestamp: Date.now(),
  });
  
  setTimeout(() => {
    dedupStore.delete(signature);
  }, windowMs);
}

export function clearDedupStore(): void {
  dedupStore.clear();
}

export function getDedupStats(): { size: number; oldestEntry: number } {
  let oldest = Date.now();
  for (const sig of dedupStore.values()) {
    if (sig.timestamp < oldest) oldest = sig.timestamp;
  }
  return {
    size: dedupStore.size,
    oldestEntry: dedupStore.size > 0 ? oldest : 0,
  };
}
