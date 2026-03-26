import { isLoggedIn } from './user-auth';

export type FeatureTier = 'free' | 'logged_in' | 'premium';

export interface Feature {
  key: string;
  name: string;
  tier: FeatureTier;
  description?: string;
}

export const FEATURES: Feature[] = [
  { key: 'breaking-alerts', name: 'Breaking News Alerts', tier: 'free' },
  { key: 'intelligence-findings', name: 'Intelligence Findings', tier: 'logged_in' },
  { key: 'watchlist', name: 'Custom Watchlist', tier: 'logged_in' },
  { key: 'ai-summaries', name: 'AI Summaries', tier: 'logged_in' },
  { key: 'prediction-markets', name: 'Prediction Markets', tier: 'logged_in' },
  { key: 'historical-playback', name: 'Historical Playback', tier: 'logged_in' },
  { key: 'custom-panels', name: 'Custom Panel Layouts', tier: 'logged_in' },
  { key: 'alert-rules', name: 'Alert Rules Engine', tier: 'logged_in' },
  { key: 'export-data', name: 'Export Data', tier: 'premium' },
  { key: 'api-access', name: 'API Access', tier: 'premium' },
];

export function canAccessFeature(featureKey: string): boolean {
  const feature = FEATURES.find(f => f.key === featureKey);
  if (!feature) return true; // Unknown features default to allowed

  switch (feature.tier) {
    case 'free':
      return true;
    case 'logged_in':
      return isLoggedIn();
    case 'premium':
      // TODO: Check subscription status
      return isLoggedIn();
    default:
      return true;
  }
}

export function getFeatureTier(featureKey: string): FeatureTier {
  const feature = FEATURES.find(f => f.key === featureKey);
  return feature?.tier ?? 'free';
}

export function requireFeature(featureKey: string): void {
  if (!canAccessFeature(featureKey)) {
    throw new Error(`Feature "${featureKey}" requires login`);
  }
}
