# CSS Filter Approximations for Stadia Themes

## Overview
Add CSS filter-based theme options that approximate Stadia's visual styles using free tile sources (OpenFreeMap/CARTO) as the base, with CSS filters applied on top. Zero cost, no API keys required.

---

## File: `src/config/basemap.ts`

### Change 1: Extend `CUSTOM_THEME_FILTERS` (line ~330)

Replace:
```ts
/** CSS filter to apply to the MapLibre canvas for 'custom:matrix'. */
export const CUSTOM_THEME_FILTERS: Partial<Record<string, string>> = {
  'custom:matrix': 'saturate(0) sepia(1) hue-rotate(80deg) saturate(4) brightness(0.55)',
};
```

With:
```ts
/** CSS filter to apply to the MapLibre canvas for custom themes. */
export const CUSTOM_THEME_FILTERS: Partial<Record<string, string>> = {
  'custom:matrix': 'saturate(0) sepia(1) hue-rotate(80deg) saturate(4) brightness(0.55)',
  'custom:smooth_dark': 'brightness(0.85) contrast(1.05) saturate(0.7)',
  'custom:toner': 'grayscale(1) contrast(1.3) brightness(0.9)',
  'custom:toner_lite': 'grayscale(1) contrast(1.15) brightness(1.05)',
  'custom:smooth_light': 'brightness(1.05) saturate(0.85) contrast(0.95)',
  'custom:outdoors_approx': 'saturate(1.2) hue-rotate(10deg) brightness(1.02)',
  'custom:watercolor_approx': 'saturate(1.4) contrast(0.9) brightness(1.05)',
};

/** Which base tile source each custom theme should use. */
const CUSTOM_THEME_BASE: Partial<Record<string, { provider: MapProvider; theme: string }>> = {
  'custom:smooth_dark': { provider: 'openfreemap', theme: 'dark' },
  'custom:toner': { provider: 'carto', theme: 'dark-matter' },
  'carto:dark-matter': { provider: 'carto', theme: 'dark-matter' },
  'custom:toner_lite': { provider: 'carto', theme: 'positron' },
  'custom:smooth_light': { provider: 'openfreemap', theme: 'positron' },
  'custom:outdoors_approx': { provider: 'carto', theme: 'voyager' },
  'custom:watercolor_approx': { provider: 'carto', theme: 'voyager' },
};
```

### Change 2: Add custom themes to `buildUnifiedOptions()` (line ~86)

After the existing `{ value: 'custom:matrix', ... }` entry, add:
```ts
    { value: 'custom:smooth_dark',       label: 'Smooth Dark (free)',     group: 'Dark',      provider: 'custom', theme: 'smooth_dark' },
    { value: 'custom:toner',             label: 'Toner B&W (free)',       group: 'Dark',      provider: 'custom', theme: 'toner' },
    { value: 'custom:smooth_light',      label: 'Smooth Light (free)',    group: 'Light',     provider: 'custom', theme: 'smooth_light' },
    { value: 'custom:toner_lite',        label: 'Toner Lite (free)',      group: 'Light',     provider: 'custom', theme: 'toner_lite' },
    { value: 'custom:outdoors_approx',   label: 'Outdoors (free)',        group: 'Nature',    provider: 'custom', theme: 'outdoors_approx' },
    { value: 'custom:watercolor_approx', label: 'Watercolor (free)',      group: 'Nature',    provider: 'custom', theme: 'watercolor_approx' },
```

### Change 3: Update `LIGHT_MAP_THEMES` (line ~213)

Add the light-approximating custom themes:
```ts
const LIGHT_MAP_THEMES = new Set<MapTheme>([
  'light', 'white', 'positron', 'voyager',
  'alidade_smooth', 'outdoors', 'osm_bright',
  'stamen_toner_lite', 'stamen_terrain', 'stamen_watercolor',
  'smooth_light', 'toner_lite', 'outdoors_approx', 'watercolor_approx',
]);
```

### Change 4: Update `getStyleForProvider()` (line ~334)

Add a case for `'custom'` that resolves the base tile source:
```ts
    case 'custom': {
      const base = CUSTOM_THEME_FILTERS[`${provider}:${mapTheme}`]
        ? CUSTOM_THEME_BASE[`${provider}:${mapTheme}`]
        : undefined;
      if (base) {
        return getStyleForProvider(base.provider, base.theme);
      }
      return FALLBACK_DARK_STYLE;
    }
```

---

## No changes needed in other files

- `src/components/DeckGLMap.ts` — `applyCanvasFilter()` already reads `CUSTOM_THEME_FILTERS[getUnifiedTheme()]` and applies to canvas. Works automatically.
- `src/services/preferences-content.ts` — The settings dropdown uses `UNIFIED_THEME_OPTIONS` which will include the new entries.

---

## Filter Mapping Summary

| Custom Theme Key | Label in UI | Base Tiles | CSS Filter | Approximates |
|---|---|---|---|---|
| `custom:smooth_dark` | Smooth Dark (free) | OpenFreeMap dark | `brightness(0.85) contrast(1.05) saturate(0.7)` | alidade_smooth_dark |
| `custom:toner` | Toner B&W (free) | CARTO dark-matter | `grayscale(1) contrast(1.3) brightness(0.9)` | stamen_toner |
| `custom:toner_lite` | Toner Lite (free) | CARTO positron | `grayscale(1) contrast(1.15) brightness(1.05)` | stamen_toner_lite |
| `custom:smooth_light` | Smooth Light (free) | OpenFreeMap positron | `brightness(1.05) saturate(0.85) contrast(0.95)` | alidade_smooth |
| `custom:outdoors_approx` | Outdoors (free) | CARTO voyager | `saturate(1.2) hue-rotate(10deg) brightness(1.02)` | outdoors |
| `custom:watercolor_approx` | Watercolor (free) | CARTO voyager | `saturate(1.4) contrast(0.9) brightness(1.05)` | stamen_watercolor |

---

## Verification

After implementation, run:
```
npm run typecheck
```
