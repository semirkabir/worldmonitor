import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';

type Option<T extends string> = {
  value: T;
  label: string;
};

export type PmtilesTheme = 'black' | 'dark' | 'grayscale' | 'light' | 'white';
export type OpenFreeMapTheme = 'dark' | 'positron';
export type CartoTheme = 'dark-matter' | 'voyager' | 'positron';
export type CustomTheme = 'smooth_dark' | 'toner' | 'smooth_light' | 'toner_lite' | 'outdoors_approx' | 'watercolor_approx' | 'dark';
export type MapTheme = PmtilesTheme | OpenFreeMapTheme | CartoTheme | CustomTheme;
export type MapProvider = 'pmtiles' | 'auto' | 'openfreemap' | 'carto' | 'custom';

const PMTILES_URL = (import.meta.env.VITE_PMTILES_URL ?? '').trim();
const HAS_PMTILES_URL = PMTILES_URL.length > 0;

const MAP_PROVIDER_STORAGE_KEY = 'wm-map-provider';
const MAP_THEME_STORAGE_PREFIX = 'wm-map-theme:';
const UNIFIED_THEME_STORAGE_KEY = 'wm-map-unified-theme';

export const FALLBACK_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
export const FALLBACK_LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';

const PMTILES_THEME_OPTIONS: Option<PmtilesTheme>[] = [
  { value: 'black', label: 'Black (deepest dark)' },
  { value: 'dark', label: 'Dark' },
  { value: 'grayscale', label: 'Grayscale' },
  { value: 'light', label: 'Light' },
  { value: 'white', label: 'White' },
];

export interface UnifiedThemeOption {
  value: string;
  label: string;
  group: string;
  provider: MapProvider;
  theme: string;
}

function buildUnifiedOptions(): UnifiedThemeOption[] {
  const opts: UnifiedThemeOption[] = [
    // ── Dark ──
    { value: 'carto:dark-matter',          label: 'Carto Dark Matter', group: 'Dark',      provider: 'carto',       theme: 'dark-matter' },
    { value: 'openfreemap:dark',           label: 'OpenFreeMap Dark',  group: 'Dark',      provider: 'openfreemap', theme: 'dark' },
    { value: 'custom:smooth_dark',         label: 'Smooth Dark',       group: 'Dark',      provider: 'custom',      theme: 'smooth_dark' },
    { value: 'custom:toner',               label: 'Toner B&W',         group: 'Dark',      provider: 'custom',      theme: 'toner' },
    // ── Light ──
    { value: 'carto:voyager',              label: 'Carto Voyager',     group: 'Light',     provider: 'carto',       theme: 'voyager' },
    { value: 'openfreemap:positron',       label: 'Positron',          group: 'Light',     provider: 'openfreemap', theme: 'positron' },
    { value: 'custom:smooth_light',        label: 'Smooth Light',      group: 'Light',     provider: 'custom',      theme: 'smooth_light' },
    { value: 'custom:toner_lite',          label: 'Toner Lite',        group: 'Light',     provider: 'custom',      theme: 'toner_lite' },
    // ── Nature ──
    { value: 'custom:outdoors_approx',     label: 'Outdoors',          group: 'Nature',    provider: 'custom',      theme: 'outdoors_approx' },
    { value: 'custom:watercolor_approx',   label: 'Watercolor',        group: 'Nature',    provider: 'custom',      theme: 'watercolor_approx' },
    // ── Custom ──
    { value: 'custom:matrix',              label: 'Matrix',            group: 'Dark',      provider: 'custom',      theme: 'matrix' },
  ];
  if (HAS_PMTILES_URL) {
    opts.unshift(
      { value: 'pmtiles:black',     label: 'PMTiles Black',     group: 'Dark',  provider: 'pmtiles', theme: 'black' },
      { value: 'pmtiles:dark',      label: 'PMTiles Dark',      group: 'Dark',  provider: 'pmtiles', theme: 'dark' },
      { value: 'pmtiles:grayscale', label: 'PMTiles Grayscale', group: 'Dark',  provider: 'pmtiles', theme: 'grayscale' },
    );
    opts.push(
      { value: 'pmtiles:light', label: 'PMTiles Light', group: 'Light', provider: 'pmtiles', theme: 'light' },
      { value: 'pmtiles:white', label: 'PMTiles White', group: 'Light', provider: 'pmtiles', theme: 'white' },
    );
  }
  return opts;
}

export const UNIFIED_THEME_OPTIONS: UnifiedThemeOption[] = buildUnifiedOptions();

export function resolveUnifiedTheme(value: string): { provider: MapProvider; theme: string } {
  const sep = value.indexOf(':');
  if (sep < 0) return { provider: 'openfreemap', theme: 'dark' };
  const provider = value.slice(0, sep) as MapProvider;
  const theme = value.slice(sep + 1);
  if (!isMapProvider(provider)) return { provider: 'openfreemap', theme: 'dark' };
  return { provider, theme };
}

export function getUnifiedTheme(): string {
  const stored = readStorage(UNIFIED_THEME_STORAGE_KEY);
  if (stored && UNIFIED_THEME_OPTIONS.some(o => o.value === stored)) return stored;
  const oldProvider = readStorage(MAP_PROVIDER_STORAGE_KEY);
  if (oldProvider && isMapProvider(oldProvider)) {
    const oldTheme = readStorage(`${MAP_THEME_STORAGE_PREFIX}${oldProvider}`) ?? DEFAULT_MAP_THEME[oldProvider];
    const candidate = `${oldProvider}:${oldTheme}`;
    if (UNIFIED_THEME_OPTIONS.some(o => o.value === candidate)) return candidate;
  }
  return 'openfreemap:dark';
}

export interface ThemePaintOverride {
  match: string;
  type?: string;
  property: string;
  value: unknown;
}

export interface ThemeLayoutOverride {
  match: string;
  type?: string;
  property: string;
  value: unknown;
}

export interface ThemeLayerOverride {
  hide?: string[];
  paint?: ThemePaintOverride[];
  layout?: ThemeLayoutOverride[];
}

export const THEME_LAYER_OVERRIDES: Partial<Record<string, ThemeLayerOverride>> = {
  'openfreemap:dark': {
    hide: ['place_other', 'place_village', 'place_suburb', 'water_name'],
    paint: [
      { match: 'country', type: 'line', property: 'line-color', value: 'rgba(255, 255, 255, 0.35)' },
      { match: 'country', type: 'line', property: 'line-width', value: 2 },
      { match: 'background', type: 'background', property: 'background-color', value: '#1a1a1a' },
      { match: 'water', type: 'fill', property: 'fill-color', value: '#2a2a2a' },
      { match: 'landuse_residential', type: 'fill', property: 'fill-color', value: '#3a3a3a' },
      { match: 'landcover_wood', type: 'fill', property: 'fill-color', value: '#333333' },
      { match: 'landuse_park', type: 'fill', property: 'fill-color', value: '#333333' },
      { match: 'place_country_major', type: 'symbol', property: 'text-color', value: '#ffffff' },
      { match: 'place_country_minor', type: 'symbol', property: 'text-color', value: '#ffffff' },
      { match: 'place_country_other', type: 'symbol', property: 'text-color', value: '#ffffff' },
      { match: 'place_city', type: 'symbol', property: 'text-color', value: '#ffffff' },
      { match: 'place_city_large', type: 'symbol', property: 'text-color', value: '#ffffff' },
      { match: 'place_town', type: 'symbol', property: 'text-color', value: '#ffffff' },
      { match: 'place_state', type: 'symbol', property: 'text-color', value: '#ffffff' },
      { match: 'highway_name_other', type: 'symbol', property: 'text-color', value: '#cccccc' },
      { match: 'highway_name_motorway', type: 'symbol', property: 'text-color', value: '#cccccc' },
    ],
  },
  'custom:smooth_dark': {
    paint: [
      { match: 'country', type: 'line', property: 'line-color', value: '#ffffff' },
      { match: 'country', type: 'line', property: 'line-opacity', value: 0.45 },
      { match: 'country', type: 'line', property: 'line-width', value: 2.5 },
    ],
  },
};

export function setUnifiedTheme(value: string): void {
  writeStorage(UNIFIED_THEME_STORAGE_KEY, value);
  const { provider, theme } = resolveUnifiedTheme(value);
  writeStorage(MAP_PROVIDER_STORAGE_KEY, provider);
  writeStorage(`${MAP_THEME_STORAGE_PREFIX}${provider}`, theme);
}

export const MAP_PROVIDER_OPTIONS: Option<MapProvider>[] = HAS_PMTILES_URL
  ? [
      { value: 'pmtiles', label: 'PMTiles (self-hosted)' },
      { value: 'auto', label: 'Auto (PMTiles -> OpenFreeMap)' },
      { value: 'openfreemap', label: 'OpenFreeMap' },
      { value: 'carto', label: 'CARTO' },
    ]
  : [
      { value: 'openfreemap', label: 'OpenFreeMap' },
      { value: 'carto', label: 'CARTO' },
    ];

const AVAILABLE_PROVIDERS = new Set<MapProvider>(MAP_PROVIDER_OPTIONS.map((option) => option.value));

export const MAP_THEME_OPTIONS: Record<MapProvider, Option<MapTheme>[]> = {
  pmtiles: PMTILES_THEME_OPTIONS,
  auto: PMTILES_THEME_OPTIONS,
  openfreemap: [
    { value: 'dark', label: 'Dark' },
    { value: 'positron', label: 'Positron (light)' },
  ],
  carto: [
    { value: 'dark-matter', label: 'Dark Matter' },
    { value: 'voyager', label: 'Voyager (light)' },
    { value: 'positron', label: 'Positron (light)' },
  ],
  custom: [
    { value: 'smooth_dark', label: 'Smooth Dark' },
    { value: 'toner', label: 'Toner B&W' },
    { value: 'smooth_light', label: 'Smooth Light' },
    { value: 'toner_lite', label: 'Toner Lite' },
    { value: 'outdoors_approx', label: 'Outdoors' },
    { value: 'watercolor_approx', label: 'Watercolor' },
    { value: 'dark', label: 'Matrix' },
  ],
};

const DEFAULT_MAP_THEME: Record<MapProvider, MapTheme> = {
  pmtiles: 'black',
  auto: 'black',
  openfreemap: 'dark',
  carto: 'dark-matter',
  custom: 'smooth_dark',
};

const LIGHT_MAP_THEMES = new Set<string>([
  'light', 'white', 'positron', 'voyager',
  'smooth_light', 'toner_lite', 'outdoors_approx', 'watercolor_approx',
]);

const CARTO_DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const CARTO_VOYAGER_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const CARTO_POSITRON_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const CARTO_STYLE_MAP: Record<CartoTheme, string> = {
  'dark-matter': CARTO_DARK_STYLE,
  voyager: CARTO_VOYAGER_STYLE,
  positron: CARTO_POSITRON_STYLE,
};

let pmtilesProtocolRegistered = false;

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
  }
}

function isMapProvider(value: string): value is MapProvider {
  return value === 'pmtiles' || value === 'auto' || value === 'openfreemap' || value === 'carto' || value === 'custom';
}

function isValidThemeForProvider(provider: MapProvider, theme: string): theme is MapTheme {
  return MAP_THEME_OPTIONS[provider].some((option) => option.value === theme);
}

function isPmtilesTheme(value: string): value is PmtilesTheme {
  return PMTILES_THEME_OPTIONS.some((option) => option.value === value);
}

function normalizePmtilesTheme(theme: string): PmtilesTheme {
  return isPmtilesTheme(theme) ? theme : 'black';
}

function getPmtilesStyle(theme: PmtilesTheme): StyleSpecification | null {
  if (!HAS_PMTILES_URL) return null;
  const spriteTheme = theme === 'light' || theme === 'white' ? 'light' : 'dark';
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${spriteTheme}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${PMTILES_URL}`,
      },
    },
    layers: layers('protomaps', namedFlavor(theme), { lang: 'en' }),
  };
}

export function registerPMTilesProtocol(): void {
  if (pmtilesProtocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  pmtilesProtocolRegistered = true;
}

export function getMapProvider(): MapProvider {
  const stored = readStorage(MAP_PROVIDER_STORAGE_KEY);
  if (stored && isMapProvider(stored) && AVAILABLE_PROVIDERS.has(stored)) {
    return stored;
  }

  if (!HAS_PMTILES_URL) return 'openfreemap';
  return 'pmtiles';
}

export function setMapProvider(provider: MapProvider): void {
  if (!AVAILABLE_PROVIDERS.has(provider)) {
    writeStorage(MAP_PROVIDER_STORAGE_KEY, 'openfreemap');
    return;
  }
  writeStorage(MAP_PROVIDER_STORAGE_KEY, provider);
}

export function getMapTheme(provider: MapProvider): MapTheme {
  const stored = readStorage(`${MAP_THEME_STORAGE_PREFIX}${provider}`);
  if (stored && isValidThemeForProvider(provider, stored)) {
    return stored;
  }
  return DEFAULT_MAP_THEME[provider];
}

export function setMapTheme(provider: MapProvider, theme: string): void {
  if (!isValidThemeForProvider(provider, theme)) return;
  writeStorage(`${MAP_THEME_STORAGE_PREFIX}${provider}`, theme);
}

export function isLightMapTheme(theme: string): boolean {
  return LIGHT_MAP_THEMES.has(theme);
}

export const CUSTOM_THEME_FILTERS: Partial<Record<string, string>> = {
  'custom:matrix': 'saturate(0) sepia(1) hue-rotate(80deg) saturate(4) brightness(0.55)',
  'custom:smooth_dark': 'brightness(0.85) contrast(1.05) saturate(0.7)',
  'custom:toner': 'contrast(1.3) brightness(0.9)',
  'custom:toner_lite': 'grayscale(1) contrast(1.15) brightness(1.05)',
  'custom:smooth_light': 'brightness(1.05) saturate(0.85) contrast(0.95)',
  'custom:outdoors_approx': 'saturate(1.2) hue-rotate(10deg) brightness(1.02)',
  'custom:watercolor_approx': 'saturate(1.4) contrast(0.9) brightness(1.05)',
};

const CUSTOM_THEME_BASE: Partial<Record<string, { provider: MapProvider; theme: string }>> = {
  'custom:smooth_dark': { provider: 'openfreemap', theme: 'dark' },
  'custom:toner': { provider: 'carto', theme: 'dark-matter' },
  'custom:toner_lite': { provider: 'carto', theme: 'positron' },
  'custom:smooth_light': { provider: 'openfreemap', theme: 'positron' },
  'custom:outdoors_approx': { provider: 'carto', theme: 'voyager' },
  'custom:watercolor_approx': { provider: 'carto', theme: 'voyager' },
};

export function getStyleForProvider(provider: MapProvider, mapTheme: string): string | StyleSpecification {
  const prefersLight = isLightMapTheme(mapTheme);

  switch (provider) {
    case 'pmtiles': {
      const style = getPmtilesStyle(normalizePmtilesTheme(mapTheme));
      return style ?? (prefersLight ? FALLBACK_LIGHT_STYLE : FALLBACK_DARK_STYLE);
    }
    case 'openfreemap':
      return mapTheme === 'positron' ? FALLBACK_LIGHT_STYLE : FALLBACK_DARK_STYLE;
    case 'carto':
      return CARTO_STYLE_MAP[mapTheme as CartoTheme] ?? CARTO_DARK_STYLE;
    case 'custom': {
      const customKey = `custom:${mapTheme}`;
      const base = CUSTOM_THEME_BASE[customKey];
      if (base) {
        return getStyleForProvider(base.provider, base.theme);
      }
      return FALLBACK_DARK_STYLE;
    }
    case 'auto':
    default: {
      const style = getPmtilesStyle(normalizePmtilesTheme(mapTheme));
      return style ?? (prefersLight ? FALLBACK_LIGHT_STYLE : FALLBACK_DARK_STYLE);
    }
  }
}
