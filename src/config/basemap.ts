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
export type MapTheme = PmtilesTheme | OpenFreeMapTheme | CartoTheme;
export type MapProvider = 'pmtiles' | 'auto' | 'openfreemap' | 'carto';

const PMTILES_URL = (import.meta.env.VITE_PMTILES_URL ?? '').trim();
const HAS_PMTILES_URL = PMTILES_URL.length > 0;

const MAP_PROVIDER_STORAGE_KEY = 'wm-map-provider';
const MAP_THEME_STORAGE_PREFIX = 'wm-map-theme:';

export const FALLBACK_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
export const FALLBACK_LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';

const PMTILES_THEME_OPTIONS: Option<PmtilesTheme>[] = [
  { value: 'black', label: 'Black (deepest dark)' },
  { value: 'dark', label: 'Dark' },
  { value: 'grayscale', label: 'Grayscale' },
  { value: 'light', label: 'Light' },
  { value: 'white', label: 'White' },
];

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
};

const DEFAULT_MAP_THEME: Record<MapProvider, MapTheme> = {
  pmtiles: 'black',
  auto: 'black',
  openfreemap: 'dark',
  carto: 'dark-matter',
};

const LIGHT_MAP_THEMES = new Set<MapTheme>(['light', 'white', 'positron', 'voyager']);

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
    // Ignore storage write failures (private mode, quota errors).
  }
}

function isMapProvider(value: string): value is MapProvider {
  return value === 'pmtiles' || value === 'auto' || value === 'openfreemap' || value === 'carto';
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
  return LIGHT_MAP_THEMES.has(theme as MapTheme);
}

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
    case 'auto':
    default: {
      const style = getPmtilesStyle(normalizePmtilesTheme(mapTheme));
      return style ?? (prefersLight ? FALLBACK_LIGHT_STYLE : FALLBACK_DARK_STYLE);
    }
  }
}
