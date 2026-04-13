export type ConfidenceTier = 'high' | 'military' | 'wire' | 'osint' | 'unverified';

export interface ConfidenceTierConfig {
  tier: ConfidenceTier;
  label: string;
  color: string;
  borderStyle: 'solid' | 'dashed';
  opacity: number;
  triggersAlert: boolean;
}

export const CONFIDENCE_TIERS: Record<ConfidenceTier, ConfidenceTierConfig> = {
  high: {
    tier: 'high',
    label: 'High Confidence',
    color: '#22c55e',
    borderStyle: 'solid',
    opacity: 1,
    triggersAlert: true,
  },
  military: {
    tier: 'military',
    label: 'US/Military',
    color: '#3b82f6',
    borderStyle: 'solid',
    opacity: 1,
    triggersAlert: true,
  },
  wire: {
    tier: 'wire',
    label: 'News Wire',
    color: '#f59e0b',
    borderStyle: 'solid',
    opacity: 1,
    triggersAlert: false,
  },
  osint: {
    tier: 'osint',
    label: 'OSINT',
    color: '#9ca3af',
    borderStyle: 'solid',
    opacity: 0.6,
    triggersAlert: false,
  },
  unverified: {
    tier: 'unverified',
    label: 'Unverified',
    color: '#ef4444',
    borderStyle: 'dashed',
    opacity: 0.6,
    triggersAlert: false,
  },
};

export function getConfidenceTierFromSources(sources: string[]): ConfidenceTier {
  const sourceStr = sources.join(' ').toLowerCase();
  
  const multiWire = ['reuters', 'ap ', 'bbc', 'nyt', 'al jazeera'].filter(s => sourceStr.includes(s)).length;
  if (multiWire >= 2) return 'high';
  
  const militarySources = ['centcom', 'idf', 'pentagon', 'defense department', 'u.s. military'];
  if (militarySources.some(s => sourceStr.includes(s))) return 'military';
  
  const wireSources = ['reuters', 'ap', 'bbc', 'npr', 'al jazeera'];
  if (wireSources.some(s => sourceStr.includes(s))) return 'wire';
  
  const osintIndicators = ['@', 'telegram', 'osint', 'confirm', 'visual'];
  if (osintIndicators.some(s => sourceStr.includes(s)) && !wireSources.some(s => sourceStr.includes(s))) return 'osint';
  
  return 'unverified';
}

export function getConfidenceColor(tier: ConfidenceTier): string {
  return CONFIDENCE_TIERS[tier].color;
}

export function shouldTriggerAlert(tier: ConfidenceTier): boolean {
  return CONFIDENCE_TIERS[tier].triggersAlert;
}
