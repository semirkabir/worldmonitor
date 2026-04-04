/**
 * Feature tier management.
 *
 * Integrates with the user-auth system to check tier-based feature access.
 * The tier is stored in Redis (user:{uid}:tier) and resolved server-side
 * via the /api/user-tier endpoint using the Firebase ID token.
 */

import { getFirebaseAuth } from './firebase-auth';
import { isLoggedIn } from './user-auth';

export type FeatureTier = 'free' | 'pro' | 'business' | 'enterprise';
type TierResponse = 'free' | 'pro' | 'business' | 'enterprise' | 'anonymous';

export interface TierInfo {
  tier: TierResponse;
  requestsPerHour: number;
  cacheStaleness: 'aggressive' | 'moderate' | 'minimal' | 'none';
  mcpEnabled: boolean;
}

const TIER_ORDER: Record<string, number> = { anonymous: 0, free: 1, pro: 2, business: 3, enterprise: 4 };

export interface Feature {
  key: string;
  name: string;
  tier: TierResponse | 'logged_in';
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

// Cached tier info, refreshed on auth change or every 5 minutes
let cachedTierInfo: TierInfo | null = null;
let tierCacheExpiry = 0;

const TIER_CACHE_MS = 5 * 60 * 1000;

async function resolveTierFromServer(): Promise<FeatureTier> {
  const auth = getFirebaseAuth();
  if (!auth) return 'free';

  const user = auth.currentUser;
  if (!user) return 'free';

  try {
    const idToken = await user.getIdToken(true);
    const resp = await fetch('/api/user-tier', {
      headers: { Authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) return 'free';
    const data = (await resp.json()) as TierInfo;
    cachedTierInfo = data;
    tierCacheExpiry = Date.now() + TIER_CACHE_MS;
    return (data.tier as TierResponse) === 'anonymous' ? 'free' : data.tier as FeatureTier;
  } catch {
    return 'free';
  }
}

async function getCachedTier(): Promise<FeatureTier> {
  if (cachedTierInfo && Date.now() < tierCacheExpiry) {
    return cachedTierInfo.tier as FeatureTier;
  }
  return resolveTierFromServer();
}

/** Get user's tier from the API endpoint. Returns 'free' as fallback. */
export async function getUserTier(): Promise<FeatureTier> {
  if (!isLoggedIn()) return 'free';
  return getCachedTier();
}

/** Refresh cached tier (call after auth state changes or profile updates). */
export async function refreshUserTier(): Promise<FeatureTier> {
  return resolveTierFromServer();
}

function meetsTierRequirement(userTier: FeatureTier, requiredTier: TierResponse | 'logged_in'): boolean {
  if (requiredTier === 'logged_in') return true;
  const userLevel = TIER_ORDER[userTier] ?? 0;
  const requiredLevel = TIER_ORDER[requiredTier] ?? 0;
  return userLevel >= requiredLevel;
}

export function canAccessFeature(featureKey: string): boolean {
  const feature = FEATURES.find(f => f.key === featureKey);
  if (!feature) return true;

  if (feature.tier === 'logged_in') return isLoggedIn();

  const userTier = (cachedTierInfo?.tier as FeatureTier) || 'free';
  return meetsTierRequirement(userTier, feature.tier);
}

export function getFeatureTier(featureKey: string): TierResponse | 'logged_in' {
  const feature = FEATURES.find(f => f.key === featureKey);
  return feature?.tier ?? 'free';
}
