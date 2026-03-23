import { strict as assert } from 'node:assert';
import test from 'node:test';
import handler from './register-interest.js';

function makeRequest(body, options = {}) {
  return new Request('https://worldmonitor.app/api/register-interest', {
    method: options.method || 'POST',
    headers: {
      'Content-Type': options.contentType || 'application/json',
      origin: options.origin || 'https://worldmonitor.app',
      ...(options.headers || {}),
    },
    body,
  });
}

test('rejects invalid JSON bodies', async () => {
  const response = await handler(makeRequest('{bad-json'));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid JSON' });
});

test('rejects invalid email addresses before backend calls', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });

  try {
    const response = await handler(makeRequest(JSON.stringify({
      email: 'not-an-email',
      turnstileToken: 'ok',
    })));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid email address' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns 503 when convex registration service is unavailable', async () => {
  const originalConvexUrl = process.env.CONVEX_URL;
  const originalFetch = globalThis.fetch;
  delete process.env.CONVEX_URL;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });

  try {
    const response = await handler(makeRequest(JSON.stringify({
      email: 'user@example.com',
      turnstileToken: 'ok',
    })));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Registration service unavailable' });
  } finally {
    process.env.CONVEX_URL = originalConvexUrl;
    globalThis.fetch = originalFetch;
  }
});
