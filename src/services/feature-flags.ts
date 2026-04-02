/**
 * Feature tier management.
 *
 * Integrates with the user-auth system to check tier-based feature access.
 * The tier is stored in Convex and Redis (user:{uid}:tier).
 */

import { isLoggedIn } from './user-auth';

export type FeatureTier = 'free' | 'pro' | 'business' | 'enterprise';
export type LegacyTier = FeatureTier | 'logged_in' | 'premium';

export interface Feature {
  key: string;
  name: string;
  tier: LegacyTier;
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
  { key: 'export-data', name: 'Export Data', tier: 'pro' },
  { key: 'api-access', name: 'API Access', tier: 'pro' },
  { key: 'marketplace', name: 'Data Marketplace', tier: 'pro' },
  { key: 'mcp-access', name: 'MCP Agent API', tier: 'pro' },
];

/** Resolve the user's current tier from the auth system. */
export async function getUserTier(): Promise<FeatureTier> {
  if (!isLoggedIn()) return 'free';
  // For now, default to 'free' until we have the Convex query wired up.
  // TODO: Query Convex or Redis to get the actual stored tier.
  return 'free';
}

export function canAccessFeature(featureKey: string): boolean {
  const feature = FEATURES.find(f => f.key === featureKey);
  if (!feature) return true;

  switch (feature.tier) {
    case 'free':
      return true;
    case 'logged_in':
      return isLoggedIn();
    case 'pro':
    case 'business':
    case 'enterprise':
    case 'premium':
      return isLoggedIn(); // TODO: check actual subscription tier
    default:
      return true;
  }
}

export function getFeatureTier(featureKey: string): LegacyTier {
  const feature = FEATURES.find(f => f.key === featureKey);
  return feature?.tier ?? 'free';
}

export function requireFeature(featureKey: string): boolean {
  return canAccessFeature(featureKey);
}
