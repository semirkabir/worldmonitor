/**
 * MCP server API key management + usage billing.
 *
 * Each API key is tied to a subscription tier and tracks monthly call counts.
 * Keys are stored in Redis:
 *   wm:key:{keyHash} = JSON({ tier, owner, createdAt, monthlyCallCount, monthYear, status })
 */

import { UserTier } from '../_shared/auth-tier';

export interface ApiKeyInfo {
  keyHash: string;
  tier: UserTier;
  owner: string;
  createdAt: number;
  monthlyCallCount: number;
  monthYear: string;
  status: 'active' | 'suspended';
}

/** Per-API-key limits (in addition to per-user rate limits in the gateway). */
export const API_KEY_LIMITS: Record<UserTier, { callsPerMonth: number; maxToolsPerCall: number }> = {
  anonymous: { callsPerMonth: 0,         maxToolsPerCall: 0 },
  free:      { callsPerMonth: 100,       maxToolsPerCall: 1 },
  pro:       { callsPerMonth: 1_000,     maxToolsPerCall: 1 },
  business:  { callsPerMonth: 10_000,    maxToolsPerCall: 5 },
  enterprise:{ callsPerMonth: 0,         maxToolsPerCall: 10 },
};

const REDIS_OP_TIMEOUT_MS = 1_500;

function getRedisUrlToken(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/** Simple string hash for storing keys in Redis (not secure, just unique). */
function sha256hex(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/** Look up an API key's info from Redis. */
export async function getApiKeyInfo(key: string): Promise<ApiKeyInfo | null> {
  const creds = getRedisUrlToken();
  if (!creds) return null;

  try {
    const keyHash = sha256hex(key);
    const resp = await fetch(`${creds.url}/get/wm:key:${keyHash}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      signal: AbortSignal.timeout(REDIS_OP_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as { result?: string };
    return data.result ? JSON.parse(data.result) as ApiKeyInfo : null;
  } catch {
    return null;
  }
}

/** Increment the monthly call count for a given API key. */
export async function incrementKeyUsage(key: string): Promise<{ count: number; limit: number; exceeded: boolean } | null> {
  const creds = getRedisUrlToken();
  if (!creds) return null;

  try {
    const keyHash = sha256hex(key);
    const redisKey = `wm:key:${keyHash}`;

    const resp = await fetch(`${creds.url}/get/${encodeURIComponent(redisKey)}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      signal: AbortSignal.timeout(REDIS_OP_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const getData = (await resp.json()) as { result?: string };
    if (!getData.result) return null;

    const info: ApiKeyInfo = JSON.parse(getData.result);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Reset monthly count if we're in a new month
    if (info.monthYear !== currentMonth) {
      info.monthlyCallCount = 1;
      info.monthYear = currentMonth;
    } else {
      info.monthlyCallCount++;
    }

    const limit = API_KEY_LIMITS[info.tier]?.callsPerMonth ?? 0;
    const exceeded = limit > 0 && info.monthlyCallCount > limit;

    await fetch(`${creds.url}/set/${encodeURIComponent(redisKey)}/${encodeURIComponent(JSON.stringify(info))}/EX/2592000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}` },
    });

    return { count: info.monthlyCallCount, limit, exceeded };
  } catch {
    return null;
  }
}
