import type { PanelConfig, MapLayers } from '@/types';
import type { DataSourceId } from '@/services/data-freshness';
import { SITE_VARIANT } from './variant';
import { isDesktopRuntime } from '@/services/runtime';

const _desktop = isDesktopRuntime();

// ─── Panel helpers ────────────────────────────────────────────────────────────
const p1 = (name: string): PanelConfig => ({ name, enabled: true, priority: 1 });
const p2 = (name: string): PanelConfig => ({ name, enabled: true, priority: 2 });
const p1d = (name: string, premium: 'locked' | 'enhanced'): PanelConfig =>
  ({ name, enabled: true, priority: 1, ...(_desktop && { premium }) });
const p2d = (name: string, premium: 'locked' | 'enhanced'): PanelConfig =>
  ({ name, enabled: true, priority: 2, ...(_desktop && { premium }) });

// ─── Base map layers — all disabled; variants spread and enable only theirs ───
const BASE_LAYERS: MapLayers = {
  iranAttacks: false, gpsJamming: false,
  conflicts: false, bases: false, cables: false, pipelines: false,
  hotspots: false, ais: false, nuclear: false, irradiators: false,
  sanctions: false, weather: false, economic: false, waterways: false,
  outages: false, cyberThreats: false, datacenters: false, protests: false,
  flights: false, military: false, natural: false, spaceports: false,
  minerals: false, fires: false,
  ucdpEvents: false, displacement: false, climate: false,
  startupHubs: false, cloudRegions: false, accelerators: false,
  techHQs: false, techEvents: false,
  stockExchanges: false, financialCenters: false, centralBanks: false,
  commodityHubs: false, gulfInvestments: false,
  positiveEvents: false, kindness: false, happiness: false,
  speciesRecovery: false, renewableInstallations: false,
  tradeRoutes: false, ciiChoropleth: false, dayNight: false,
  miningSites: false, processingPlants: false, commodityPorts: false,
  aptGroups: false,
};

// ============================================
// FULL VARIANT (Geopolitical)
// ============================================
// Panel order matters! First panels appear at top of grid.
// Desired order: live-news, AI Insights, AI Strategic Posture, cii, strategic-risk, then rest
const FULL_PANELS: Record<string, PanelConfig> = {
  map:                   p1('Global Map'),
  'live-news':           p1('Live News'),
  'live-webcams':        p1('Live Webcams'),
  insights:              p1('AI Insights'),
  'strategic-posture':   p1('AI Strategic Posture'),
  cii:                   p1d('Country Instability', 'enhanced'),
  'strategic-risk':      p1d('Strategic Risk Overview', 'enhanced'),
  intel:                 p1('Intel Feed'),
  'gdelt-intel':         p1d('Live Intelligence', 'enhanced'),
  cascade:               p1('Infrastructure Cascade'),
  politics:              p1('World News'),
  us:                    p1('United States'),
  europe:                p1('Europe'),
  middleeast:            p1('Middle East'),
  africa:                p1('Africa'),
  latam:                 p1('Latin America'),
  asia:                  p1('Asia-Pacific'),
  energy:                p1('Energy & Resources'),
  gov:                   p1('Government'),
  thinktanks:            p1('Think Tanks'),
  polymarket:            p1('Predictions'),
  commodities:           p1('Commodities'),
  markets:               p1('Markets'),
  economic:              p1('Economic Indicators'),
  'trade-policy':        p1('Trade Policy'),
  'supply-chain':        p1d('Supply Chain', 'enhanced'),
  finance:               p1('Financial'),
  tech:                  p2('Technology'),
  crypto:                p2('Crypto'),
  heatmap:               p2('Sector Heatmap'),
  ai:                    p2('AI/ML'),
  layoffs:               p2('Layoffs Tracker'),
  monitors:              p2('My Monitors'),
  'satellite-fires':     p2('Fires'),
  'macro-signals':       p2('Market Radar'),
  'gulf-economies':      { name: 'Gulf Economies', enabled: false, priority: 2 },
  'ucdp-events':         p2('UCDP Conflict Events'),
  giving:                { name: 'Global Giving', enabled: false, priority: 2 },
  displacement:          p2('UNHCR Displacement'),
  climate:               p2('Climate Anomalies'),
  'population-exposure': p2('Population Exposure'),
  'security-advisories': p2('Security Advisories'),
  'oref-sirens':         p2d('Israel Sirens', 'locked'),
  'telegram-intel':      p2d('Telegram Intel', 'locked'),
  'airline-intel':       p2('Airline Intelligence'),
  'world-clock':         p2('World Clock'),
  'economic-calendar':   p1('Economic Calendar'),
  'sanctions-tracker':   p1('Sanctions Tracker'),
  'alert-rules':         p2('Alert Rules'),
  'geopolitical-risk':   p1('Geopolitical Risk Index'),
  'trade-flows':         p2('Trade Flows'),
  'earnings-calendar':   p2('Earnings Calendar'),
  'ipo-calendar':        p2('IPO Calendar'),
  'insider-trading':     p2('Insider Trading'),
  'social-sentiment':    p2('Social Sentiment'),
  'options-chain':       p2('Options Chain'),
};

const FULL_MAP_LAYERS: MapLayers = {
  ...BASE_LAYERS,
  iranAttacks: _desktop ? false : true,
  conflicts:   true,
  bases:       _desktop ? false : true,
  hotspots:    true,
  ais:         true,
  nuclear:     true,
  sanctions:   true,
  weather:     true,
  economic:    true,
  waterways:   true,
  outages:     true,
  flights:     true,
  military:    true,
  natural:     true,
  aptGroups:   true,
};

const FULL_MOBILE_MAP_LAYERS: MapLayers = {
  ...BASE_LAYERS,
  iranAttacks: true,
  conflicts:   true,
  hotspots:    true,
  ais:         true,
  sanctions:   true,
  weather:     true,
  outages:     true,
  flights:     true,
  natural:     true,
};

// ============================================
// TECH VARIANT (Tech/AI/Startups)
// ============================================
const TECH_PANELS: Record<string, PanelConfig> = {
  map:              p1('Global Tech Map'),
  'live-news':      p1('Tech Headlines'),
  insights:         p1('AI Insights'),
  ai:               p1('AI/ML News'),
  tech:             p1('Technology'),
  startups:         p1('Startups & VC'),
  vcblogs:          p1('VC Insights & Essays'),
  regionalStartups: p1('Global Startup News'),
  unicorns:         p1('Unicorn Tracker'),
  accelerators:     p1('Accelerators & Demo Days'),
  security:         p1('Cybersecurity'),
  policy:           p1('AI Policy & Regulation'),
  regulation:       p1('AI Regulation Dashboard'),
  layoffs:          p1('Layoffs Tracker'),
  markets:          p2('Tech Stocks'),
  finance:          p2('Financial News'),
  hardware:         p2('Semiconductors & Hardware'),
  cloud:            p2('Cloud & Infrastructure'),
  dev:              p2('Developer Community'),
  github:           p1('GitHub Trending'),
  ipo:              p2('IPO & SPAC'),
  polymarket:       p2('Tech Predictions'),
  funding:          p1('Funding & VC'),
  producthunt:      p1('Product Hunt'),
  events:           p1('Tech Events'),
  'service-status': p2('Service Status'),
  'tech-readiness': p1('Tech Readiness Index'),
  'world-clock':    p2('World Clock'),
  monitors:         p2('My Monitors'),
};

const TECH_MAP_LAYERS: MapLayers = {
  ...BASE_LAYERS,
  cables:       true,
  outages:      true,
  cyberThreats: true,
  datacenters:  true,
  startupHubs:  true,
  cloudRegions: true,
  accelerators: true,
  techHQs:      true,
  techEvents:   true,
};

// Tech mobile layers are identical to desktop
const TECH_MOBILE_MAP_LAYERS = TECH_MAP_LAYERS;

// ============================================
// FINANCE VARIANT (Markets/Trading)
// ============================================
const FINANCE_PANELS: Record<string, PanelConfig> = {
  map:                p1('Global Markets Map'),
  'live-news':        p1('Market Headlines'),
  insights:           p1('AI Market Insights'),
  markets:            p1('Live Markets'),
  'markets-news':     p2('Markets News'),
  forex:              p1('Forex & Currencies'),
  bonds:              p1('Fixed Income'),
  commodities:        p1('Commodities & Futures'),
  'commodities-news': p2('Commodities News'),
  crypto:             p1('Crypto & Digital Assets'),
  'crypto-news':      p2('Crypto News'),
  centralbanks:       p1('Central Bank Watch'),
  economic:           p1('Economic Data'),
  'trade-policy':     p1('Trade Policy'),
  'supply-chain':     p1('Supply Chain'),
  'economic-news':    p2('Economic News'),
  ipo:                p1('IPOs, Earnings & M&A'),
  heatmap:            p1('Sector Heatmap'),
  'macro-signals':    p1('Market Radar'),
  derivatives:        p2('Derivatives & Options'),
  fintech:            p2('Fintech & Trading Tech'),
  regulation:         p2('Financial Regulation'),
  institutional:      p2('Hedge Funds & PE'),
  analysis:           p2('Market Analysis'),
  'etf-flows':        p2('BTC ETF Tracker'),
  stablecoins:        p2('Stablecoins'),
  'gcc-investments':  p2('GCC Investments'),
  gccNews:            p2('GCC Business News'),
  'gulf-economies':   p1('Gulf Economies'),
  polymarket:         p2('Predictions'),
  'world-clock':      p2('World Clock'),
  monitors:           p2('My Monitors'),
  'earnings-calendar': p2('Earnings Calendar'),
  'ipo-calendar':     p2('IPO Calendar'),
  'insider-trading':  p2('Insider Trading'),
  'social-sentiment': p2('Social Sentiment'),
  'options-chain':    p2('Options Chain'),
};

const FINANCE_MAP_LAYERS: MapLayers = {
  ...BASE_LAYERS,
  stockExchanges:   true,
  financialCenters: true,
  centralBanks:     true,
  commodityHubs:    true,
  gulfInvestments:  true,
  tradeRoutes:      true,
};

const FINANCE_MOBILE_MAP_LAYERS: MapLayers = {
  ...BASE_LAYERS,
  stockExchanges:   true,
  financialCenters: true,
  centralBanks:     true,
  commodityHubs:    true,
  gulfInvestments:  true,
};

// ============================================
// HAPPY VARIANT (Good News & Progress)
// ============================================
const HAPPY_PANELS: Record<string, PanelConfig> = {
  map:             p1('World Map'),
  'positive-feed': p1('Good News Feed'),
  progress:        p1('Human Progress'),
  counters:        p1('Live Counters'),
  spotlight:       p1("Today's Hero"),
  breakthroughs:   p1('Breakthroughs'),
  digest:          p1('5 Good Things'),
  species:         p1('Conservation Wins'),
  renewable:       p1('Renewable Energy'),
  giving:          p1('Global Giving'),
};

const HAPPY_MAP_LAYERS: MapLayers = {
  ...BASE_LAYERS,
  positiveEvents:        true,
  kindness:              true,
  happiness:             true,
  speciesRecovery:       true,
  renewableInstallations: true,
};

// Happy mobile layers are identical to desktop
const HAPPY_MOBILE_MAP_LAYERS = HAPPY_MAP_LAYERS;

// ============================================
// COMMODITY VARIANT (Mining, Metals, Energy)
// ============================================
const COMMODITY_PANELS: Record<string, PanelConfig> = {
  map:                    p1('Commodity Map'),
  'live-news':            p1('Commodity Headlines'),
  insights:               p1('AI Commodity Insights'),
  'commodity-news':       p1('Commodity News'),
  'gold-silver':          p1('Gold & Silver'),
  energy:                 p1('Energy Markets'),
  'mining-news':          p1('Mining News'),
  'critical-minerals':    p1('Critical Minerals'),
  'base-metals':          p1('Base Metals'),
  'mining-companies':     p1('Mining Companies'),
  'supply-chain':         p1('Supply Chain & Logistics'),
  'commodity-regulation': p1('Regulation & Policy'),
  markets:                p1('Commodity Markets'),
  commodities:            p1('Live Commodity Prices'),
  heatmap:                p1('Sector Heatmap'),
  'macro-signals':        p1('Market Radar'),
  'trade-policy':         p1('Trade Policy'),
  economic:               p1('Economic Indicators'),
  'gulf-economies':       p1('Gulf & OPEC Economies'),
  'gcc-investments':      p2('GCC Resource Investments'),
  climate:                p2('Climate & Weather Impact'),
  'satellite-fires':      p2('Fires & Operational Risk'),
  polymarket:             p2('Commodity Predictions'),
  'world-clock':          p2('World Clock'),
  monitors:               p2('My Monitors'),
};

const COMMODITY_MAP_LAYERS: MapLayers = {
  ...BASE_LAYERS,
  minerals:         true,
  commodityHubs:    true,
  tradeRoutes:      true,
  miningSites:      true,
  processingPlants: true,
  commodityPorts:   true,
};

const COMMODITY_MOBILE_MAP_LAYERS: MapLayers = {
  ...BASE_LAYERS,
  minerals:         true,
  commodityHubs:    true,
  miningSites:      true,
  processingPlants: true,
  commodityPorts:   true,
};

// ============================================
// CONFLICTS VARIANT (War, Military, Security)
// ============================================
const CONFLICTS_PANELS: Record<string, PanelConfig> = {
  map:                   p1('Conflicts Map'),
  'live-news':           p1('Conflict Headlines'),
  insights:              p1('AI Strategic Insights'),
  'strategic-posture':   p1d('AI Strategic Posture', 'enhanced'),
  cii:                   p1d('Country Instability', 'enhanced'),
  'strategic-risk':      p1d('Strategic Risk Overview', 'enhanced'),
  intel:                 p1('Intel Feed'),
  'gdelt-intel':         p1d('Live Intelligence', 'enhanced'),
  'ucdp-events':         p1('Conflict Events'),
  displacement:          p1('Displacement & Refugees'),
  cascade:               p1('Infrastructure Cascade'),
  middleeast:            p1('Middle East'),
  europe:                p1('Europe'),
  us:                    p1('United States'),
  politics:              p1('World News'),
  africa:                p1('Africa'),
  asia:                  p1('Asia-Pacific'),
  'telegram-intel':      p2d('Telegram Intel', 'locked'),
  'security-advisories': p2('Security Advisories'),
  'oref-sirens':         p2d('Israel Sirens', 'locked'),
  'live-webcams':        p2('Live Webcams'),
  energy:                p2('Energy & Resources'),
  'satellite-fires':     p2('Fires & Operational Risk'),
  climate:               p2('Climate Anomalies'),
  'airline-intel':       p2('Airline Intelligence'),
  polymarket:            p2('Conflict Predictions'),
  monitors:              p2('My Monitors'),
  'world-clock':         p2('World Clock'),
};

const CONFLICTS_MAP_LAYERS: MapLayers = {
  ...BASE_LAYERS,
  iranAttacks:   true,
  conflicts:     true,
  bases:         true,
  hotspots:      true,
  military:      true,
  ucdpEvents:    true,
  displacement:  true,
  ciiChoropleth: true,
  aptGroups:     true,
};

const CONFLICTS_MOBILE_MAP_LAYERS: MapLayers = {
  ...BASE_LAYERS,
  iranAttacks: true,
  conflicts:   true,
  hotspots:    true,
  military:    true,
  ucdpEvents:  true,
};

// ============================================
// VARIANT-AWARE EXPORTS
// ============================================
const PANELS_BY_VARIANT: Record<string, Record<string, PanelConfig>> = {
  happy: HAPPY_PANELS, tech: TECH_PANELS, finance: FINANCE_PANELS,
  commodity: COMMODITY_PANELS, conflicts: CONFLICTS_PANELS,
};
const LAYERS_BY_VARIANT: Record<string, MapLayers> = {
  happy: HAPPY_MAP_LAYERS, tech: TECH_MAP_LAYERS, finance: FINANCE_MAP_LAYERS,
  commodity: COMMODITY_MAP_LAYERS, conflicts: CONFLICTS_MAP_LAYERS,
};
const MOBILE_LAYERS_BY_VARIANT: Record<string, MapLayers> = {
  happy: HAPPY_MOBILE_MAP_LAYERS, tech: TECH_MOBILE_MAP_LAYERS, finance: FINANCE_MOBILE_MAP_LAYERS,
  commodity: COMMODITY_MOBILE_MAP_LAYERS, conflicts: CONFLICTS_MOBILE_MAP_LAYERS,
};

export const DEFAULT_PANELS              = PANELS_BY_VARIANT[SITE_VARIANT]        ?? FULL_PANELS;
export const DEFAULT_MAP_LAYERS          = LAYERS_BY_VARIANT[SITE_VARIANT]        ?? FULL_MAP_LAYERS;
export const MOBILE_DEFAULT_MAP_LAYERS   = MOBILE_LAYERS_BY_VARIANT[SITE_VARIANT] ?? FULL_MOBILE_MAP_LAYERS;

/** Maps map-layer toggle keys to their data-freshness source IDs (single source of truth). */
export const LAYER_TO_SOURCE: Partial<Record<keyof MapLayers, DataSourceId[]>> = {
  military:     ['opensky', 'wingbits'],
  ais:          ['ais'],
  natural:      ['usgs'],
  weather:      ['weather'],
  outages:      ['outages'],
  cyberThreats: ['cyber_threats'],
  protests:     ['acled', 'gdelt_doc'],
  ucdpEvents:   ['ucdp_events'],
  displacement: ['unhcr'],
  climate:      ['climate'],
};

// ============================================
// PANEL CATEGORY MAP (variant-aware)
// ============================================
// Maps category keys to panel keys. Only categories with at least one
// matching panel in the active variant's DEFAULT_PANELS are shown.
// The `variants` field restricts a category to specific site variants;
// omit it to show the category for all variants.
export const PANEL_CATEGORY_MAP: Record<string, { labelKey: string; panelKeys: string[]; variants?: string[] }> = {
  // All variants — essential panels
  core: {
    labelKey: 'header.panelCatCore',
    panelKeys: ['map', 'live-news', 'live-webcams', 'insights', 'strategic-posture'],
  },

  // Full (geopolitical) variant
  intelligence: {
    labelKey: 'header.panelCatIntelligence',
    panelKeys: ['cii', 'strategic-risk', 'intel', 'gdelt-intel', 'cascade', 'telegram-intel'],
    variants: ['full'],
  },
  regionalNews: {
    labelKey: 'header.panelCatRegionalNews',
    panelKeys: ['politics', 'us', 'europe', 'middleeast', 'africa', 'latam', 'asia'],
    variants: ['full'],
  },
  marketsFinance: {
    labelKey: 'header.panelCatMarketsFinance',
    panelKeys: ['commodities', 'markets', 'economic', 'trade-policy', 'supply-chain', 'finance', 'polymarket', 'macro-signals', 'gulf-economies', 'crypto', 'heatmap'],
    variants: ['full'],
  },
  topical: {
    labelKey: 'header.panelCatTopical',
    panelKeys: ['energy', 'gov', 'thinktanks', 'tech', 'ai', 'layoffs'],
    variants: ['full'],
  },
  dataTracking: {
    labelKey: 'header.panelCatDataTracking',
    panelKeys: ['monitors', 'satellite-fires', 'ucdp-events', 'displacement', 'climate', 'population-exposure', 'security-advisories', 'oref-sirens', 'world-clock'],
    variants: ['full'],
  },

  // Tech variant
  techAi: {
    labelKey: 'header.panelCatTechAi',
    panelKeys: ['ai', 'tech', 'hardware', 'cloud', 'dev', 'github', 'producthunt', 'events', 'service-status', 'tech-readiness'],
    variants: ['tech'],
  },
  startupsVc: {
    labelKey: 'header.panelCatStartupsVc',
    panelKeys: ['startups', 'vcblogs', 'regionalStartups', 'unicorns', 'accelerators', 'funding', 'ipo'],
    variants: ['tech'],
  },
  securityPolicy: {
    labelKey: 'header.panelCatSecurityPolicy',
    panelKeys: ['security', 'policy', 'regulation'],
    variants: ['tech'],
  },
  techMarkets: {
    labelKey: 'header.panelCatMarkets',
    panelKeys: ['markets', 'finance', 'polymarket', 'layoffs', 'monitors', 'world-clock'],
    variants: ['tech'],
  },

  // Finance variant
  finMarkets: {
    labelKey: 'header.panelCatMarkets',
    panelKeys: ['markets', 'markets-news', 'heatmap', 'macro-signals', 'analysis', 'polymarket'],
    variants: ['finance'],
  },
  fixedIncomeFx: {
    labelKey: 'header.panelCatFixedIncomeFx',
    panelKeys: ['forex', 'bonds'],
    variants: ['finance'],
  },
  finCommodities: {
    labelKey: 'header.panelCatCommodities',
    panelKeys: ['commodities', 'commodities-news'],
    variants: ['finance'],
  },
  cryptoDigital: {
    labelKey: 'header.panelCatCryptoDigital',
    panelKeys: ['crypto', 'crypto-news', 'etf-flows', 'stablecoins', 'fintech'],
    variants: ['finance'],
  },
  centralBanksEcon: {
    labelKey: 'header.panelCatCentralBanks',
    panelKeys: ['centralbanks', 'economic', 'trade-policy', 'supply-chain', 'economic-news'],
    variants: ['finance'],
  },
  dealsInstitutional: {
    labelKey: 'header.panelCatDeals',
    panelKeys: ['ipo', 'derivatives', 'institutional', 'regulation'],
    variants: ['finance'],
  },
  gulfMena: {
    labelKey: 'header.panelCatGulfMena',
    panelKeys: ['gulf-economies', 'gcc-investments', 'gccNews', 'monitors', 'world-clock'],
    variants: ['finance'],
  },
};

// Monitor palette — fixed category colors persisted to localStorage (not theme-dependent)
export const MONITOR_COLORS = [
  '#44ff88',
  '#ff8844',
  '#4488ff',
  '#ff44ff',
  '#ffff44',
  '#ff4444',
  '#44ffff',
  '#88ff44',
  '#ff88ff',
  '#88ffff',
];

export const STORAGE_KEYS = {
  panels:        'worldmonitor-panels',
  monitors:      'worldmonitor-monitors',
  mapLayers:     'worldmonitor-layers',
  disabledFeeds: 'worldmonitor-disabled-feeds',
} as const;

export function getVariantStorageKey(baseKey: string, variant: string): string {
  return `${baseKey}-${variant}`;
}
