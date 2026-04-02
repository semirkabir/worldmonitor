import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { UserTier, TIER_LIMITS } from './auth-tier';

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

/** Per-tier rate limiting — 5 levels. */
const TIER_RL: Record<UserTier, { limit: number; window: Duration }> = {
  anonymous: { limit: TIER_LIMITS.anonymous.requestsPerHour,         window: '1 h' },
  free:      { limit: TIER_LIMITS.free.requestsPerHour,              window: '1 h' },
  pro:       { limit: TIER_LIMITS.pro.requestsPerHour,               window: '1 h' },
  business:  { limit: TIER_LIMITS.business.requestsPerHour,          window: '1 h' },
  enterprise:{ limit: TIER_LIMITS.enterprise.requestsPerHour,        window: '1 h' },
};

const tierLimiters = new Map<string, Ratelimit>();

function getTierRatelimit(tier: UserTier): Ratelimit | null {
  const cacheKey = `rl:tier:${tier}`;
  const cached = tierLimiters.get(cacheKey);
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const policy = TIER_RL[tier];
  const rl = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
    prefix: cacheKey,
    analytics: false,
  });
  tierLimiters.set(cacheKey, rl);
  return rl;
}

export async function checkRateLimit(
  request: Request,
  corsHeaders: Record<string, string>,
  tier: UserTier = 'anonymous',
): Promise<Response | null> {
  const rl = getTierRatelimit(tier);
  if (!rl) return null;

  const uid = request.headers.get('x-wm-user-id') || '';
  const key = tier === 'anonymous' ? `anon:${getClientIp(request)}` : `${tier}:${uid}`;

  try {
    const { success, limit, reset, remaining } = await rl.limit(key);

    if (!success) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(reset),
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
          'X-User-Tier': tier,
          ...corsHeaders,
        },
      });
    }

    const hdrs = {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(reset),
      'X-User-Tier': tier,
    };
    for (const [k, v] of Object.entries(hdrs)) {
      request.headers.set(`x-wm-${k.toLowerCase()}`, v);
    }
    return null;
  } catch {
    return null;
  }
}

// --- Per-endpoint rate limiting ---

interface EndpointRatePolicy {
  limit: number;
  window: Duration;
}

const ENDPOINT_RATE_POLICIES: Record<string, EndpointRatePolicy> = {
  '/api/news/v1/summarize-article-cache': { limit: 30, window: '60 s' },
  '/api/intelligence/v1/classify-event': { limit: 600, window: '60 s' },
};

const endpointLimiters = new Map<string, Ratelimit>();

function getEndpointRatelimit(pathname: string): Ratelimit | null {
  const policy = ENDPOINT_RATE_POLICIES[pathname];
  if (!policy) return null;

  const cached = endpointLimiters.get(pathname);
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const rl = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
    prefix: 'rl:ep',
    analytics: false,
  });
  endpointLimiters.set(pathname, rl);
  return rl;
}

export function hasEndpointRatePolicy(pathname: string): boolean {
  return pathname in ENDPOINT_RATE_POLICIES;
}

export async function checkEndpointRateLimit(
  request: Request,
  pathname: string,
  corsHeaders: Record<string, string>,
  tier: UserTier = 'anonymous',
): Promise<Response | null> {
  const rl = getEndpointRatelimit(pathname);
  if (!rl) return null;

  const uid = request.headers.get('x-wm-user-id') || '';
  const key = uid ? uid : `anon:${getClientIp(request)}`;

  try {
    const { success, limit, reset } = await rl.limit(`${pathname}:${key}`);
    if (!success) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(reset),
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
          'X-User-Tier': tier,
          ...corsHeaders,
        },
      });
    }
    return null;
  } catch {
    return null;
  }
}
