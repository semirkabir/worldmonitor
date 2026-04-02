/**
 * Fetch interceptor that attaches the current user's Firebase ID token
 * to all outgoing /api/ requests.
 *
 * Runs in both browser and desktop (Tauri).  When the user is signed in
 * with Google, the server gateway can detect their tier (free/paid) and
 * apply per-tier rate limits + cache strategies.  Unsigned requests fall
 * into the anonymous tier automatically.
 */

import { getIdToken, isFirebaseConfigured } from './firebase-auth';

/** Token cache — avoid calling getIdToken() on every single request while
 * the ID token hasn't expired (Firebase ID tokens last ~1 hour). */
let cachedToken: string | null = null;
let tokenExpiryMs = 0;

async function getIdTokenCached(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiryMs) return cachedToken;
  const token = await getIdToken();
  cachedToken = token;
  // Firebase ID tokens last ~3600s; cache for 50 min to be safe.
  tokenExpiryMs = Date.now() + 3_000_000;
  return token;
}

const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // Determine target URL.
  let urlString = '';
  if (typeof input === 'string') {
    urlString = input;
  } else if (input instanceof URL) {
    urlString = input.toString();
  } else if (input instanceof Request) {
    urlString = input.url;
  }

  // Only intercept /api/ requests — leave external fetch calls alone.
  const isApiCall = urlString.startsWith('/api/') || urlString.startsWith(window.location.origin + '/api/');

  if (!isApiCall || !isFirebaseConfigured()) {
    return originalFetch(input, init);
  }

  try {
    const token = await getIdTokenCached();

    if (token) {
      const headers = new Headers(init?.headers || {});
      headers.set('x-worldmonitor-token', token);
      return originalFetch(input, { ...init, headers });
    }
  } catch {
    // Token fetch failed — proceed without token so the request still goes through.
  }

  return originalFetch(input, init);
};
