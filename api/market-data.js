import { getCorsHeaders } from './_cors.js';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (!FINNHUB_API_KEY) {
    return new Response(JSON.stringify({ error: 'Finnhub API key not configured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint');
  const symbol = url.searchParams.get('symbol');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!endpoint) {
    return new Response(JSON.stringify({ error: 'Missing endpoint parameter' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    let finnhubUrl;
    switch (endpoint) {
      case 'earnings-calendar':
        finnhubUrl = new URL('https://finnhub.io/api/v1/calendar/earnings');
        finnhubUrl.searchParams.set('symbol', symbol || '');
        finnhubUrl.searchParams.set('from', from || new Date().toISOString().split('T')[0]);
        finnhubUrl.searchParams.set('to', to || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
        break;

      case 'ipo-calendar':
        finnhubUrl = new URL('https://finnhub.io/api/v1/calendar/ipo');
        finnhubUrl.searchParams.set('from', from || new Date().toISOString().split('T')[0]);
        finnhubUrl.searchParams.set('to', to || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
        break;

      case 'insider-transactions':
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol is required for insider-transactions' }), {
            status: 400,
            headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }
        finnhubUrl = new URL('https://finnhub.io/api/v1/stock/insider-transactions');
        finnhubUrl.searchParams.set('symbol', symbol);
        break;

      case 'social-sentiment':
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol is required for social-sentiment' }), {
            status: 400,
            headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }
        finnhubUrl = new URL('https://finnhub.io/api/v1/stock/social-sentiment');
        finnhubUrl.searchParams.set('symbol', symbol);
        break;

      case 'recommendation-trends':
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol is required for recommendation-trends' }), {
            status: 400,
            headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }
        finnhubUrl = new URL('https://finnhub.io/api/v1/stock/recommendation');
        finnhubUrl.searchParams.set('symbol', symbol);
        break;

      case 'option-chain':
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol is required for option-chain' }), {
            status: 400,
            headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }
        finnhubUrl = new URL('https://finnhub.io/api/v1/stock/option-chain');
        finnhubUrl.searchParams.set('symbol', symbol);
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown endpoint: ${endpoint}` }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
    }

    finnhubUrl.searchParams.set('token', FINNHUB_API_KEY);

    const resp = await fetch(finnhubUrl.toString());
    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
