export type MarketplaceSourceType = 'catalog' | 'import-file' | 'import-url';
export type MarketplaceVisibility = 'private' | 'review' | 'public';
export type MarketplaceDatasetFormat = 'json' | 'csv' | 'geojson';
export type MarketplaceSurfaceKind = 'map' | 'search' | 'panel';
export type MarketplacePanelTemplate = 'record-list' | 'record-detail' | 'quote-board';
export type MarketplaceGeometryType = 'point' | 'line' | 'polygon';
export type MarketplaceVariant = 'full' | 'tech' | 'finance' | 'happy' | 'commodity' | 'conflicts';
export type MarketplaceTransformType = 'text' | 'number' | 'date' | 'tags' | 'aliases';
export type MarketplaceSubmissionStatus = 'review';

export interface MarketplacePreviewAsset {
  type: 'image' | 'card';
  title: string;
  body?: string;
  url?: string;
}

export interface MarketplaceAssets {
  iconUrl?: string;
  heroImageUrl?: string;
  previews?: MarketplacePreviewAsset[];
}

export interface MarketplaceCompatibility {
  variants: MarketplaceVariant[];
  minAppVersion?: string;
}

export interface MarketplaceDataset {
  id: string;
  name: string;
  format: MarketplaceDatasetFormat;
  url?: string;
  inlineData?: unknown;
  recordPath?: string;
  primaryIdField?: string;
  pollingIntervalMs?: number;
  fieldMap?: Record<string, string>;
  transforms?: Record<string, MarketplaceTransformType>;
}

export interface MarketplaceMapStyleConfig {
  color?: string;
  opacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  pointRadius?: number;
  labelField?: string;
  zIndex?: number;
  visibleByDefault?: boolean;
}

export interface MarketplaceMapSurfaceConfig {
  datasetId: string;
  geometryType: MarketplaceGeometryType;
  latField?: string;
  lonField?: string;
  coordinatesField?: string;
  style?: MarketplaceMapStyleConfig;
}

export interface MarketplaceSearchSurfaceConfig {
  datasetId: string;
  titleField: string;
  subtitleField?: string;
  aliasesField?: string;
  tagsField?: string;
  locationLabelField?: string;
}

export interface MarketplacePanelMetricConfig {
  label: string;
  field: string;
}

export interface MarketplacePanelSurfaceConfig {
  datasetId: string;
  template: MarketplacePanelTemplate;
  titleField?: string;
  subtitleField?: string;
  descriptionField?: string;
  metrics?: MarketplacePanelMetricConfig[];
}

export interface MarketplaceSurfaceConfig {
  map?: MarketplaceMapSurfaceConfig;
  search?: MarketplaceSearchSurfaceConfig;
  panel?: MarketplacePanelSurfaceConfig;
}

export interface MarketplaceManifest {
  id: string;
  slug: string;
  name: string;
  version: string;
  author: string;
  description: string;
  license: string;
  category: string;
  tags: string[];
  sourceType: MarketplaceSourceType;
  visibility: MarketplaceVisibility;
  compatibility: MarketplaceCompatibility;
  datasets: MarketplaceDataset[];
  surfaces: MarketplaceSurfaceConfig;
  assets?: MarketplaceAssets;
}

export interface MarketplaceCatalogItem {
  id: string;
  slug: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  surfaces: MarketplaceSurfaceKind[];
  compatibility: MarketplaceCompatibility;
  manifestUrl: string;
  heroImageUrl?: string;
  iconUrl?: string;
}

export interface MarketplaceDatasetSnapshot {
  datasetId: string;
  fetchedAt: number;
  records: MarketplaceNormalizedRecord[];
}

export interface InstalledMarketplaceItem {
  manifest: MarketplaceManifest;
  sourceType: MarketplaceSourceType;
  sourceUrl?: string;
  installedAt: number;
  updatedAt: number;
  lastCheckedAt?: number;
  availableVersion?: string;
  datasetSnapshots: Record<string, MarketplaceDatasetSnapshot>;
}

export interface MarketplaceSubmission {
  id: string;
  name: string;
  note?: string;
  manifest: MarketplaceManifest;
  submittedAt: number;
  status: MarketplaceSubmissionStatus;
}

export interface MarketplaceSearchResultData {
  itemId: string;
  datasetId: string;
  recordId: string;
  preferredOpenAction: 'panel' | 'map';
  hasGeometry: boolean;
}

export interface MarketplacePanelSelection {
  itemId: string;
  datasetId?: string;
  recordId?: string;
}

export interface MarketplacePointGeometry {
  type: 'Point';
  coordinates: [number, number];
}

export interface MarketplaceLineGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface MarketplacePolygonGeometry {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export type MarketplaceGeometry =
  | MarketplacePointGeometry
  | MarketplaceLineGeometry
  | MarketplacePolygonGeometry;

export interface MarketplaceFeatureProperties {
  __marketplace: true;
  itemId: string;
  datasetId: string;
  recordId: string;
  title: string;
  subtitle?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface MarketplaceFeature {
  type: 'Feature';
  geometry: MarketplaceGeometry;
  properties: MarketplaceFeatureProperties;
}

export interface MarketplaceFeatureCollection {
  type: 'FeatureCollection';
  features: MarketplaceFeature[];
}

export interface MarketplaceNormalizedRecord {
  id: string;
  raw: Record<string, unknown>;
  title?: string;
  subtitle?: string;
  description?: string;
  aliases?: string[];
  tags?: string[];
  locationLabel?: string;
  geometry?: MarketplaceGeometry;
}

export interface MarketplaceRuntimeLayer {
  itemId: string;
  name: string;
  category: string;
  variantCompatible: boolean;
  enabled: boolean;
  featureCollection: MarketplaceFeatureCollection;
  surface: MarketplaceMapSurfaceConfig;
}

export interface MarketplaceViewItem extends InstalledMarketplaceItem {
  enabled: boolean;
  mapEnabled: boolean;
  variantCompatible: boolean;
  hasUpdate: boolean;
}
