/**
 * User tier definitions + Firebase ID token verification.
 *
 * Tiers form a ladder from free web access → paid subscriber → enterprise data licensee.
 * Each tier gets more rate, freshness, and features.
 *
 * Edge-Runtime safe: uses fetch for Google tokeninfo, no external deps.
 */

// --- Ladder tier definitions ----------------------------------------

/**
 * The user tier determines:
 *   - Rate limit (requests per hour)
 *   - How aggressively CDN caches responses
 *   - Which endpoints/features are available
 */
export type UserTier = 'anonymous' | 'free' | 'pro' | 'business' | 'enterprise';

export interface TierLimits {
  requestsPerHour: number;
  /** How aggressively we serve stale CDN cache. */
  cacheStaleness: 'aggressive' | 'moderate' | 'minimal' | 'none';
  /** Whether MCP/agent API calls are enabled. */
  mcpEnabled: boolean;
  /** Monthly MCP API call quota (0 = unlimited for enterprise). */
  mcpCallsPerMonth: number;
}

export const TIER_LIMITS: Record<UserTier, TierLimits> = {
  anonymous: {
    requestsPerHour: 30,
    cacheStaleness: 'aggressive',
    mcpEnabled: false,
    mcpCallsPerMonth: 0,
  },
  free: {
    requestsPerHour: 120,
    cacheStaleness: 'moderate',
    mcpEnabled: false,
    mcpCallsPerMonth: 0,
  },
  pro: {
    requestsPerHour: 600,
    cacheStaleness: 'minimal',
    mcpEnabled: true,
    mcpCallsPerMonth: 1_000,
  },
  business: {
    requestsPerHour: 2_000,
    cacheStaleness: 'minimal',
    mcpEnabled: true,
    mcpCallsPerMonth: 10_000,
  },
  enterprise: {
    requestsPerHour: 10_000,
    cacheStaleness: 'none',
    mcpEnabled: true,
    mcpCallsPerMonth: 0, // unlimited
  },
};

// --- Firebase ID token verification via Google tokeninfo -----------

export interface VerifiedFirebaseToken {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

const TOKENINFO_CACHE = new Map<string, { verified: VerifiedFirebaseToken; expiry: number }>();

/**
 * Verify a Firebase ID token by calling Google's tokeninfo endpoint.
 * Returns null if the token is invalid or expired.
 * Results cached per-token so we don't hit Google on every request.
 */
export async function verifyFirebaseJwt(
  idToken: string,
  projectId: string,
): Promise<VerifiedFirebaseToken | null> {
  const cached = TOKENINFO_CACHE.get(idToken);
  if (cached && Date.now() < cached.expiry) return cached.verified;

  try {
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!resp.ok) return null;

    const info = await resp.json();
    if (info.aud !== projectId) return null;

    const tokenTtl = (Number(info.expires_in) - 300) * 1_000;
    const verified: VerifiedFirebaseToken = {
      uid: info.sub ?? info.user_id,
      email: info.email,
      emailVerified: info.email_verified === 'true',
    };

    if (tokenTtl > 0) {
      TOKENINFO_CACHE.set(idToken, { verified, expiry: Date.now() + tokenTtl });
    }

    if (TOKENINFO_CACHE.size > 500) {
      const now = Date.now();
      for (const [key, entry] of TOKENINFO_CACHE.entries()) {
        if (now >= entry.expiry) TOKENINFO_CACHE.delete(key);
      }
    }

    return verified;
  } catch {
    return null;
  }
}

// --- Tier look-up/set via Redis -------------------------------------

const REDIS_OP_TIMEOUT_MS = 1_500;

function getRedisUrlToken(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/** Look up a user's tier from Redis. Returns 'free' if not configured or Redis is down. */
export async function getUserTier(uid: string): Promise<UserTier> {
  const creds = getRedisUrlToken();
  if (!creds) return 'free';

  try {
    const resp = await fetch(`${creds.url}/get/user:${uid}:tier`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      signal: AbortSignal.timeout(REDIS_OP_TIMEOUT_MS),
    });
    if (!resp.ok) return 'free';

    const data = (await resp.json()) as { result?: string };
    const tier = data.result ? JSON.parse(data.result) as UserTier : null;
    return (tier && tier in TIER_LIMITS) ? tier : 'free';
  } catch {
    return 'free';
  }
}

/** Set a user's tier in Redis. TTL = 30 days. */
export async function setUserTier(uid: string, tier: UserTier): Promise<void> {
  const creds = getRedisUrlToken();
  if (!creds) return;

  try {
    await fetch(
      `${creds.url}/set/user:${uid}:tier/${encodeURIComponent(JSON.stringify(tier))}/EX/2592000`,
      { method: 'POST', headers: { Authorization: `Bearer ${creds.token}` } },
    );
  } catch {
    // fire-and-forget
  }
}
