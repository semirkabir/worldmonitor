import { strict as assert } from 'node:assert';
import test from 'node:test';
import { describeCommandAction, getQuickActionCommandIds, getSearchResultActionLabel } from '../src/components/search-ux';

test('describeCommandAction returns targeted descriptions for command families', () => {
  assert.equal(
    describeCommandAction({ id: 'nav:global', keywords: [], label: '', icon: '', category: 'navigate' }),
    'Refocus the map on this region',
  );
  assert.equal(
    describeCommandAction({ id: 'panel:markets', keywords: [], label: '', icon: '', category: 'panels' }),
    'Jump to this panel',
  );
  assert.equal(
    describeCommandAction({ id: 'view:settings', keywords: [], label: '', icon: '', category: 'view' }),
    'Change the current view',
  );
});

test('getSearchResultActionLabel returns explicit action-oriented copy', () => {
  assert.equal(getSearchResultActionLabel('country'), 'Open country briefing');
  assert.equal(getSearchResultActionLabel('cable'), 'Open cable on the map');
  assert.equal(getSearchResultActionLabel('financialcenter'), 'Inspect financial hub');
});

test('getQuickActionCommandIds provides variant-specific quick actions', () => {
  assert.deepEqual(
    getQuickActionCommandIds('finance'),
    ['nav:global', 'panel:markets', 'layers:finance', 'time:24h', 'view:fullscreen', 'view:settings'],
  );
  assert.deepEqual(
    getQuickActionCommandIds('tech'),
    ['nav:global', 'panel:tech', 'layers:infra', 'time:24h', 'view:fullscreen', 'view:settings'],
  );
});
