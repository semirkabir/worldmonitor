import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { validateApiKey } from './_api-key.js';
import { checkRateLimit } from './_rate-limit.js';

export const config = { runtime: 'edge' };

/** Tier ordering for comparison. */
const TIER_ORDER = { free: 0, pro: 1, business: 2, enterprise: 3 };

/**
 * Call Convex HTTP API. The CONVEX_URL env var is the Convex deployment URL
 * (e.g. https://myapp-abc123.convex.cloud).  For queries we use the public
 * endpoint since listDatasets and getDataset are public queries.
 */
async function convexQuery(path, args) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  if (!url) return null;

  try {
    const resp = await fetch(`${url}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, arguments: args }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

/** Call Convex mutation — requires admin token. */
async function convexMutation(path, args) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  const token = process.env.CONVEX_ADMIN_TOKEN;
  if (!url || !token) return null;

  try {
    const resp = await fetch(`${url}/api/mutation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ path, arguments: args }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

/**
 * Data Marketplace API endpoint.
 *
 * GET /api/marketplace             — List published datasets (metadata + preview)
 * GET /api/marketplace?slug=xxx    — Get specific dataset (gated by tier/purchase)
 * POST /api/marketplace            — Create dataset (admin only, via API key)
 */
export default async function handler(req) {
  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Rate limit for all requests
  const rateLimitResponse = await checkRateLimit(req, cors);
  if (rateLimitResponse) return rateLimitResponse;

  // --- POST: Create dataset (admin only) ---
  if (req.method === 'POST') {
    const keyCheck = validateApiKey(req);
    if (keyCheck.required && !keyCheck.valid) {
      return new Response(JSON.stringify({ error: keyCheck.error }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    let body;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    if (!body.slug || !body.title || !body.data) {
      return new Response(JSON.stringify({ error: 'Missing required fields: slug, title, data' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const result = await convexMutation('dataset-service:createDataset', {
      slug: body.slug,
      title: body.title,
      description: body.description || '',
      format: body.format || 'json',
      recordCount: body.recordCount || 0,
      fileSizeBytes: body.fileSizeBytes || 0,
      minTier: body.minTier || 'pro',
      price: body.price || 0,
      data: typeof body.data === 'string' ? body.data : JSON.stringify(body.data),
      preview: body.preview ? (typeof body.preview === 'string' ? body.preview : JSON.stringify(body.preview)) : null,
      tags: body.tags || [],
      category: body.category || 'general',
    });

    if (result) {
      // Publish if requested
      if (body.publish) {
        await convexMutation('dataset-service:publishDataset', { slug: body.slug });
      }
    }

    return new Response(JSON.stringify(result || { status: 'convex_error' }), {
      status: result ? 200 : 502,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // --- GET ---
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  const firebaseUid = url.searchParams.get('uid');
  const userTier = url.searchParams.get('tier') || 'free';

  if (slug) {
    // Get specific dataset
    const dataset = await convexQuery('dataset-service:getDataset', { slug, firebaseUid, userTier });
    if (!dataset || dataset.error) {
      return new Response(JSON.stringify({ error: dataset?.error || 'Dataset not found' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    if (dataset.accessDenied) {
      return new Response(JSON.stringify({
        slug: dataset.slug, title: dataset.title, description: dataset.description,
        minTier: dataset.minTier, price: dataset.price, preview: dataset.preview,
        accessDenied: true, reason: dataset.reason,
      }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    return new Response(JSON.stringify(dataset), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=900' },
    });
  }

  // List catalog
  const catalog = await convexQuery('dataset-service:listDatasets', {});
  return new Response(JSON.stringify({ datasets: catalog || [] }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=600' },
  });
}
