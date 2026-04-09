import { getCorsHeaders } from '../_cors.js';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';

// Map Finnhub impact strings to our schema
function mapImpact(impact) {
  if (!impact) return 'low';
  const lower = String(impact).toLowerCase();
  if (lower === 'high' || lower === '3') return 'high';
  if (lower === 'medium' || lower === 'moderate' || lower === '2') return 'medium';
  return 'low';
}

// Map Finnhub event names/units to a category
function mapCategory(event) {
  if (!event) return 'other';
  const lower = event.toLowerCase();
  if (/central bank|fed |fomc|ecb|boe|boj|boc|rba|pbc|rate decision|interest rate|monetary policy/.test(lower)) return 'central-bank';
  if (/cpi|pce|inflation|price index/.test(lower)) return 'inflation';
  if (/employment|jobless|payroll|unemployment|labor|labour|jobs/.test(lower)) return 'employment';
  if (/gdp|gross domestic/.test(lower)) return 'gdp';
  if (/trade|export|import|balance of payment|current account/.test(lower)) return 'trade';
  return 'other';
}

export default async function handler(req) {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // If no Finnhub key, return empty — panel falls back to seed data
  if (!FINNHUB_API_KEY) {
    return new Response(JSON.stringify({ events: [] }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from') || new Date().toISOString().split('T')[0];
  const to = url.searchParams.get('to') || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  try {
    const finnhubUrl = new URL('https://finnhub.io/api/v1/economic-calendar');
    finnhubUrl.searchParams.set('from', from);
    finnhubUrl.searchParams.set('to', to);
    finnhubUrl.searchParams.set('token', FINNHUB_API_KEY);

    const resp = await fetch(finnhubUrl.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    const raw = data.economicCalendar || data.data || [];

    const events = raw
      .filter(ev => ev && ev.event)
      .map(ev => ({
        date: ev.time || ev.date || new Date().toISOString(),
        country: ev.country || '',
        countryCode: (ev.country || '').slice(0, 2).toUpperCase(),
        event: ev.event || '',
        impact: mapImpact(ev.impact),
        actual: ev.actual != null ? String(ev.actual) : null,
        forecast: ev.estimate != null ? String(ev.estimate) : null,
        previous: ev.prev != null ? String(ev.prev) : null,
        category: mapCategory(ev.event),
      }));

    return new Response(JSON.stringify({ events }), {
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' },
    });
  } catch {
    return new Response(JSON.stringify({ events: [] }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
