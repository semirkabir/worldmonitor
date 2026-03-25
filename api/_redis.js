/**
 * Shared Redis (Upstash REST) utilities for API route handlers.
 */

export function getRedisCredentials() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis not configured');
  return { url, token };
}

/**
 * Execute a batch of Redis commands via the Upstash REST pipeline endpoint.
 * @param {string[][]} commands - Array of Redis commands, e.g. [['GET', 'key1'], ['GET', 'key2']]
 * @param {number} [timeoutMs=8000] - Fetch timeout in milliseconds
 * @returns {Promise<Array<{ result: any }>>}
 */
export async function redisPipeline(commands, timeoutMs = 8000) {
  const { url, token } = getRedisCredentials();
  const resp = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`Redis pipeline HTTP ${resp.status}`);
  return resp.json();
}

/**
 * GET a single key from Redis via the Upstash REST API.
 * @param {string} key
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<string | null>} Raw string value or null
 */
export async function redisGet(key, timeoutMs = 3000) {
  const { url, token } = getRedisCredentials();
  const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.result ?? null;
}

/**
 * Scan Redis keys matching a pattern.
 * @param {string} pattern - MATCH pattern (e.g. 'seed-meta:*')
 * @param {number} [maxIterations=5]
 * @returns {Promise<{ keys: string[], truncated: boolean }>}
 */
export async function redisScan(pattern, maxIterations = 5) {
  const { url, token } = getRedisCredentials();
  const keys = [];
  let cursor = '0';
  let truncated = false;

  for (let i = 0; i < maxIterations; i++) {
    const resp = await fetch(
      `${url}/scan/${encodeURIComponent(cursor)}/MATCH/${encodeURIComponent(pattern)}/COUNT/100`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (!resp.ok) throw new Error(`Redis SCAN HTTP ${resp.status}`);
    const data = await resp.json();
    const [nextCursor, batch] = data.result;
    if (batch?.length) keys.push(...batch);
    cursor = String(nextCursor);
    if (cursor === '0') break;
    if (i === maxIterations - 1) truncated = true;
  }

  return { keys, truncated };
}
