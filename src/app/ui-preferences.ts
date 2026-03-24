export type PanelDensity = 'compact' | 'comfortable';

export const UI_PREFERENCE_KEYS = {
  desktopOnboardingDismissed: 'wm-ui-desktop-onboarding-dismissed',
  mobileHelpDismissed: 'wm-ui-mobile-help-dismissed',
  panelDensity: 'wm-ui-panel-density',
  deckLayersOpen: 'wm-ui-deck-layers-open',
  deckLegendCollapsed: 'wm-ui-deck-legend-collapsed',
  svgLegendCollapsed: 'wm-ui-svg-legend-collapsed',
  svgLayersCollapsed: 'wm-ui-svg-layers-collapsed',
} as const;

function readBoolean(key: string, fallback = false): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function writeBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures.
  }
}

export function isDesktopOnboardingDismissed(): boolean {
  return readBoolean(UI_PREFERENCE_KEYS.desktopOnboardingDismissed, false);
}

export function setDesktopOnboardingDismissed(value: boolean): void {
  writeBoolean(UI_PREFERENCE_KEYS.desktopOnboardingDismissed, value);
}

export function isMobileHelpDismissed(): boolean {
  return readBoolean(UI_PREFERENCE_KEYS.mobileHelpDismissed, false);
}

export function setMobileHelpDismissed(value: boolean): void {
  writeBoolean(UI_PREFERENCE_KEYS.mobileHelpDismissed, value);
}

export function getPanelDensityPreference(): PanelDensity {
  try {
    return localStorage.getItem(UI_PREFERENCE_KEYS.panelDensity) === 'comfortable'
      ? 'comfortable'
      : 'compact';
  } catch {
    return 'compact';
  }
}

export function setPanelDensityPreference(value: PanelDensity): void {
  try {
    localStorage.setItem(UI_PREFERENCE_KEYS.panelDensity, value);
  } catch {
    // Ignore storage failures.
  }
}

export function getTrayOpenPreference(key: keyof typeof UI_PREFERENCE_KEYS, fallback = false): boolean {
  return readBoolean(UI_PREFERENCE_KEYS[key], fallback);
}

export function setTrayOpenPreference(key: keyof typeof UI_PREFERENCE_KEYS, value: boolean): void {
  writeBoolean(UI_PREFERENCE_KEYS[key], value);
}
