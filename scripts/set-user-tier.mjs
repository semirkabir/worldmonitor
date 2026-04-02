#!/usr/bin/env node
/**
 * Set a user's API tier in Upstash Redis.
 *
 * Usage:
 *   node scripts/set-user-tier.mjs <firebase_uid> <tier>
 *
 * Tiers: free, pro, business, enterprise
 *
 * Example:
 *   node scripts/set-user-tier.mjs abc123xyz pro
 */

import { strict as assert } from 'node:assert';

const VALID_TIERS = new Set(['free', 'pro', 'business', 'enterprise']);

const [uid, tier] = process.argv.slice(2);

if (!uid || !tier) {
  console.error('Usage: node scripts/set-user-tier.mjs <firebase_uid> <free|pro|business|enterprise>');
  process.exit(1);
}

assert.ok(VALID_TIERS.has(tier), `Invalid tier "${tier}". Must be one of: ${[...VALID_TIERS].join(', ')}`);

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in environment.');
  process.exit(1);
}

const resp = await fetch(
  `${url}/set/user:${uid}:tier/${encodeURIComponent(JSON.stringify(tier))}/EX/2592000`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  },
);

if (!resp.ok) {
  console.error(`Failed to set tier: HTTP ${resp.status}`);
  const body = await resp.text();
  console.error(body);
  process.exit(1);
}

console.log(`Set user "${uid}" to tier "${tier}" (TTL: 30 days)`);
