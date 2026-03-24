import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  getPanelDensityPreference,
  getTrayOpenPreference,
  isDesktopOnboardingDismissed,
  isMobileHelpDismissed,
  setDesktopOnboardingDismissed,
  setMobileHelpDismissed,
  setPanelDensityPreference,
  setTrayOpenPreference,
} from '../src/app/ui-preferences';

function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return store;
}

test('panel density defaults to compact and persists comfortable mode', () => {
  installStorage();
  assert.equal(getPanelDensityPreference(), 'compact');
  setPanelDensityPreference('comfortable');
  assert.equal(getPanelDensityPreference(), 'comfortable');
});

test('onboarding and mobile help dismissal preferences persist', () => {
  installStorage();
  assert.equal(isDesktopOnboardingDismissed(), false);
  assert.equal(isMobileHelpDismissed(), false);
  setDesktopOnboardingDismissed(true);
  setMobileHelpDismissed(true);
  assert.equal(isDesktopOnboardingDismissed(), true);
  assert.equal(isMobileHelpDismissed(), true);
});

test('tray preferences round-trip boolean state', () => {
  installStorage();
  assert.equal(getTrayOpenPreference('deckLegendCollapsed', false), false);
  setTrayOpenPreference('deckLegendCollapsed', true);
  assert.equal(getTrayOpenPreference('deckLegendCollapsed', false), true);
});
