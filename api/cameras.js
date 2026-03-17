import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { validateApiKey } from './_api-key.js';
import { checkRateLimit } from './_rate-limit.js';

export const config = { runtime: 'edge' };

const WINDY_API_BASE = 'https://api.windy.com/webcams/api/v3/webcams';

// In-memory edge cache — Vercel edge instances persist between requests.
// TTL: 5 minutes (webcam lists don't change often).
let cached = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/cameras?continent=EU&limit=50&offset=0
 *
 * Proxies the Windy Webcams API v3 with server-side caching.
 * Requires WINDY_API_KEY env var.
 */
export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const keyCheck = validateApiKey(req);
  if (keyCheck.required && !keyCheck.valid) {
    return new Response(JSON.stringify({ error: keyCheck.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const rateLimitResponse = await checkRateLimit(req, corsHeaders);
  if (rateLimitResponse) return rateLimitResponse;

  const apiKey = process.env.WINDY_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'WINDY_API_KEY not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const requestUrl = new URL(req.url);
  const continent = requestUrl.searchParams.get('continent') || '';
  const limit = Math.min(parseInt(requestUrl.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(requestUrl.searchParams.get('offset') || '0', 10);

  // Build cache key from query params
  const cacheKey = `${continent}:${limit}:${offset}`;

  // Check in-memory cache
  if (cached && cached.key === cacheKey && Date.now() - cachedAt < CACHE_TTL_MS) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120, stale-if-error=600',
        'X-Cache': 'HIT',
        ...corsHeaders,
      },
    });
  }

  try {
    // Build Windy API URL
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      include: 'location,images',
    });

    // Filter by continent if specified
    if (continent) {
      params.set('continent', continent);
    }

    // Only fetch active/live webcams
    params.set('status', 'active');

    const windyUrl = `${WINDY_API_BASE}?${params.toString()}`;

    const response = await fetch(windyUrl, {
      headers: {
        'x-windy-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[cameras] Windy API error:', response.status, errText);
      return new Response(JSON.stringify({
        error: 'Windy API error',
        status: response.status,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = await response.json();

    // Transform Windy response into our format
    const cameras = (data.webcams || []).map((cam) => ({
      id: String(cam.webcamId || cam.id),
      title: cam.title || '',
      status: cam.status || 'active',
      image: {
        current: cam.images?.current?.preview || cam.images?.current?.thumbnail || '',
        daylight: cam.images?.daylight?.preview || cam.images?.daylight?.thumbnail || '',
      },
      player: {
        day: `https://webcams.windy.com/webcams/public/embed/player/${cam.webcamId || cam.id}/day`,
        lifetime: `https://webcams.windy.com/webcams/public/embed/player/${cam.webcamId || cam.id}/lifetime`,
      },
      location: {
        city: cam.location?.city || '',
        region: cam.location?.region || '',
        country: cam.location?.country || '',
        countryCode: cam.location?.countryCode || '',
        continent: cam.location?.continent || '',
        continentCode: cam.location?.continentCode || '',
        latitude: cam.location?.latitude || 0,
        longitude: cam.location?.longitude || 0,
      },
      lastUpdatedOn: cam.lastUpdatedOn || null,
    }));

    const body = JSON.stringify({
      cameras,
      total: data.total || cameras.length,
      limit,
      offset,
      cached: false,
      timestamp: Date.now(),
    });

    // Update in-memory cache
    cached = { key: cacheKey, body };
    cachedAt = Date.now();

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120, stale-if-error=600',
        'X-Cache': 'MISS',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[cameras] Error:', error.message);
    return new Response(JSON.stringify({
      error: 'Failed to fetch cameras',
      details: error.message,
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
