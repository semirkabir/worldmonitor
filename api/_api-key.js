const DESKTOP_ORIGIN_PATTERNS = [
  /^https?:\/\/tauri\.localhost(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.tauri\.localhost(:\d+)?$/i,
  /^tauri:\/\/localhost$/,
  /^asset:\/\/localhost$/,
];

const BROWSER_ORIGIN_PATTERNS = [
  /^https:\/\/(.*\.)?worldmonitor\.app$/,
  /^https:\/\/worldmonitor-[a-z0-9-]+-elie-[a-z0-9]+\.vercel\.app$/,
  ...(process.env.NODE_ENV === 'production' ? [] : [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  ]),
];

function isDesktopOrigin(origin) {
  return Boolean(origin) && DESKTOP_ORIGIN_PATTERNS.some(p => p.test(origin));
}

function isTrustedBrowserOrigin(origin) {
  return Boolean(origin) && BROWSER_ORIGIN_PATTERNS.some(p => p.test(origin));
}

function extractOriginFromReferer(referer) {
  if (!referer) return '';
  try {
    return new URL(referer).origin;
  } catch {
    return '';
  }
}

/**
 * API key validation used for:
 *  1. Desktop app — now treated identically to browser.  Users get tier-
 *     based access via Firebase auth (anonymous → signed-in → paid).
 *  2. Trusted browser origins (worldmonitor.app, Vercel previews,
 *     localhost) — no key needed at all.
 *  3. Unknown origins — require a valid X-WorldMonitor-Key header.
 *
 * Per-tier rate limiting is handled by the gateway via auth-tier.ts.
 */
export function validateApiKey(req) {
  const key = req.headers.get('X-WorldMonitor-Key');
  // Same-origin requests don't send Origin (per CORS spec).
  // Fall back to Referer to identify trusted same-origin callers.
  const origin = req.headers.get('Origin') || extractOriginFromReferer(req.headers.get('Referer')) || '';

  // Desktop + browser: treated the same.  The gateway's auth-tier system
  // handles per-user rate limits via Firebase token (if present) or IP.
  if (isTrustedBrowserOrigin(origin) || isDesktopOrigin(origin)) {
    if (key) {
      const validKeys = (process.env.WORLDMONITOR_VALID_KEYS || '').split(',').filter(Boolean);
      if (!validKeys.includes(key)) return { valid: false, required: true, error: 'Invalid API key' };
    }
    return { valid: true, required: false };
  }

  // Explicit key provided from unknown origin — validate it
  if (key) {
    const validKeys = (process.env.WORLDMONITOR_VALID_KEYS || '').split(',').filter(Boolean);
    if (!validKeys.includes(key)) return { valid: false, required: true, error: 'Invalid API key' };
    return { valid: true, required: true };
  }

  // No origin, no key — require API key (blocks unauthenticated curl/scripts)
  return { valid: false, required: true, error: 'API key required' };
}
