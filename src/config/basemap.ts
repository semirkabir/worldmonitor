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
export type StadiaMapsTheme =
  | 'alidade_smooth_dark'
  | 'alidade_smooth'
  | 'alidade_satellite'
  | 'outdoors'
  | 'osm_bright'
  | 'stamen_toner'
  | 'stamen_toner_lite';
export type MapTheme = PmtilesTheme | OpenFreeMapTheme | CartoTheme | StadiaMapsTheme;
export type MapProvider = 'pmtiles' | 'auto' | 'openfreemap' | 'carto' | 'stadia';

const PMTILES_URL = (import.meta.env.VITE_PMTILES_URL ?? '').trim();
const HAS_PMTILES_URL = PMTILES_URL.length > 0;

const STADIA_KEY = (import.meta.env.VITE_STADIA_KEY ?? '').trim();

const MAP_PROVIDER_STORAGE_KEY = 'wm-map-provider';
const MAP_THEME_STORAGE_PREFIX = 'wm-map-theme:';
const UNIFIED_THEME_STORAGE_KEY = 'wm-map-unified-theme';

export const FALLBACK_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
export const FALLBACK_LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';

const STADIA_THEME_OPTIONS: Option<StadiaMapsTheme>[] = [
  { value: 'alidade_smooth_dark', label: 'Smooth Dark' },
  { value: 'alidade_smooth', label: 'Smooth Light' },
  { value: 'alidade_satellite', label: 'Satellite' },
  { value: 'outdoors', label: 'Outdoors' },
  { value: 'osm_bright', label: 'OSM Bright' },
  { value: 'stamen_toner', label: 'Stamen Toner (B&W)' },
  { value: 'stamen_toner_lite', label: 'Stamen Toner Lite' },
];

const PMTILES_THEME_OPTIONS: Option<PmtilesTheme>[] = [
  { value: 'black', label: 'Black (deepest dark)' },
  { value: 'dark', label: 'Dark' },
  { value: 'grayscale', label: 'Grayscale' },
  { value: 'light', label: 'Light' },
  { value: 'white', label: 'White' },
];

export interface UnifiedThemeOption {
  value: string;      // composite: 'provider:theme'
  label: string;
  group: string;      // 'Dark' | 'Satellite' | 'Light' | 'Artistic'
  provider: MapProvider;
  theme: string;
}

function buildUnifiedOptions(): UnifiedThemeOption[] {
  const opts: UnifiedThemeOption[] = [
    // ── Dark ──
    { value: 'stadia:alidade_smooth_dark', label: 'Smooth Dark',       group: 'Dark',      provider: 'stadia',      theme: 'alidade_smooth_dark' },
    { value: 'carto:dark-matter',          label: 'Carto Dark Matter', group: 'Dark',      provider: 'carto',       theme: 'dark-matter' },
    { value: 'openfreemap:dark',           label: 'OpenFreeMap Dark',  group: 'Dark',      provider: 'openfreemap', theme: 'dark' },
    { value: 'stadia:stamen_toner',        label: 'Toner (B&W)',       group: 'Dark',      provider: 'stadia',      theme: 'stamen_toner' },
    // ── Satellite ──
    { value: 'stadia:alidade_satellite',   label: 'Satellite',         group: 'Satellite', provider: 'stadia',      theme: 'alidade_satellite' },
    // ── Light ──
    { value: 'stadia:alidade_smooth',      label: 'Smooth Light',      group: 'Light',     provider: 'stadia',      theme: 'alidade_smooth' },
    { value: 'stadia:osm_bright',          label: 'OSM Bright',        group: 'Light',     provider: 'stadia',      theme: 'osm_bright' },
    { value: 'stadia:outdoors',            label: 'Outdoors',          group: 'Light',     provider: 'stadia',      theme: 'outdoors' },
    { value: 'carto:voyager',              label: 'Carto Voyager',     group: 'Light',     provider: 'carto',       theme: 'voyager' },
    { value: 'openfreemap:positron',       label: 'Positron',          group: 'Light',     provider: 'openfreemap', theme: 'positron' },
    { value: 'stadia:stamen_toner_lite',   label: 'Toner Lite',        group: 'Light',     provider: 'stadia',      theme: 'stamen_toner_lite' },
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
  if (sep < 0) return { provider: 'stadia', theme: 'alidade_smooth_dark' };
  const provider = value.slice(0, sep) as MapProvider;
  const theme = value.slice(sep + 1);
  if (!isMapProvider(provider)) return { provider: 'stadia', theme: 'alidade_smooth_dark' };
  return { provider, theme };
}

export function getUnifiedTheme(): string {
  const stored = readStorage(UNIFIED_THEME_STORAGE_KEY);
  if (stored && UNIFIED_THEME_OPTIONS.some(o => o.value === stored)) return stored;
  // Migration: build from legacy provider+theme storage
  const oldProvider = readStorage(MAP_PROVIDER_STORAGE_KEY);
  if (oldProvider && isMapProvider(oldProvider)) {
    const oldTheme = readStorage(`${MAP_THEME_STORAGE_PREFIX}${oldProvider}`) ?? DEFAULT_MAP_THEME[oldProvider];
    const candidate = `${oldProvider}:${oldTheme}`;
    if (UNIFIED_THEME_OPTIONS.some(o => o.value === candidate)) return candidate;
  }
  return 'stadia:alidade_smooth_dark';
}

// Per-theme style overrides applied after the MapLibre style loads.
// All matching uses case-insensitive substring of the layer ID.
export interface ThemePaintOverride {
  match: string;       // substring to match against layer ID
  type?: string;       // optional: restrict to this layer type (e.g. 'line', 'symbol')
  property: string;    // paint property name
  value: unknown;
}

export interface ThemeLayoutOverride {
  match: string;
  type?: string;
  property: string;    // layout property name (e.g. 'text-size', 'visibility')
  value: unknown;
}

export interface ThemeLayerOverride {
  hide?: string[];                  // symbol layers whose ID contains any of these strings
  paint?: ThemePaintOverride[];     // paint property overrides for matching layers
  layout?: ThemeLayoutOverride[];   // layout property overrides for matching layers
}

export const THEME_LAYER_OVERRIDES: Partial<Record<string, ThemeLayerOverride>> = {
  'stadia:alidade_satellite': {
    hide: ['country', 'state', 'province', 'region'],
  },
  'openfreemap:dark': {
    paint: [
      { match: 'country', type: 'line', property: 'line-color', value: 'rgba(255, 255, 255, 0.28)' },
    ],
  },
  'stadia:alidade_smooth_dark': {
    layout: [
      { match: 'country', type: 'symbol', property: 'text-size', value: 8 },
    ],
  },
};

export function setUnifiedTheme(value: string): void {
  writeStorage(UNIFIED_THEME_STORAGE_KEY, value);
  // Keep legacy keys in sync (used by happy variant and fallback paths)
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
      { value: 'stadia', label: 'Stadia Maps' },
    ]
  : [
      { value: 'openfreemap', label: 'OpenFreeMap' },
      { value: 'carto', label: 'CARTO' },
      { value: 'stadia', label: 'Stadia Maps' },
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
  stadia: STADIA_THEME_OPTIONS,
};

const DEFAULT_MAP_THEME: Record<MapProvider, MapTheme> = {
  pmtiles: 'black',
  auto: 'black',
  openfreemap: 'dark',
  carto: 'dark-matter',
  stadia: 'alidade_smooth_dark',
};

const LIGHT_MAP_THEMES = new Set<MapTheme>([
  'light', 'white', 'positron', 'voyager',
  'alidade_smooth', 'outdoors', 'osm_bright',
  'stamen_toner_lite',
]);

const CARTO_DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const CARTO_VOYAGER_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const CARTO_POSITRON_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const CARTO_STYLE_MAP: Record<CartoTheme, string> = {
  'dark-matter': CARTO_DARK_STYLE,
  voyager: CARTO_VOYAGER_STYLE,
  positron: CARTO_POSITRON_STYLE,
};

function getStadiaStyleUrl(theme: StadiaMapsTheme): string {
  const base = `https://tiles.stadiamaps.com/styles/${theme}.json`;
  return STADIA_KEY ? `${base}?api_key=${STADIA_KEY}` : base;
}

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
  return value === 'pmtiles' || value === 'auto' || value === 'openfreemap' || value === 'carto' || value === 'stadia';
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
    case 'stadia':
      return getStadiaStyleUrl((mapTheme as StadiaMapsTheme) ?? 'alidade_smooth_dark');
    case 'auto':
    default: {
      const style = getPmtilesStyle(normalizePmtilesTheme(mapTheme));
      return style ?? (prefersLight ? FALLBACK_LIGHT_STYLE : FALLBACK_DARK_STYLE);
    }
  }
}
