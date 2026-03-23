import { escapeHtml } from '@/utils/sanitize';

interface FormatBriefOptions {
  headlineCount?: number;
  getCitationTitle?: (n: number) => string;
}

export function formatBriefRichText(text: string, options: FormatBriefOptions = {}): string {
  const { headlineCount = 0, getCitationTitle } = options;

  let html = escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');

  if (headlineCount > 0) {
    html = html.replace(/\[(\d{1,2})\]/g, (_match, numStr) => {
      const n = parseInt(numStr, 10);
      if (n < 1 || n > headlineCount) return `[${numStr}]`;

      const titleAttr = getCitationTitle ? ` title="${escapeHtml(getCitationTitle(n))}"` : '';
      return `<a href="#cb-news-${n}" class="cb-citation"${titleAttr}>[${n}]</a>`;
    });
  }

  return html;
}
