import { strict as assert } from 'node:assert';
import test from 'node:test';
import { formatBriefRichText } from '../src/components/country-brief-format';

test('formats brief text while escaping hostile markup', () => {
  const html = formatBriefRichText('**Alert**\n<script>alert(1)</script>');
  assert.match(html, /<strong>Alert<\/strong>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('converts only in-range citations into anchored references', () => {
  const html = formatBriefRichText('See [1], [2], and [9].', {
    headlineCount: 2,
    getCitationTitle: (n) => `Source ${n}`,
  });

  assert.match(html, /href="#cb-news-1"/);
  assert.match(html, /href="#cb-news-2"/);
  assert.match(html, /title="Source 1"/);
  assert.match(html, /\[9\]/);
});
