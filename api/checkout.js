/**
 * Checkout API endpoint — creates Stripe session for subscription upgrades.
 *
 * POST /api/checkout  (JSON body: { tier, uid, returnUrl })
 * GET  /api/checkout?tier=pro&uid=firebase_uid  (legacy redirect)
 *
 * Creates a Stripe Checkout session and returns the redirect URL.
 * Requires STRIPE_SECRET_KEY environment variable.
 */
import { getCorsHeaders } from './_cors.js';

export const config = { runtime: 'edge' };

const TIER_PRICES = {
  pro: { amount: 900, label: 'Pro' },
  business: { amount: 2900, label: 'Business' },
  enterprise: { amount: 0, label: 'Enterprise' },
};

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors } });

  let tier, uid, returnUrl;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    tier = url.searchParams.get('tier');
    uid = url.searchParams.get('uid');
    returnUrl = url.searchParams.get('return_url') || window?.location?.origin || 'https://worldmonitor.app';
  } else {
    const body = await req.json();
    tier = body.tier;
    uid = body.uid;
    returnUrl = body.returnUrl || 'https://worldmonitor.app';
  }

  if (!tier || !TIER_PRICES[tier]) {
    return new Response(JSON.stringify({ error: 'Invalid tier' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  if (tier === 'enterprise') {
    return Response.redirect('mailto:sales@worldmonitor.app?subject=Enterprise%20Inquiry', 302);
  }

  if (!uid) {
    return new Response(JSON.stringify({ error: 'Missing uid parameter' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({
      message: 'Stripe not configured. Use STRIPE_SECRET_KEY env var.',
      tier, uid, price: TIER_PRICES[tier].amount / 100,
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // Create Stripe Checkout session
  try {
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'subscription',
        payment_method_types: 'card',
        success_url: `${returnUrl}/?checkout=success&tier=${tier}`,
        cancel_url: `${returnUrl}/?checkout=cancelled`,
        metadata: JSON.stringify({ uid, tier }),
        client_reference_id: uid,
        line_items: JSON.stringify([{
          price_data: {
            currency: 'usd',
            unit_amount: TIER_PRICES[tier].amount,
            recurring: { interval: 'month' },
            product_data: { name: `World Monitor ${TIER_PRICES[tier].label}` },
          },
          quantity: 1,
        }]),
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      return new Response(JSON.stringify({ error: 'Stripe API error', details: error }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const session = await resp.json();
    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Checkout failed', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
}
