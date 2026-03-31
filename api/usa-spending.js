import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { fetchWithTimeout } from './_relay.js';

export const config = { runtime: 'edge' };

const API_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

// Input validation bounds (mirrored from client)
const MAX_DAYS_BACK = 90;
const MIN_DAYS_BACK = 1;
const MAX_LIMIT = 50;
const MIN_LIMIT = 1;

const ALLOWED_AWARD_TYPES = new Set(['A', 'B', 'C', 'D', '02', '03', '04', '05', '06', '10', '07', '08']);

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.floor(Number(val) || min)));
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

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
  const daysBack = clamp(searchParams.get('daysBack') ?? 7, MIN_DAYS_BACK, MAX_DAYS_BACK);
  const limit = clamp(searchParams.get('limit') ?? 15, MIN_LIMIT, MAX_LIMIT);

  // Parse + sanitize award type codes from query string
  const rawTypes = (searchParams.get('awardTypes') || 'A,B,C,D').split(',');
  const awardTypeCodes = rawTypes
    .map(t => t.trim().toUpperCase())
    .filter(t => ALLOWED_AWARD_TYPES.has(t));

  if (awardTypeCodes.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid award type codes provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const periodStart = getDateDaysAgo(daysBack);
  const periodEnd = new Date().toISOString().split('T')[0];

  const body = JSON.stringify({
    filters: {
      time_period: [{ start_date: periodStart, end_date: periodEnd }],
      award_type_codes: awardTypeCodes,
    },
    fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Description', 'Start Date', 'Award Type'],
    limit,
    order: 'desc',
    sort: 'Award Amount',
  });

  try {
    const response = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    }, 25000);

    const responseBody = await response.text();
    const isSuccess = response.status >= 200 && response.status < 300;

    return new Response(responseBody, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        // Government spending data doesn't change by the minute — 1-hour CDN cache
        'Cache-Control': isSuccess
          ? 'public, max-age=600, s-maxage=3600, stale-while-revalidate=7200, stale-if-error=86400'
          : 'public, max-age=15, s-maxage=60',
        ...corsHeaders,
      },
    });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    console.error('[usa-spending proxy] error:', error?.message);
    return new Response(JSON.stringify({
      error: isTimeout ? 'USASpending timeout' : 'Failed to fetch spending data',
      details: error?.message,
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
