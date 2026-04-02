/**
 * Checkout API endpoint — redirects to Stripe for subscription upgrades.
 *
 * GET /api/checkout?tier=pro&uid=firebase_uid
 *
 * In production: creates a Stripe Checkout session and redirects.
 * Development: returns a JSON message about missing Stripe config.
 */
import { getCorsHeaders } from './_cors.js';

export const config = { runtime: 'edge' };

const TIER_PRICES = {
  pro: { amount: 900, label: 'Pro' },      // $9/mo
  business: { amount: 2900, label: 'Business' }, // $29/mo
  enterprise: { amount: 0, label: 'Enterprise' },
};

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors } });

  const url = new URL(req.url);
  const tier = url.searchParams.get('tier');
  const uid = url.searchParams.get('uid');

  if (!tier || !TIER_PRICES[tier]) {
    return new Response(JSON.stringify({ error: 'Invalid tier' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  if (tier === 'enterprise') {
    return Response.redirect('mailto:sales@worldmonitor.app?subject=Enterprise%20Inquiry', 302);
  }

  if (!uid) {
    return new Response(JSON.stringify({ error: 'Missing uid parameter' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // Stripe integration — when STRIPE_SECRET_KEY is configured, create a
  // checkout session and redirect.
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({
      message: 'Stripe not configured yet. This is a development placeholder.',
      tier, uid, price: TIER_PRICES[tier].amount / 100,
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // TODO: Create Stripe Checkout session when STRIPE_SECRET_KEY is set.
  // Example flow:
  //   1. Create Stripe session with line item for the tier
  //   2. Set metadata: { uid, tier }
  //   3. On success, Stripe webhook calls /api/stripe-webhook
  //      which upgrades the user's tier in Redis + Convex
  //   4. Redirect user to Stripe checkout URL
  return new Response(JSON.stringify({
    message: 'Stripe checkout flow not yet implemented.',
    tier, uid,
    next_step: 'Configure STRIPE_SECRET_KEY and implement checkout session creation.',
  }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
}
