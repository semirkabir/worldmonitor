import { strict as assert } from 'node:assert';
import test from 'node:test';
import handler from './download.js';

function makeRequest(query = '') {
  return new Request(`https://worldmonitor.app/api/download${query}`);
}

test('redirects to releases page when platform is missing or invalid', async () => {
  const missing = await handler(makeRequest());
  assert.equal(missing.status, 302);
  assert.equal(missing.headers.get('location'), 'https://github.com/koala73/worldmonitor/releases/latest');

  const invalid = await handler(makeRequest('?platform=unknown'));
  assert.equal(invalid.status, 302);
  assert.equal(invalid.headers.get('location'), 'https://github.com/koala73/worldmonitor/releases/latest');
});

test('redirects to matching release asset for requested platform and variant', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    assets: [
      { name: 'WorldMonitor_1.0.0_x64-setup.exe', browser_download_url: 'https://example.com/full.exe' },
      { name: 'FinanceMonitor_1.0.0_x64-setup.exe', browser_download_url: 'https://example.com/finance.exe' },
    ],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    const response = await handler(makeRequest('?platform=windows-exe&variant=finance'));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://example.com/finance.exe');
    assert.match(response.headers.get('cache-control') || '', /stale-while-revalidate/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('falls back to releases page when upstream returns no matching asset', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ assets: [] }), { status: 200 });

  try {
    const response = await handler(makeRequest('?platform=linux-appimage&variant=finance'));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://github.com/koala73/worldmonitor/releases/latest');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
