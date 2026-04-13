import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { validateApiKey } from './_api-key.js';
import { checkRateLimit } from './_rate-limit.js';
import { redisGet, redisSet } from './_redis.js';

export const config = { runtime: 'edge' };

const ARTICLE_CACHE_TTL = 900; // 15 minutes
const NEGATIVE_CACHE_TTL = 120; // 2 minutes for failed fetches

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// DOMParser polyfill for Node.js environment
let DOMParser, TurndownService;
try {
  DOMParser = globalThis.DOMParser || (await import('linkedom')).DOMParser;
} catch {
  try {
    const { DOMParser: dp } = await import('linkedom');
    DOMParser = dp;
  } catch {
    // Fallback - will throw error if used
  }
}

async function getTurndown() {
  if (TurndownService) return new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  try {
    const td = (await import('turndown')).default;
    TurndownService = td;
    return new td({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  } catch {
    return null;
  }
}

/**
 * Minimal readability-like extraction that works in edge runtime.
 * @mozilla/readability requires JSDOM which is too heavy for edge functions.
 * This extracts article content using DOMParser (available in edge runtime).
 */
function extractArticle(html, baseUrl) {
  if (!DOMParser) {
    throw new Error('DOMParser not available');
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Fix relative URLs
  const base = doc.createElement('base');
  base.href = baseUrl;
  doc.head.prepend(base);

  // Remove unwanted elements
  const removeSelectors = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    '.sidebar', '.ad', '.advertisement', '.social-share', '.share-buttons',
    '.comments', '.related', '.newsletter', '.subscription', '.popup',
    '.cookie', '.banner', '.promo', '.sponsored', '.outbrain', '.taboola',
    '#comments', '#sidebar', '#nav', '#header', '#footer',
    '[role="navigation"]', '[role="complementary"]', '[role="banner"]',
    '[class*="social-"]', '[class*="share-"]', '[class*="ad-"]',
    '[class*="newsletter"]', '[class*="subscribe"]', '[class*="popup"]',
    '[class*="cookie"]', '[class*="banner"]', '[class*="promo"]',
  ];
  removeSelectors.forEach(sel => {
    try {
      doc.querySelectorAll(sel).forEach(el => el.remove());
    } catch { /* ignore invalid selectors */ }
  });

  // Try to find article content
  let articleContent = null;
  const articleSelectors = [
    'article',
    '[role="article"]',
    '.article-body',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.story-body',
    '.story-content',
    '.article__body',
    '.content__article-body',
    '#article-body',
    '.articleText',
    '.article-body-text',
    '.post-body',
    '.entry',
    '.content',
    'main',
    '[role="main"]',
    '.article',
    '.post',
    '.story',
    '.entry-text',
    '.article-copy',
    '.article-text',
    '.post-text',
    '.story-text',
    '#content',
    '.content-body',
    '.article-wrapper',
    '.post-wrapper',
    '.story-content-wrapper',
    '[data-component="article-body"]',
    '[data-content="article"]',
    '.article__content',
    '.article-body__content',
    '.story__body',
    '.entry__content',
    '.post__content',
    '.article_main',
    '.article_detail',
  ];

  for (const selector of articleSelectors) {
    const el = doc.querySelector(selector);
    if (el && el.innerHTML.length > 200) {
      articleContent = el;
      break;
    }
  }

  // Fallback: use body if no article element found
  if (!articleContent) {
    articleContent = doc.body;
  }

  // If still not enough content, try to find any element with substantial text
  if (!articleContent || articleContent.innerHTML.length < 100) {
    const paragraphs = doc.querySelectorAll('p');
    let combinedContent = '';
    for (const p of paragraphs) {
      if (p.textContent.trim().length > 50) {
        combinedContent += `<p>${p.innerHTML}</p>`;
      }
    }
    if (combinedContent.length > 100) {
      const wrapper = doc.createElement('div');
      wrapper.innerHTML = combinedContent;
      articleContent = wrapper;
    }
  }

  // Extract metadata
  const title = doc.querySelector('meta[property="og:title"]')?.content
    || doc.querySelector('meta[name="title"]')?.content
    || doc.querySelector('h1')?.textContent
    || '';

  const byline = doc.querySelector('[class*="author"]')?.textContent?.trim()
    || doc.querySelector('[class*="byline"]')?.textContent?.trim()
    || '';

  const imageUrl = doc.querySelector('meta[property="og:image"]')?.content
    || doc.querySelector('meta[name="twitter:image"]')?.content
    || articleContent?.querySelector('img')?.src
    || '';

  // Clean up the content
  if (articleContent) {
    // Remove empty paragraphs
    articleContent.querySelectorAll('p').forEach(p => {
      if (!p.textContent.trim()) p.remove();
    });

    // Ensure images have proper src
    articleContent.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        try {
          img.src = new URL(src, baseUrl).href;
        } catch { /* ignore invalid URLs */ }
      }
      // Remove tiny tracking pixels
      const width = parseInt(img.getAttribute('width') || '0');
      const height = parseInt(img.getAttribute('height') || '0');
      if ((width > 0 && width < 50) || (height > 0 && height < 50)) {
        img.remove();
      }
    });

    // Make links open in new tab
    articleContent.querySelectorAll('a').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  }

  return {
    title: title.trim(),
    byline: byline.trim(),
    content: articleContent?.innerHTML || '',
    imageUrl: imageUrl || '',
  };
}

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, POST, OPTIONS');

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const keyCheck = validateApiKey(req);
  if (keyCheck.required && !keyCheck.valid) {
    return new Response(JSON.stringify({ error: keyCheck.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const rateLimitResponse = await checkRateLimit(req, corsHeaders);
  if (rateLimitResponse) return rateLimitResponse;

  // Extract URL from query params (GET) or body (POST)
  let articleUrl;
  let outputFormat = 'html'; // default
  if (req.method === 'GET') {
    const requestUrl = new URL(req.url);
    articleUrl = requestUrl.searchParams.get('url');
    outputFormat = requestUrl.searchParams.get('format') || 'html';
  } else {
    try {
      const body = await req.json();
      articleUrl = body.url;
      outputFormat = body.format || 'html';
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  }

  // Validate format
  if (!['html', 'markdown'].includes(outputFormat)) {
    return new Response(JSON.stringify({ error: 'Invalid format: use html or markdown' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!articleUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Validate URL
  try {
    new URL(articleUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Check Redis cache
  const cacheKey = `article:v1:${articleUrl}`;
  try {
    const cached = await redisGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed === '__NEG__') {
        return new Response(JSON.stringify({ error: 'Failed to fetch article', cached: true }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT', ...corsHeaders },
        });
      }
      return new Response(JSON.stringify({ ...parsed, cached: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT', ...corsHeaders },
      });
    }
  } catch { /* Redis unavailable, proceed with fetch */ }

  // Fetch article HTML
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(articleUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': CHROME_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorResult = { error: `HTTP ${response.status}` };
      try { await redisSet(cacheKey, JSON.stringify('__NEG__'), NEGATIVE_CACHE_TTL); } catch { /* ignore */ }
      return new Response(JSON.stringify(errorResult), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS', ...corsHeaders },
      });
    }

    const html = await response.text();
    const article = extractArticle(html, articleUrl);

    if (!article.content || article.content.length < 100) {
      try { await redisSet(cacheKey, JSON.stringify('__NEG__'), NEGATIVE_CACHE_TTL); } catch { /* ignore */ }
      return new Response(JSON.stringify({ error: 'Could not extract article content', url: articleUrl }), {
        status: 422,
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS', ...corsHeaders },
      });
    }

    // Convert to markdown if requested
    let markdownContent = null;
    if (outputFormat === 'markdown') {
      const turndown = await getTurndown();
      if (turndown) {
        markdownContent = turndown.turndown(article.content);
      }
    }

    // Cache the result (both HTML and markdown)
    const cacheData = {
      title: article.title,
      byline: article.byline,
      content: article.content,
      markdown: markdownContent,
      imageUrl: article.imageUrl,
      url: articleUrl,
    };
    try { await redisSet(cacheKey, JSON.stringify(cacheData), ARTICLE_CACHE_TTL); } catch { /* ignore */ }

    // Return the requested format
    const responseData = {
      title: article.title,
      byline: article.byline,
      content: outputFormat === 'markdown' && markdownContent ? markdownContent : article.content,
      imageUrl: article.imageUrl,
      url: articleUrl,
      format: outputFormat,
    };

    return new Response(JSON.stringify({ ...responseData, cached: false }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=60, s-maxage=900, stale-while-revalidate=1800',
        ...corsHeaders,
      },
    });
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    console.error('[fetch-article] Error:', articleUrl, error.message);

    // Cache the failure briefly
    try {
      await redisSet(cacheKey, JSON.stringify('__NEG__'), NEGATIVE_CACHE_TTL);
    } catch { /* ignore cache write failures */ }

    return new Response(JSON.stringify({
      error: isTimeout ? 'Article fetch timeout' : 'Failed to fetch article',
      url: articleUrl,
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
