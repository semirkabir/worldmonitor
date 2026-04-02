/**
 * Inline $TICKER linkification for news text.
 * Replaces recognized $SYMBOL patterns with clickable spans.
 * MUST be called AFTER escapeHtml() — operates on already-safe HTML.
 */
import { lookupEntityByAlias } from '@/services/entity-index';

const TICKER_REGEX = /\$([A-Z]{1,5})\b/g;

/**
 * Replace $TICKER patterns in escaped HTML with clickable spans.
 * Only recognized tickers (companies/indices in ENTITY_REGISTRY) are linkified.
 */
export function linkifyTickers(escapedHtml: string): string {
  return escapedHtml.replace(TICKER_REGEX, (_match, symbol: string) => {
    const entity = lookupEntityByAlias(symbol);
    if (!entity || (entity.type !== 'company' && entity.type !== 'index')) {
      return _match; // not a recognized ticker, leave as-is
    }
    return `<span class="ticker-link" data-ticker="${symbol}" data-name="${entity.name}" role="button" tabindex="0">$${symbol}</span>`;
  });
}
