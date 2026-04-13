import { getConfidenceTierFromSources, type ConfidenceTier } from './confidence-tier';

export interface RankedEvent {
  id: string;
  eventType: string;
  title: string;
  description: string;
  lat: number;
  lon: number;
  sources: string[];
  fatalities?: number;
  timestamp: number;
  significanceScore: number;
}

const EVENT_TYPE_WEIGHTS: Record<string, number> = {
  missile: 10,
  strike: 9,
  bombing: 9,
  air: 8,
  drone: 7,
  ground: 6,
  troop: 5,
  naval: 5,
  interception: 4,
  defense: 4,
  diplomatic: 2,
  casualty: 8,
  fatality: 8,
};

const SOURCE_WEIGHTS: Record<string, number> = {
  centcom: 10,
  idf: 10,
  pentagon: 10,
  reuters: 8,
  ap: 8,
  bbc: 7,
  'al jazeera': 7,
  nyt: 7,
  osint: 5,
  state: 2,
};

function calculateSignificance(
  eventType: string,
  title: string,
  description: string,
  sources: string[],
  fatalities?: number
): number {
  let score = 0;
  
  const fullText = `${eventType} ${title} ${description}`.toLowerCase();
  
  for (const [keyword, weight] of Object.entries(EVENT_TYPE_WEIGHTS)) {
    if (fullText.includes(keyword)) {
      score += weight;
    }
  }
  
  const sourceStr = sources.join(' ').toLowerCase();
  for (const [source, weight] of Object.entries(SOURCE_WEIGHTS)) {
    if (sourceStr.includes(source)) {
      score += weight;
    }
  }
  
  if (fatalities && fatalities > 0) {
    score += Math.min(10, Math.log10(fatalities + 1) * 3);
  }
  
  const confidence = getConfidenceTierFromSources(sources);
  const confidenceBonus: Record<ConfidenceTier, number> = {
    high: 5,
    military: 5,
    wire: 2,
    osint: 0,
    unverified: -3,
  };
  score += confidenceBonus[confidence];
  
  return Math.max(0, score);
}

export function rankAndCapEvents<T extends {
  id: string;
  eventType: string;
  title?: string;
  description?: string;
  lat: number;
  lon: number;
  sources: string[];
  fatalities?: number;
  timestamp: number;
}>(events: T[], maxEvents: number = 12): (T & { significanceScore: number })[] {
  const ranked = events.map(e => ({
    ...e,
    significanceScore: calculateSignificance(
      e.eventType,
      e.title || '',
      e.description || '',
      e.sources,
      e.fatalities
    ),
  }));
  
  ranked.sort((a, b) => b.significanceScore - a.significanceScore);
  
  return ranked.slice(0, maxEvents);
}

export function filterBySignificance<T extends { significanceScore?: number }>(
  events: T[],
  threshold: number = 0
): T[] {
  return events.filter(e => (e.significanceScore || 0) >= threshold);
}

export const DEFAULT_EVENT_CAPS = {
  strikes: 12,
  ground: 6,
  casualties: 500,
  displayed: 200,
};

export function getEventCap(eventType: string): number {
  const type = eventType.toLowerCase();
  if (type.includes('ground') || type.includes('troop')) return DEFAULT_EVENT_CAPS.ground;
  return DEFAULT_EVENT_CAPS.strikes;
}
