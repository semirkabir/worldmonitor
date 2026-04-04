/**
 * User Tier API — resolves subscription tier from Redis.
 *
 * GET /api/user-tier  (requires Firebase ID token in Authorization header)
 * Returns { tier, mcpEnabled, requestsPerHour, cacheStaleness }
 *
 * Anonymous / no token → tier: 'anonymous'
 */
import { getCorsHeaders } from './_cors.js';

export const config = { runtime: 'edge' };

const TIER_META = {
  anonymous: { requestsPerHour: 30, cacheStaleness: 'aggressive', mcpEnabled: false },
  free: { requestsPerHour: 120, cacheStaleness: 'moderate', mcpEnabled: false },
  pro: { requestsPerHour: 600, cacheStaleness: 'minimal', mcpEnabled: true },
  business: { requestsPerHour: 2_000, cacheStaleness: 'minimal', mcpEnabled: true },
  enterprise: { requestsPerHour: 10_000, cacheStaleness: 'none', mcpEnabled: true },
};

async function verifyFirebaseJwt(idToken) {
  try {
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!resp.ok) return null;
    const info = await resp.json();
    if (info.aud !== process.env.FIREBASE_WEB_APP_ID) return null;
    return { uid: info.sub ?? info.user_id };
  } catch {
    return null;
  }
}

async function getUserTierFromRedis(uid) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return 'free';

  try {
    const resp = await fetch(`${url}/get/user:${uid}:tier`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1_500),
    });
    if (!resp.ok) return 'free';
    const data = await resp.json();
    const tier = data.result ? JSON.parse(data.result) : null;
    return (tier && tier in TIER_META) ? tier : 'free';
  } catch {
    return 'free';
  }
}

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors } });

  const auth = req.headers.get('authorization') || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!idToken) {
    return new Response(JSON.stringify({ tier: 'anonymous', ...TIER_META.anonymous }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors, 'Cache-Control': 'public, s-maxage=60' },
    });
  }

  const verified = await verifyFirebaseJwt(idToken);
  if (!verified) {
    return new Response(JSON.stringify({ tier: 'anonymous', ...TIER_META.anonymous }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const tier = await getUserTierFromRedis(verified.uid);
  return new Response(JSON.stringify({ tier, ...TIER_META[tier] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...cors, 'Cache-Control': 'no-cache' },
  });
}
