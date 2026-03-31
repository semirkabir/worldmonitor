import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { fetchWithTimeout } from './_relay.js';

export const config = { runtime: 'edge' };

const BASE = 'https://api.planespotters.net/pub/photos';

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

  const { searchParams } = new URL(req.url);
  const reg = searchParams.get('reg');
  const hex = searchParams.get('hex');

  if (!reg && !hex) {
    return new Response(JSON.stringify({ error: 'Missing reg or hex parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Validate: only alphanumeric + hyphen, max 10 chars
  const lookup = reg || hex;
  if (!/^[A-Za-z0-9-]{1,10}$/.test(lookup)) {
    return new Response(JSON.stringify({ error: 'Invalid parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const path = reg
    ? `/reg/${encodeURIComponent(reg.toUpperCase())}`
    : `/hex/${encodeURIComponent(hex.toLowerCase())}`;

  try {
    const response = await fetchWithTimeout(`${BASE}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'WorldMonitor/1.0' },
    }, 10000);

    const body = await response.text();
    const isSuccess = response.status >= 200 && response.status < 300;

    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        // Aircraft photos rarely change — cache for 24 hours
        'Cache-Control': isSuccess
          ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=172800, stale-if-error=604800'
          : 'public, max-age=15, s-maxage=60',
        ...corsHeaders,
      },
    });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return new Response(JSON.stringify({
      error: isTimeout ? 'Planespotters timeout' : 'Failed to fetch aircraft photo',
      details: error?.message,
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
