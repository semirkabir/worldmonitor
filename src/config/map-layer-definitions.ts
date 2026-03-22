import type { MapLayers } from '@/types';
import { isDesktopRuntime } from '@/services/runtime';

export type MapRenderer = 'flat' | 'globe';
export type MapVariant = 'full' | 'tech' | 'finance' | 'happy' | 'commodity' | 'conflicts';

const _desktop = isDesktopRuntime();

export interface LayerDefinition {
  key: keyof MapLayers;
  icon: string;
  i18nSuffix: string;
  fallbackLabel: string;
  renderers: MapRenderer[];
  premium?: 'locked' | 'enhanced';
}

const svgIcon = (...content: string[]): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${content.join('')}</svg>`;

const ICONS = {
  target: svgIcon('<circle cx="12" cy="12" r="4.5"/>', '<path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  flags: svgIcon('<path d="M7 4v16"/>', '<path d="M17 4v16"/>', '<path d="M7 6c2 0 3 2 5 2s3-2 5-2"/>', '<path d="M7 14c2 0 3-2 5-2s3 2 5 2"/>'),
  fort: svgIcon('<path d="M4 20h16"/>', '<path d="M6 20V8l6-3 6 3v12"/>', '<path d="M9 12h2v3H9z"/>', '<path d="M13 12h2v3h-2z"/>'),
  atom: svgIcon('<circle cx="12" cy="12" r="2"/>', '<path d="M12 4c3.5 2 6 4.8 6 8s-2.5 6-6 8"/>', '<path d="M12 4c-3.5 2-6 4.8-6 8s2.5 6 6 8"/>', '<path d="M4.5 8c2.4 1.4 5 2 7.5 2s5.1-.6 7.5-2"/>', '<path d="M4.5 16c2.4-1.4 5-2 7.5-2s5.1.6 7.5 2"/>'),
  hazard: svgIcon('<path d="M12 3 21 19H3L12 3Z"/>', '<path d="M12 9v4"/>', '<circle cx="12" cy="16" r="1"/>'),
  rocket: svgIcon('<path d="M14 4c3 0 6 3 6 6-3 0-6 3-6 6-3 0-6-3-6-6 0-3 3-6 6-6Z"/>', '<path d="M9 15 5 19"/>', '<path d="M15 9l4-4"/>', '<circle cx="14" cy="10" r="1.2"/>'),
  cable: svgIcon('<path d="M8 7v4a4 4 0 0 0 4 4h4"/>', '<path d="M6 5h4v4H6z"/>', '<path d="M14 13h4v4h-4z"/>', '<path d="M7 3v2M9 3v2M15 17v2M17 17v2"/>'),
  pipe: svgIcon('<path d="M4 9h7v6H4z"/>', '<path d="M11 12h5a4 4 0 0 0 4-4V5"/>', '<path d="M16 3v4"/>'),
  server: svgIcon('<rect x="4" y="5" width="16" height="5" rx="1.5"/>', '<rect x="4" y="14" width="16" height="5" rx="1.5"/>', '<path d="M7 7.5h.01M7 16.5h.01"/>'),
  shield: svgIcon('<path d="M12 3 19 6v5c0 4.6-2.7 7.8-7 10-4.3-2.2-7-5.4-7-10V6l7-3Z"/>'),
  ship: svgIcon('<path d="M4 14h16"/>', '<path d="M7 14V9h10v5"/>', '<path d="M3 17c1.2 1 2.4 1.5 3.5 1.5S8.8 18 10 17c1.2 1 2.4 1.5 3.5 1.5S15.8 18 17 17c1.2 1 2.4 1.5 3.5 1.5"/>', '<path d="M12 5v4"/>'),
  route: svgIcon('<circle cx="6" cy="17" r="1.5"/>', '<circle cx="18" cy="7" r="1.5"/>', '<path d="M7.5 15.5c2-2 3.5-3 5.5-4"/>', '<path d="m13 8 4 0-2-2"/>'),
  plane: svgIcon('<path d="M12 3v7"/>', '<path d="M5 10l7 2 7-2"/>', '<path d="M10 14l-2 5"/>', '<path d="M14 14l2 5"/>'),
  megaphone: svgIcon('<path d="M4 12v-2l10-4v12l-10-4v-2"/>', '<path d="M14 8h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3"/>', '<path d="M6 15v4"/>'),
  usersArrow: svgIcon('<circle cx="8" cy="9" r="2"/>', '<circle cx="12.5" cy="9.5" r="1.5"/>', '<path d="M5 17c.6-2 2-3 4-3s3.4 1 4 3"/>', '<path d="M16 8h4"/>', '<path d="m18 6 2 2-2 2"/>'),
  cloud: svgIcon('<path d="M8 18h8a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 6 11a3.5 3.5 0 0 0 2 7Z"/>'),
  wifiOff: svgIcon('<path d="M4 9a12 12 0 0 1 16 0"/>', '<path d="M7 12a8 8 0 0 1 10 0"/>', '<path d="M10 15a4 4 0 0 1 4 0"/>', '<path d="M3 3 21 21"/>'),
  flame: svgIcon('<path d="M12 3c1 3-1 4.5-1 6.5 0 1.5 1 2.3 1 2.3s3-1.3 3-4.8c2 1.5 4 4 4 7.2A6.5 6.5 0 0 1 12.5 21 6.5 6.5 0 0 1 6 14.5C6 10.5 8.4 7.7 12 3Z"/>'),
  waves: svgIcon('<path d="M3 10c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2"/>', '<path d="M3 16c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2"/>'),
  chart: svgIcon('<path d="M4 20h16"/>', '<path d="M7 16v-4"/>', '<path d="M12 16V8"/>', '<path d="M17 16v-6"/>'),
  gem: svgIcon('<path d="M7 4h10l4 5-9 11L3 9l4-5Z"/>', '<path d="M9 4 7 9l5 11 5-11-2-5"/>'),
  satellite: svgIcon('<path d="M15 9 9 15"/>', '<path d="M8 8 4 4"/>', '<path d="M16 16l4 4"/>', '<rect x="9" y="9" width="6" height="6" rx="1"/>', '<path d="M16 8c2-.5 3.5-2 4-4"/>', '<path d="M8 16c-.5 2-2 3.5-4 4"/>'),
  globe: svgIcon('<circle cx="12" cy="12" r="9"/>', '<path d="M3 12h18"/>', '<path d="M12 3a14 14 0 0 1 0 18"/>', '<path d="M12 3a14 14 0 0 0 0 18"/>'),
  sunMoon: svgIcon('<path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', '<circle cx="12" cy="12" r="3.5"/>', '<path d="M16.5 6.5a4.5 4.5 0 1 0 0 9"/>'),
  ban: svgIcon('<circle cx="12" cy="12" r="9"/>', '<path d="M6 18 18 6"/>'),
  building: svgIcon('<path d="M5 20h14"/>', '<path d="M7 20V6h10v14"/>', '<path d="M10 9h1M13 9h1M10 12h1M13 12h1"/>'),
  calendar: svgIcon('<rect x="4" y="6" width="16" height="14" rx="2"/>', '<path d="M8 4v4M16 4v4M4 10h16"/>'),
  coins: svgIcon('<ellipse cx="12" cy="7" rx="5" ry="2.5"/>', '<path d="M7 7v5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7"/>', '<path d="M9 17c.8.6 1.9 1 3 1 2.8 0 5-1.1 5-2.5v-2"/>'),
  star: svgIcon('<path d="m12 3 2.4 5 5.6.8-4 3.9.9 5.5L12 15.8 7.1 18.2 8 12.7 4 8.8l5.6-.8L12 3Z"/>'),
  heart: svgIcon('<path d="M12 20s-7-4.2-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.8 12 20 12 20Z"/>'),
  smile: svgIcon('<circle cx="12" cy="12" r="9"/>', '<path d="M9 10h.01M15 10h.01"/>', '<path d="M8.5 14c1 1.3 2.1 2 3.5 2s2.5-.7 3.5-2"/>'),
  sprout: svgIcon('<path d="M12 20v-7"/>', '<path d="M12 13c-3 0-5-2-5-5 3 0 5 2 5 5Z"/>', '<path d="M12 11c0-3 2-5 5-5 0 3-2 5-5 5Z"/>'),
  spark: svgIcon('<path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z"/>', '<path d="M19 4v2M20 5h-2M5 16v2M6 17H4"/>'),
  bolt: svgIcon('<path d="m13 2-7 10h5l-1 10 8-12h-5l1-8Z"/>'),
  candlestick: svgIcon('<path d="M6 5v14"/>', '<path d="M10 3v18"/>', '<path d="M14 7v12"/>', '<path d="M18 4v16"/>', '<rect x="5" y="8" width="2" height="4" rx="1"/>', '<rect x="9" y="6" width="2" height="6" rx="1"/>', '<rect x="13" y="11" width="2" height="4" rx="1"/>', '<rect x="17" y="8" width="2" height="5" rx="1"/>'),
  bank: svgIcon('<path d="M4 9h16"/>', '<path d="M6 9v8M10 9v8M14 9v8M18 9v8"/>', '<path d="M3 20h18"/>', '<path d="m12 4 8 3H4l8-3Z"/>'),
  warehouse: svgIcon('<path d="M4 20V8l8-4 8 4v12"/>', '<path d="M4 10h16"/>', '<path d="M9 20v-5h6v5"/>'),
  boltLeaf: svgIcon('<path d="m13 3-6 8h4l-1 10 7-10h-4l1-8Z"/>', '<path d="M6 18c1.5-1.5 3.5-2.5 6-3"/>'),
  pickaxe: svgIcon('<path d="M14 4c-3 0-5.5 1-8 4"/>', '<path d="M10 8 20 18"/>', '<path d="m8 10-4 10"/>'),
  factory: svgIcon('<path d="M3 20h18"/>', '<path d="M5 20V9l5 3V9l5 3V7l4 2v11"/>', '<path d="M8 15h2M13 15h2"/>'),
  anchor: svgIcon('<path d="M12 4v10"/>', '<circle cx="12" cy="4" r="1.5"/>', '<path d="M7 12a5 5 0 0 0 10 0"/>', '<path d="M5 14a7 7 0 0 0 14 0"/>'),
} as const;

const def = (
  key: keyof MapLayers,
  icon: string,
  i18nSuffix: string,
  fallbackLabel: string,
  renderers: MapRenderer[] = ['flat', 'globe'],
  premium?: 'locked' | 'enhanced',
): LayerDefinition => ({ key, icon, i18nSuffix, fallbackLabel, renderers, ...(premium && { premium }) });

export const LAYER_REGISTRY: Record<keyof MapLayers, LayerDefinition> = {
  iranAttacks:              def('iranAttacks',              ICONS.target,    'iranAttacks',            'Iran Attacks', ['flat', 'globe'], _desktop ? 'locked' : undefined),
  hotspots:                 def('hotspots',                 ICONS.target,    'intelHotspots',          'Intel Hotspots'),
  conflicts:                def('conflicts',                ICONS.flags,     'conflictZones',          'Conflict Zones'),
  bases:                    def('bases',                    ICONS.fort,      'militaryBases',          'Military Bases'),
  nuclear:                  def('nuclear',                  ICONS.atom,      'nuclearSites',           'Nuclear Sites'),
  irradiators:              def('irradiators',              ICONS.hazard,    'gammaIrradiators',       'Gamma Irradiators'),
  spaceports:               def('spaceports',               ICONS.rocket,    'spaceports',             'Spaceports'),
  cables:                   def('cables',                   ICONS.cable,     'underseaCables',         'Undersea Cables'),
  pipelines:                def('pipelines',                ICONS.pipe,      'pipelines',              'Pipelines'),
  datacenters:              def('datacenters',              ICONS.server,    'aiDataCenters',          'AI Data Centers'),
  military:                 def('military',                 ICONS.shield,    'militaryActivity',       'Military Activity'),
  ais:                      def('ais',                      ICONS.ship,      'shipTraffic',            'Ship Traffic'),
  tradeRoutes:              def('tradeRoutes',              ICONS.route,     'tradeRoutes',            'Trade Routes'),
  flights:                  def('flights',                  ICONS.plane,     'flightDelays',           'Flight Delays'),
  protests:                 def('protests',                 ICONS.megaphone, 'protests',               'Protests'),
  ucdpEvents:               def('ucdpEvents',               ICONS.flags,     'ucdpEvents',             'Armed Conflict Events'),
  displacement:             def('displacement',             ICONS.usersArrow,'displacementFlows',      'Displacement Flows'),
  climate:                  def('climate',                  ICONS.globe,     'climateAnomalies',       'Climate Anomalies'),
  weather:                  def('weather',                  ICONS.cloud,     'weatherAlerts',          'Weather Alerts'),
  outages:                  def('outages',                  ICONS.wifiOff,   'internetOutages',        'Internet Outages'),
  cyberThreats:             def('cyberThreats',             ICONS.shield,    'cyberThreats',           'Cyber Threats'),
  natural:                  def('natural',                  ICONS.globe,     'naturalEvents',          'Natural Events'),
  fires:                    def('fires',                    ICONS.flame,     'fires',                  'Fires'),
  waterways:                def('waterways',                ICONS.waves,     'strategicWaterways',     'Strategic Waterways'),
  economic:                 def('economic',                 ICONS.chart,     'economicCenters',        'Economic Centers'),
  minerals:                 def('minerals',                 ICONS.gem,       'criticalMinerals',       'Critical Minerals'),
  gpsJamming:               def('gpsJamming',               ICONS.satellite, 'gpsJamming',             'GPS Jamming', ['flat', 'globe'], _desktop ? 'locked' : undefined),
  ciiChoropleth:            def('ciiChoropleth',            ICONS.globe,     'ciiChoropleth',          'CII Instability', ['flat', 'globe'], _desktop ? 'enhanced' : undefined),
  dayNight:                 def('dayNight',                 ICONS.sunMoon,   'dayNight',               'Day/Night', ['flat']),
  sanctions:                def('sanctions',                ICONS.ban,       'sanctions',              'Sanctions', []),
  startupHubs:              def('startupHubs',              ICONS.spark,     'startupHubs',            'Startup Hubs'),
  techHQs:                  def('techHQs',                  ICONS.building,  'techHQs',                'Tech HQs'),
  accelerators:             def('accelerators',             ICONS.bolt,      'accelerators',           'Accelerators'),
  cloudRegions:             def('cloudRegions',             ICONS.cloud,     'cloudRegions',           'Cloud Regions'),
  techEvents:               def('techEvents',               ICONS.calendar,  'techEvents',             'Tech Events'),
  stockExchanges:           def('stockExchanges',           ICONS.candlestick, 'stockExchanges',       'Stock Exchanges'),
  financialCenters:         def('financialCenters',         ICONS.coins,     'financialCenters',       'Financial Centers'),
  centralBanks:             def('centralBanks',             ICONS.bank,      'centralBanks',           'Central Banks'),
  commodityHubs:            def('commodityHubs',            ICONS.warehouse, 'commodityHubs',          'Commodity Hubs'),
  gulfInvestments:          def('gulfInvestments',          ICONS.coins,     'gulfInvestments',        'GCC Investments'),
  positiveEvents:           def('positiveEvents',           ICONS.star,      'positiveEvents',         'Positive Events'),
  kindness:                 def('kindness',                 ICONS.heart,     'kindness',               'Acts of Kindness'),
  happiness:                def('happiness',                ICONS.smile,     'happiness',              'World Happiness'),
  speciesRecovery:          def('speciesRecovery',          ICONS.sprout,    'speciesRecovery',        'Species Recovery'),
  renewableInstallations:   def('renewableInstallations',   ICONS.boltLeaf,  'renewableInstallations', 'Clean Energy'),
  miningSites:              def('miningSites',              ICONS.pickaxe,   'miningSites',            'Mining Sites'),
  processingPlants:         def('processingPlants',         ICONS.factory,   'processingPlants',       'Processing Plants'),
  commodityPorts:           def('commodityPorts',           ICONS.anchor,    'commodityPorts',         'Commodity Ports'),
};

export function resolveLayerAccentColor(key: keyof MapLayers, theme: 'light' | 'dark' = 'dark'): string {
  const light = theme === 'light';
  switch (key) {
    case 'startupHubs': return light ? '#15803d' : '#4ade80';
    case 'techHQs': return light ? '#0f766e' : '#67e8f9';
    case 'accelerators': return light ? '#b45309' : '#fbbf24';
    case 'cloudRegions': return light ? '#6d28d9' : '#a78bfa';
    case 'datacenters': return light ? '#0f766e' : '#22d3ee';
    case 'cables': return light ? '#0369a1' : '#38bdf8';
    case 'outages': return light ? '#b91c1c' : '#fb7185';
    case 'cyberThreats': return light ? '#991b1b' : '#f87171';
    case 'stockExchanges': return light ? '#92400e' : '#fbbf24';
    case 'financialCenters': return light ? '#047857' : '#34d399';
    case 'centralBanks': return light ? '#92400e' : '#fde68a';
    case 'commodityHubs': return light ? '#9a3412' : '#fdba74';
    case 'gulfInvestments': return light ? '#0f766e' : '#5eead4';
    case 'weather': return light ? '#2563eb' : '#93c5fd';
    case 'natural': return light ? '#dc2626' : '#fca5a5';
    case 'fires': return light ? '#c2410c' : '#fb923c';
    case 'waterways': return light ? '#0369a1' : '#60a5fa';
    case 'economic': return light ? '#475569' : '#cbd5e1';
    case 'minerals': return light ? '#7c3aed' : '#c4b5fd';
    case 'positiveEvents': return light ? '#16a34a' : '#86efac';
    case 'kindness': return light ? '#db2777' : '#f9a8d4';
    case 'happiness': return light ? '#ca8a04' : '#fde047';
    case 'speciesRecovery': return light ? '#15803d' : '#86efac';
    case 'renewableInstallations': return light ? '#65a30d' : '#bef264';
    case 'miningSites': return light ? '#92400e' : '#fdba74';
    case 'processingPlants': return light ? '#525252' : '#d4d4d8';
    case 'commodityPorts': return light ? '#0f766e' : '#5eead4';
    case 'conflicts':
    case 'ucdpEvents':
    case 'iranAttacks': return light ? '#b91c1c' : '#f87171';
    case 'bases':
    case 'military': return light ? '#1d4ed8' : '#93c5fd';
    case 'nuclear':
    case 'irradiators': return light ? '#a16207' : '#fde68a';
    default: return light ? '#475569' : '#a1a1aa';
  }
}

export function resolveLayerIcon(key: keyof MapLayers): string {
  return LAYER_REGISTRY[key].icon;
}

const VARIANT_LAYER_ORDER: Record<MapVariant, Array<keyof MapLayers>> = {
  full: [
    'iranAttacks', 'hotspots', 'conflicts',
    'bases', 'nuclear', 'irradiators', 'spaceports',
    'cables', 'pipelines', 'datacenters', 'military',
    'ais', 'tradeRoutes', 'flights', 'protests',
    'ucdpEvents', 'displacement', 'climate', 'weather',
    'outages', 'cyberThreats', 'natural', 'fires',
    'waterways', 'economic', 'minerals', 'gpsJamming',
    'ciiChoropleth', 'dayNight',
  ],
  tech: [
    'startupHubs', 'techHQs', 'accelerators', 'cloudRegions',
    'datacenters', 'cables', 'outages', 'cyberThreats',
    'techEvents',
  ],
  finance: [
    'stockExchanges', 'financialCenters', 'centralBanks', 'commodityHubs',
    'gulfInvestments', 'tradeRoutes', 'economic',
  ],
  happy: [
    'positiveEvents', 'kindness', 'happiness',
    'speciesRecovery', 'renewableInstallations',
  ],
  commodity: [
    'miningSites', 'processingPlants', 'commodityPorts', 'commodityHubs',
    'minerals', 'pipelines', 'waterways', 'tradeRoutes',
    'natural', 'weather',
  ],
  conflicts: [
    'iranAttacks', 'hotspots', 'conflicts',
    'bases', 'nuclear', 'irradiators', 'gpsJamming',
    'military', 'ais', 'flights', 'protests',
    'ucdpEvents', 'displacement', 'ciiChoropleth',
    'cables', 'pipelines', 'waterways',
    'climate', 'weather', 'natural', 'fires',
    'cyberThreats', 'outages', 'minerals',
  ],
};

const I18N_PREFIX = 'components.deckgl.layers.';

export function getLayersForVariant(variant: MapVariant, renderer: MapRenderer): LayerDefinition[] {
  const keys = VARIANT_LAYER_ORDER[variant] ?? VARIANT_LAYER_ORDER.full;
  return keys
    .map(k => LAYER_REGISTRY[k])
    .filter(d => d.renderers.includes(renderer));
}

export function resolveLayerLabel(def: LayerDefinition, tFn?: (key: string) => string): string {
  if (tFn) {
    const translated = tFn(I18N_PREFIX + def.i18nSuffix);
    if (translated && translated !== I18N_PREFIX + def.i18nSuffix) return translated;
  }
  return def.fallbackLabel;
}
