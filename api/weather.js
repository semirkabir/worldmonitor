import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { fetchWithTimeout } from './_relay.js';

export const config = { runtime: 'edge' };

const NWS_URL = 'https://api.weather.gov/alerts/active';

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

  try {
    const response = await fetchWithTimeout(NWS_URL, {
      headers: {
        'User-Agent': 'WorldMonitor/1.0 (worldmonitor.app)',
        'Accept': 'application/geo+json',
      },
    }, 15000);

    const body = await response.text();
    const isSuccess = response.status >= 200 && response.status < 300;

    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        // 30-minute CDN cache — NWS updates alerts on a similar cadence
        'Cache-Control': isSuccess
          ? 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600, stale-if-error=7200'
          : 'public, max-age=15, s-maxage=60',
        ...corsHeaders,
      },
    });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    console.error('[weather proxy] error:', error?.message);
    return new Response(JSON.stringify({
      error: isTimeout ? 'NWS timeout' : 'Failed to fetch weather alerts',
      details: error?.message,
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
