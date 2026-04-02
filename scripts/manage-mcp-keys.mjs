#!/usr/bin/env node
/**
 * Manage MCP server API keys.
 *
 * Usage:
 *   node scripts/manage-mcp-keys.mjs create <email/org> <tier>
 *   node scripts/manage-mcp-keys.mjs revoke  <key_hash>
 *   node scripts/manage-mcp-keys.mjs list
 *
 * Tiers: free, pro, business, enterprise
 */

import crypto from 'node:crypto';

const VALID_TIERS = new Set(['free', 'pro', 'business', 'enterprise']);
const API_KEY_LENGTH = 32; // bytes

function getEnv(key) {
  const val = process.env[key];
  if (!val) {
    console.error(`${key} is not set in environment.`);
    process.exit(1);
  }
  return val;
}

function getRedisUrlToken() {
  return { url: getEnv('UPSTASH_REDIS_REST_URL'), token: getEnv('UPSTASH_REDIS_REST_TOKEN') };
}

function sha256hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function redisGet(key) {
  const { url, token } = getRedisUrlToken();
  const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function redisSet(key, value, ttlSeconds = 2592000) {
  const { url, token } = getRedisUrlToken();
  await fetch(
    `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}/EX/${ttlSeconds}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
}

async function redisScan(pattern) {
  const { url, token } = getRedisUrlToken();
  const keys = [];
  let cursor = '0';
  for (let i = 0; i < 10; i++) {
    const resp = await fetch(
      `${url}/scan/${encodeURIComponent(cursor)}/MATCH/${encodeURIComponent(pattern)}/COUNT/100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok) break;
    const data = await resp.json();
    const [nextCursor, batch] = data.result;
    if (batch?.length) keys.push(...batch);
    cursor = String(nextCursor);
    if (cursor === '0') break;
  }
  return keys;
}

async function createKey(owner, tier) {
  if (!VALID_TIERS.has(tier)) {
    console.error(`Invalid tier "${tier}". Must be: ${[...VALID_TIERS].join(', ')}`);
    process.exit(1);
  }

  // Generate a new API key
  const key = `wm_${crypto.randomBytes(API_KEY_LENGTH).toString('base64url')}`;
  const keyHash = sha256hex(key);

  const info = {
    keyHash,
    tier,
    owner,
    createdAt: Date.now(),
    monthlyCallCount: 0,
    monthYear: new Date().toISOString().slice(0, 7),
    status: 'active',
  };

  await redisSet(`wm:key:${keyHash}`, info);

  console.log(`Created API key for "${owner}" (tier: ${tier}):`);
  console.log(`  Key:    ${key}`);
  console.log(`  Hash:   ${keyHash}`);
  console.log('');
  console.log('⚠️  Save the key immediately — it cannot be retrieved later!');
  console.log('   Only the hash is stored in Redis.');
}

async function revokeKey(keyOrHash) {
  let hash = keyOrHash;
  if (keyOrHash.startsWith('wm_')) {
    hash = sha256hex(keyOrHash);
  }

  const info = await redisGet(`wm:key:${hash}`);
  if (!info) {
    console.error('Key not found.');
    process.exit(1);
  }

  info.status = 'suspended';
  await redisSet(`wm:key:${hash}`, info);
  console.log(`Revoked key for "${info.owner}" (was ${info.tier})`);
}

async function listKeys() {
  const keys = await redisScan('wm:key:*');
  if (keys.length === 0) {
    console.log('No API keys found.');
    return;
  }

  console.log('Active API keys:');
  console.log('');

  for (const key of keys) {
    const info = await redisGet(key);
    if (!info) continue;

    const limits = { free: 100, pro: 1_000, business: 10_000, enterprise: '∞' };
    const used = info.monthlyCallCount;
    const limit = limits[info.tier] ?? 0;
    const pct = typeof limit === 'number' && limit > 0
      ? `${Math.round((used / limit) * 100)}%`
      : `${used} calls`;

    console.log(`  ${info.owner.padEnd(30)} | ${info.tier.padEnd(12)} | ${pct.padStart(8)} | ${info.status}`);
  }
}

// --- Entry point ---

const [action, arg1, arg2] = process.argv.slice(2);

switch (action) {
  case 'create':
    if (!arg1 || !arg2) {
      console.error('Usage: node scripts/manage-mcp-keys.mjs create <email/org> <tier>');
      process.exit(1);
    }
    await createKey(arg1, arg2);
    break;
  case 'revoke':
    if (!arg1) {
      console.error('Usage: node scripts/manage-mcp-keys.mjs revoke <key_or_hash>');
      process.exit(1);
    }
    await revokeKey(arg1);
    break;
  case 'list':
    await listKeys();
    break;
  default:
    console.error('Usage:');
    console.error('  node scripts/manage-mcp-keys.mjs create <email/org> <tier>');
    console.error('  node scripts/manage-mcp-keys.mjs revoke  <key_or_hash>');
    console.error('  node scripts/manage-mcp-keys.mjs list');
    console.error('');
    console.error('Tiers: free, pro, business, enterprise');
    process.exit(1);
}
