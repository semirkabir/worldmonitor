import { loadFromStorage, saveToStorage } from '@/utils';
import { getInstalledMarketplaceItems, putInstalledMarketplaceItem, deleteInstalledMarketplaceItem, getMarketplaceSubmissions, putMarketplaceSubmission } from './marketplace-storage';
import type {
  InstalledMarketplaceItem,
  MarketplaceCatalogItem,
  MarketplaceDataset,
  MarketplaceDatasetFormat,
  MarketplaceFeature,
  MarketplaceFeatureCollection,
  MarketplaceGeometry,
  MarketplaceManifest,
  MarketplaceMapSurfaceConfig,
  MarketplaceNormalizedRecord,
  MarketplacePanelSurfaceConfig,
  MarketplacePanelSelection,
  MarketplaceRuntimeLayer,
  MarketplaceSearchResultData,
  MarketplaceSubmission,
  MarketplaceVariant,
  MarketplaceViewItem,
} from '@/types/marketplace';

const CATALOG_INDEX_URL = '/marketplace/catalog.json';
const ENABLED_PREFS_KEY = 'wm-marketplace-enabled-v1';
const MAP_ENABLED_PREFS_KEY = 'wm-marketplace-map-enabled-v1';

type ChangeListener = () => void;

function uniqueId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function clampOpacity(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function hexToRgba(hex: string | undefined, alpha: number, fallback: [number, number, number, number]): [number, number, number, number] {
  if (!hex) return fallback;
  const normalized = hex.trim().replace('#', '');
  const isShort = normalized.length === 3;
  const isLong = normalized.length === 6;
  if (!isShort && !isLong) return fallback;
  const expanded = isShort
    ? normalized.split('').map((c) => `${c}${c}`).join('')
    : normalized;
  const int = Number.parseInt(expanded, 16);
  if (!Number.isFinite(int)) return fallback;
  return [
    (int >> 16) & 255,
    (int >> 8) & 255,
    int & 255,
    Math.round(Math.max(0, Math.min(1, alpha)) * 255),
  ];
}

function readPath(value: unknown, path?: string): unknown {
  if (!path) return value;
  const parts = path.split('.').filter(Boolean);
  let current = value as unknown;
  for (const part of parts) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const idx = Number.parseInt(part, 10);
      current = Number.isFinite(idx) ? current[idx] : undefined;
      continue;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
      continue;
    }
    return undefined;
  }
  return current;
}

function asString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[;,|]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function centroidFromGeometry(geometry: MarketplaceGeometry | undefined): { lat: number; lon: number } | null {
  if (!geometry) return null;
  if (geometry.type === 'Point') {
    return { lon: geometry.coordinates[0], lat: geometry.coordinates[1] };
  }
  if (geometry.type === 'LineString') {
    if (geometry.coordinates.length === 0) return null;
    const sum = geometry.coordinates.reduce(
      (acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }),
      { lon: 0, lat: 0 },
    );
    return { lon: sum.lon / geometry.coordinates.length, lat: sum.lat / geometry.coordinates.length };
  }
  const ring = geometry.coordinates[0] ?? [];
  if (ring.length === 0) return null;
  const sum = ring.reduce(
    (acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }),
    { lon: 0, lat: 0 },
  );
  return { lon: sum.lon / ring.length, lat: sum.lat / ring.length };
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    out.push(current.trim());
    return out;
  };

  const headers = parseLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });
}

function normalizeCoordinates(value: unknown, geometryType: 'line' | 'polygon'): MarketplaceGeometry | undefined {
  if (!Array.isArray(value)) return undefined;
  if (geometryType === 'line') {
    const coords = value
      .map((entry) => Array.isArray(entry) && entry.length >= 2 ? [asNumber(entry[0]), asNumber(entry[1])] : null)
      .filter((entry): entry is [number, number] => Array.isArray(entry) && entry[0] != null && entry[1] != null);
    return coords.length >= 2 ? { type: 'LineString', coordinates: coords } : undefined;
  }

  const firstRing = Array.isArray(value[0]) && Array.isArray((value[0] as unknown[])[0])
    ? (value[0] as unknown[])
    : value;
  const ring = firstRing
    .map((entry) => Array.isArray(entry) && entry.length >= 2 ? [asNumber(entry[0]), asNumber(entry[1])] : null)
    .filter((entry): entry is [number, number] => Array.isArray(entry) && entry[0] != null && entry[1] != null);
  return ring.length >= 3 ? { type: 'Polygon', coordinates: [ring] } : undefined;
}

function isValidDatasetUrl(url: string): boolean {
  return /^(https:\/\/|\/|\.\.?\/|http:\/\/localhost|http:\/\/127\.0\.0\.1)/i.test(url);
}

function resolveMaybeUrl(url: string | undefined, baseUrl?: string): string | undefined {
  if (!url) return undefined;
  try {
    if (/^(https?:)?\/\//i.test(url)) return new URL(url, window.location.origin).toString();
    if (baseUrl) return new URL(url, baseUrl).toString();
    return new URL(url, window.location.origin).toString();
  } catch {
    return undefined;
  }
}

function normalizeMappedRecord(record: Record<string, unknown>, dataset: MarketplaceDataset): Record<string, unknown> {
  const mapped: Record<string, unknown> = dataset.fieldMap
    ? Object.fromEntries(Object.entries(dataset.fieldMap).map(([targetKey, sourcePath]) => [targetKey, readPath(record, sourcePath)]))
    : { ...record };

  for (const [key, transform] of Object.entries(dataset.transforms ?? {})) {
    const value = mapped[key];
    if (transform === 'number') {
      mapped[key] = asNumber(value);
    } else if (transform === 'date') {
      const parsed = value instanceof Date ? value : new Date(asString(value));
      mapped[key] = Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    } else if (transform === 'tags' || transform === 'aliases') {
      mapped[key] = asArray(value);
    } else {
      mapped[key] = asString(value);
    }
  }

  return mapped;
}

function buildGeometry(record: Record<string, unknown>, mapSurface: MarketplaceMapSurfaceConfig | undefined): MarketplaceGeometry | undefined {
  if (!mapSurface) return undefined;
  if (mapSurface.geometryType === 'point') {
    const lat = asNumber(readPath(record, mapSurface.latField));
    const lon = asNumber(readPath(record, mapSurface.lonField));
    return lat != null && lon != null ? { type: 'Point', coordinates: [lon, lat] } : undefined;
  }
  return normalizeCoordinates(readPath(record, mapSurface.coordinatesField), mapSurface.geometryType);
}

function validateManifest(manifest: MarketplaceManifest): void {
  const requiredText = ['id', 'slug', 'name', 'version', 'author', 'description', 'license', 'category'] as const;
  requiredText.forEach((field) => {
    if (!asString(manifest[field])) {
      throw new Error(`Manifest missing required field: ${field}`);
    }
  });
  if (!Array.isArray(manifest.tags)) throw new Error('Manifest tags must be an array');
  if (!manifest.compatibility || !Array.isArray(manifest.compatibility.variants) || manifest.compatibility.variants.length === 0) {
    throw new Error('Manifest must declare compatible variants');
  }
  if (!Array.isArray(manifest.datasets) || manifest.datasets.length === 0) {
    throw new Error('Manifest must declare at least one dataset');
  }
  const allowedFormats: MarketplaceDatasetFormat[] = ['json', 'csv', 'geojson'];
  manifest.datasets.forEach((dataset) => {
    if (!allowedFormats.includes(dataset.format)) throw new Error(`Unsupported dataset format: ${dataset.format}`);
    if (!dataset.inlineData && !dataset.url) throw new Error(`Dataset ${dataset.id} must provide url or inlineData`);
    if (dataset.url && !isValidDatasetUrl(dataset.url)) throw new Error(`Dataset ${dataset.id} uses a disallowed URL`);
  });
  const panelTemplate = manifest.surfaces.panel?.template;
  if (panelTemplate && !['record-list', 'record-detail', 'quote-board'].includes(panelTemplate)) {
    throw new Error(`Unsupported panel template: ${panelTemplate}`);
  }
}

export class MarketplaceService {
  private catalogItems: MarketplaceCatalogItem[] = [];
  private catalogById = new Map<string, MarketplaceCatalogItem>();
  private installed = new Map<string, InstalledMarketplaceItem>();
  private submissions: MarketplaceSubmission[] = [];
  private enabledPrefs: Record<string, boolean> = {};
  private mapEnabledPrefs: Record<string, boolean> = {};
  private listeners = new Set<ChangeListener>();
  private pollTimers = new Map<string, number>();

  public async init(): Promise<void> {
    this.enabledPrefs = loadFromStorage<Record<string, boolean>>(ENABLED_PREFS_KEY, {});
    this.mapEnabledPrefs = loadFromStorage<Record<string, boolean>>(MAP_ENABLED_PREFS_KEY, {});
    const [installed, submissions] = await Promise.all([
      getInstalledMarketplaceItems(),
      getMarketplaceSubmissions(),
    ]);
    this.installed = new Map(installed.map((item) => [item.manifest.id, item]));
    this.submissions = submissions.sort((a, b) => b.submittedAt - a.submittedAt);
    await this.refreshCatalog();
    this.schedulePolling();
    this.emitChange();
  }

  public destroy(): void {
    for (const timer of this.pollTimers.values()) {
      window.clearInterval(timer);
    }
    this.pollTimers.clear();
    this.listeners.clear();
  }

  public subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getCatalogItems(): MarketplaceCatalogItem[] {
    return [...this.catalogItems];
  }

  public getViewItems(currentVariant: MarketplaceVariant): MarketplaceViewItem[] {
    return [...this.installed.values()]
      .map((item) => this.toViewItem(item, currentVariant))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public getInstalledItem(itemId: string): InstalledMarketplaceItem | null {
    return this.installed.get(itemId) ?? null;
  }

  public getSubmissions(): MarketplaceSubmission[] {
    return [...this.submissions];
  }

  public isItemEnabled(itemId: string): boolean {
    return this.enabledPrefs[itemId] ?? true;
  }

  public isMapLayerEnabled(itemId: string, manifest?: MarketplaceManifest): boolean {
    const fallback = manifest?.surfaces.map?.style?.visibleByDefault ?? true;
    return this.mapEnabledPrefs[itemId] ?? fallback;
  }

  public setItemEnabled(itemId: string, enabled: boolean): void {
    this.enabledPrefs[itemId] = enabled;
    saveToStorage(ENABLED_PREFS_KEY, this.enabledPrefs);
    this.schedulePolling();
    this.emitChange();
  }

  public setMapLayerEnabled(itemId: string, enabled: boolean): void {
    this.mapEnabledPrefs[itemId] = enabled;
    saveToStorage(MAP_ENABLED_PREFS_KEY, this.mapEnabledPrefs);
    this.emitChange();
  }

  public async refreshCatalog(): Promise<void> {
    try {
      const response = await fetch(CATALOG_INDEX_URL, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
      const items = await response.json() as MarketplaceCatalogItem[];
      this.catalogItems = Array.isArray(items) ? items : [];
      this.catalogById = new Map(this.catalogItems.map((item) => [item.id, item]));
      this.checkForUpdates();
      this.emitChange();
    } catch (error) {
      console.warn('[marketplace] Failed to refresh catalog', error);
    }
  }

  public async fetchItemDetail(itemId: string): Promise<MarketplaceManifest> {
    const catalogItem = this.catalogById.get(itemId);
    if (!catalogItem) throw new Error('Catalog item not found');
    const response = await fetch(catalogItem.manifestUrl, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Failed to fetch manifest (${response.status})`);
    const manifest = await response.json() as MarketplaceManifest;
    manifest.sourceType = 'catalog';
    validateManifest(manifest);
    return manifest;
  }

  public async installCatalogItem(itemId: string): Promise<void> {
    const catalogItem = this.catalogById.get(itemId);
    if (!catalogItem) throw new Error('Catalog item not found');
    const manifest = await this.fetchItemDetail(itemId);
    await this.installManifest(manifest, 'catalog', catalogItem.manifestUrl);
  }

  public async updateInstalledItem(itemId: string): Promise<void> {
    const existing = this.installed.get(itemId);
    if (!existing) throw new Error('Installed item not found');
    if (existing.sourceType !== 'catalog') {
      await this.refreshInstalledItem(itemId);
      return;
    }
    const catalogItem = this.catalogById.get(itemId);
    if (!catalogItem) throw new Error('Catalog item not found');
    const manifest = await this.fetchItemDetail(itemId);
    await this.installManifest(manifest, 'catalog', catalogItem.manifestUrl, existing.installedAt);
  }

  public async importManifestText(text: string, sourceType: 'import-file' | 'import-url', sourceUrl?: string): Promise<void> {
    const manifest = JSON.parse(text) as MarketplaceManifest;
    manifest.sourceType = sourceType;
    validateManifest(manifest);
    await this.installManifest(manifest, sourceType, sourceUrl);
  }

  public async importManifestFromUrl(url: string): Promise<void> {
    const resolved = resolveMaybeUrl(url);
    if (!resolved || !isValidDatasetUrl(resolved)) throw new Error('Manifest URL is not allowed');
    const response = await fetch(resolved);
    if (!response.ok) throw new Error(`Failed to fetch manifest (${response.status})`);
    const text = await response.text();
    await this.importManifestText(text, 'import-url', resolved);
  }

  public async removeInstalledItem(itemId: string): Promise<void> {
    await deleteInstalledMarketplaceItem(itemId);
    this.installed.delete(itemId);
    delete this.enabledPrefs[itemId];
    delete this.mapEnabledPrefs[itemId];
    saveToStorage(ENABLED_PREFS_KEY, this.enabledPrefs);
    saveToStorage(MAP_ENABLED_PREFS_KEY, this.mapEnabledPrefs);
    this.schedulePolling();
    this.emitChange();
  }

  public async submitManifestText(text: string, note?: string): Promise<void> {
    const manifest = JSON.parse(text) as MarketplaceManifest;
    manifest.sourceType = 'import-file';
    validateManifest(manifest);
    const submission: MarketplaceSubmission = {
      id: uniqueId('submission'),
      name: manifest.name,
      note: note?.trim() || undefined,
      manifest,
      submittedAt: Date.now(),
      status: 'review',
    };
    await putMarketplaceSubmission(submission);
    this.submissions = [submission, ...this.submissions].sort((a, b) => b.submittedAt - a.submittedAt);
    this.emitChange();
  }

  public async refreshInstalledData(): Promise<void> {
    await Promise.allSettled([...this.installed.keys()].map((itemId) => this.refreshInstalledItem(itemId)));
    this.checkForUpdates();
    this.emitChange();
  }

  public getRuntimeLayers(currentVariant: MarketplaceVariant): MarketplaceRuntimeLayer[] {
    const layers: MarketplaceRuntimeLayer[] = [];
    for (const item of this.installed.values()) {
      const view = this.toViewItem(item, currentVariant);
      const mapSurface = item.manifest.surfaces.map;
      if (!mapSurface || !view.enabled) continue;
      const snapshot = item.datasetSnapshots[mapSurface.datasetId];
      if (!snapshot) continue;
      const features = snapshot.records
        .filter((record) => record.geometry)
        .map((record) => ({
          type: 'Feature',
          geometry: record.geometry!,
          properties: {
            __marketplace: true,
            itemId: item.manifest.id,
            datasetId: mapSurface.datasetId,
            recordId: record.id,
            title: record.title || item.manifest.name,
            subtitle: record.subtitle,
            tags: record.tags,
            ...record.raw,
          },
        } satisfies MarketplaceFeature));
      if (features.length === 0) continue;
      layers.push({
        itemId: item.manifest.id,
        name: item.manifest.name,
        category: item.manifest.category,
        variantCompatible: view.variantCompatible,
        enabled: view.mapEnabled && view.variantCompatible,
        featureCollection: {
          type: 'FeatureCollection',
          features,
        } satisfies MarketplaceFeatureCollection,
        surface: mapSurface,
      });
    }
    return layers;
  }

  public getSearchItems(currentVariant: MarketplaceVariant): Array<{
    id: string;
    title: string;
    subtitle?: string;
    data: MarketplaceSearchResultData;
  }> {
    const items: Array<{
      id: string;
      title: string;
      subtitle?: string;
      data: MarketplaceSearchResultData;
    }> = [];

    // --- Catalog items: searchable by name, author, category, tags, description ---
    const installedIds = new Set(Array.from(this.installed.keys()));
    for (const catalogItem of this.catalogItems) {
      const subtitleParts = [
        catalogItem.author,
        catalogItem.category,
        ...catalogItem.tags.slice(0, 4),
      ].filter(Boolean);
      items.push({
        id: `marketplace-catalog-${catalogItem.id}`,
        title: catalogItem.name,
        subtitle: subtitleParts.join(' • '),
        data: {
          itemId: catalogItem.id,
          datasetId: '',
          recordId: '',
          preferredOpenAction: 'modal',
          hasGeometry: false,
        },
      });
      // If the catalog item is also installed and has a search surface, add its records too
      if (installedIds.has(catalogItem.id)) continue;
    }

    // --- Installed records with a search surface ---
    for (const installed of this.installed.values()) {
      const view = this.toViewItem(installed, currentVariant);
      const searchSurface = installed.manifest.surfaces.search;
      if (!searchSurface || !view.enabled || !view.variantCompatible) continue;
      const snapshot = installed.datasetSnapshots[searchSurface.datasetId];
      if (!snapshot) continue;
      snapshot.records.forEach((record) => {
        const title = asString(readPath(record.raw, searchSurface.titleField)) || record.title || installed.manifest.name;
        const subtitleParts = [
          asString(readPath(record.raw, searchSurface.subtitleField)),
          asString(readPath(record.raw, searchSurface.locationLabelField)),
          ...asArray(readPath(record.raw, searchSurface.tagsField)).slice(0, 3),
          ...asArray(readPath(record.raw, searchSurface.aliasesField)).slice(0, 2),
        ].filter(Boolean);
        items.push({
          id: `marketplace-${installed.manifest.id}-${record.id}`,
          title,
          subtitle: subtitleParts.join(' • '),
          data: {
            itemId: installed.manifest.id,
            datasetId: searchSurface.datasetId,
            recordId: record.id,
            preferredOpenAction: record.geometry ? 'map' : 'panel',
            hasGeometry: Boolean(record.geometry),
          },
        });
      });
    }

    return items;
  }

  public getPanelData(selection: MarketplacePanelSelection | null, currentVariant: MarketplaceVariant): {
    items: MarketplaceViewItem[];
    activeItem: MarketplaceViewItem | null;
    panelSurface: MarketplacePanelSurfaceConfig | null;
    records: MarketplaceNormalizedRecord[];
    selectedRecord: MarketplaceNormalizedRecord | null;
  } {
    const items = this.getViewItems(currentVariant).filter((item) => item.enabled && item.variantCompatible);
    const fallbackItem = selection?.itemId ? items.find((item) => item.manifest.id === selection.itemId) ?? null : items[0] ?? null;
    if (!fallbackItem) {
      return { items, activeItem: null, panelSurface: null, records: [], selectedRecord: null };
    }
    const panelSurface = fallbackItem.manifest.surfaces.panel ?? null;
    const datasetId = selection?.datasetId || panelSurface?.datasetId || fallbackItem.manifest.datasets[0]?.id;
    const snapshot = datasetId ? fallbackItem.datasetSnapshots[datasetId] : undefined;
    const records = snapshot?.records ?? [];
    const selectedRecord = selection?.recordId
      ? records.find((record) => record.id === selection.recordId) ?? records[0] ?? null
      : records[0] ?? null;
    return {
      items,
      activeItem: fallbackItem,
      panelSurface,
      records,
      selectedRecord,
    };
  }

  public getRecord(itemId: string, datasetId: string, recordId: string): {
    item: MarketplaceViewItem;
    record: MarketplaceNormalizedRecord | null;
  } | null {
    const installed = this.installed.get(itemId);
    if (!installed) return null;
    const snapshot = installed.datasetSnapshots[datasetId];
    if (!snapshot) return null;
    const record = snapshot.records.find((entry) => entry.id === recordId) ?? null;
    return {
      item: this.toViewItem(installed, installed.manifest.compatibility.variants[0] ?? 'full'),
      record,
    };
  }

  private emitChange(): void {
    this.listeners.forEach((listener) => listener());
  }

  private checkForUpdates(): void {
    for (const installed of this.installed.values()) {
      const catalogItem = this.catalogById.get(installed.manifest.id);
      installed.availableVersion = catalogItem?.version;
      installed.lastCheckedAt = Date.now();
    }
  }

  private toViewItem(item: InstalledMarketplaceItem, currentVariant: MarketplaceVariant): MarketplaceViewItem {
    const variantCompatible = item.manifest.compatibility.variants.includes(currentVariant);
    const availableVersion = item.availableVersion ?? this.catalogById.get(item.manifest.id)?.version;
    return {
      ...item,
      enabled: this.isItemEnabled(item.manifest.id),
      mapEnabled: this.isMapLayerEnabled(item.manifest.id, item.manifest),
      variantCompatible,
      hasUpdate: Boolean(availableVersion && availableVersion !== item.manifest.version),
      availableVersion,
    };
  }

  private async installManifest(
    manifest: MarketplaceManifest,
    sourceType: InstalledMarketplaceItem['sourceType'],
    sourceUrl?: string,
    installedAtOverride?: number,
  ): Promise<void> {
    validateManifest(manifest);
    const datasetSnapshots = await this.hydrateManifest(manifest, sourceUrl);
    const existing = this.installed.get(manifest.id);
    const next: InstalledMarketplaceItem = {
      manifest,
      sourceType,
      sourceUrl,
      installedAt: installedAtOverride ?? existing?.installedAt ?? Date.now(),
      updatedAt: Date.now(),
      availableVersion: this.catalogById.get(manifest.id)?.version,
      lastCheckedAt: Date.now(),
      datasetSnapshots,
    };
    await putInstalledMarketplaceItem(next);
    this.installed.set(manifest.id, next);
    if (!(manifest.id in this.enabledPrefs)) this.enabledPrefs[manifest.id] = true;
    if (!(manifest.id in this.mapEnabledPrefs) && manifest.surfaces.map) {
      this.mapEnabledPrefs[manifest.id] = manifest.surfaces.map.style?.visibleByDefault ?? true;
    }
    saveToStorage(ENABLED_PREFS_KEY, this.enabledPrefs);
    saveToStorage(MAP_ENABLED_PREFS_KEY, this.mapEnabledPrefs);
    this.schedulePolling();
    this.emitChange();
  }

  private async refreshInstalledItem(itemId: string): Promise<void> {
    const installed = this.installed.get(itemId);
    if (!installed) return;
    try {
      const manifest = installed.sourceType === 'catalog'
        ? await this.fetchItemDetail(itemId)
        : installed.manifest;
      const datasetSnapshots = await this.hydrateManifest(manifest, installed.sourceUrl);
      const next: InstalledMarketplaceItem = {
        ...installed,
        manifest: { ...manifest, sourceType: installed.sourceType },
        updatedAt: Date.now(),
        datasetSnapshots,
        availableVersion: this.catalogById.get(itemId)?.version ?? installed.availableVersion,
        lastCheckedAt: Date.now(),
      };
      await putInstalledMarketplaceItem(next);
      this.installed.set(itemId, next);
    } catch (error) {
      console.warn('[marketplace] Refresh failed for installed item', itemId, error);
    }
  }

  private async hydrateManifest(
    manifest: MarketplaceManifest,
    manifestUrl?: string,
  ): Promise<Record<string, { datasetId: string; fetchedAt: number; records: MarketplaceNormalizedRecord[] }>> {
    const snapshots: Record<string, { datasetId: string; fetchedAt: number; records: MarketplaceNormalizedRecord[] }> = {};
    for (const dataset of manifest.datasets) {
      const rawData = await this.fetchDataset(dataset, manifestUrl);
      const records = this.normalizeDatasetRecords(rawData, dataset, manifest.surfaces.map, manifest);
      snapshots[dataset.id] = {
        datasetId: dataset.id,
        fetchedAt: Date.now(),
        records,
      };
    }
    return snapshots;
  }

  private async fetchDataset(dataset: MarketplaceDataset, manifestUrl?: string): Promise<unknown> {
    if (dataset.inlineData !== undefined) return dataset.inlineData;
    const resolvedUrl = resolveMaybeUrl(dataset.url, manifestUrl);
    if (!resolvedUrl) throw new Error(`Dataset ${dataset.id} could not resolve its URL`);
    const response = await fetch(resolvedUrl, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Failed to fetch dataset ${dataset.id} (${response.status})`);
    if (dataset.format === 'csv') {
      return parseCsv(await response.text());
    }
    return response.json();
  }

  private normalizeDatasetRecords(
    rawData: unknown,
    dataset: MarketplaceDataset,
    mapSurface: MarketplaceMapSurfaceConfig | undefined,
    manifest: MarketplaceManifest,
  ): MarketplaceNormalizedRecord[] {
    const activeMapSurface = mapSurface?.datasetId === dataset.id ? mapSurface : undefined;
    if (dataset.format === 'geojson') {
      const featureCollection = rawData as { type?: string; features?: Array<{ properties?: Record<string, unknown>; geometry?: MarketplaceGeometry }> };
      const features = featureCollection.features ?? [];
      return features.map((feature, index) => {
        const raw = normalizeMappedRecord(feature.properties ?? {}, dataset);
        const panelSurface = manifest.surfaces.panel;
        const title = panelSurface?.titleField ? asString(readPath(raw, panelSurface.titleField)) : undefined;
        const subtitle = panelSurface?.subtitleField ? asString(readPath(raw, panelSurface.subtitleField)) : undefined;
        const description = panelSurface?.descriptionField ? asString(readPath(raw, panelSurface.descriptionField)) : undefined;
        const idCandidate = dataset.primaryIdField ? readPath(raw, dataset.primaryIdField) : raw.id;
        return {
          id: asString(idCandidate) || `${dataset.id}-${index}`,
          raw,
          title,
          subtitle,
          description,
          tags: asArray(raw.tags),
          aliases: asArray(raw.aliases),
          locationLabel: asString(raw.locationLabel),
          geometry: feature.geometry,
        };
      });
    }

    const recordsSource = dataset.recordPath ? readPath(rawData, dataset.recordPath) : rawData;
    const rows = Array.isArray(recordsSource) ? recordsSource : [];
    return rows.map((entry, index) => {
      const normalized = normalizeMappedRecord((entry ?? {}) as Record<string, unknown>, dataset);
      const geometry = buildGeometry(normalized, activeMapSurface);
      const searchSurface = manifest.surfaces.search;
      const panelSurface = manifest.surfaces.panel;
      const idCandidate = dataset.primaryIdField ? readPath(normalized, dataset.primaryIdField) : normalized.id;
      return {
        id: asString(idCandidate) || `${dataset.id}-${index}`,
        raw: normalized,
        title: panelSurface?.titleField
          ? asString(readPath(normalized, panelSurface.titleField))
          : searchSurface?.titleField
            ? asString(readPath(normalized, searchSurface.titleField))
            : undefined,
        subtitle: panelSurface?.subtitleField
          ? asString(readPath(normalized, panelSurface.subtitleField))
          : searchSurface?.subtitleField
            ? asString(readPath(normalized, searchSurface.subtitleField))
            : undefined,
        description: panelSurface?.descriptionField ? asString(readPath(normalized, panelSurface.descriptionField)) : undefined,
        aliases: searchSurface?.aliasesField ? asArray(readPath(normalized, searchSurface.aliasesField)) : asArray(normalized.aliases),
        tags: searchSurface?.tagsField ? asArray(readPath(normalized, searchSurface.tagsField)) : asArray(normalized.tags),
        locationLabel: searchSurface?.locationLabelField ? asString(readPath(normalized, searchSurface.locationLabelField)) : asString(normalized.locationLabel),
        geometry,
      };
    });
  }

  private schedulePolling(): void {
    for (const timer of this.pollTimers.values()) {
      window.clearInterval(timer);
    }
    this.pollTimers.clear();

    for (const item of this.installed.values()) {
      if (!this.isItemEnabled(item.manifest.id)) continue;
      const minInterval = item.manifest.datasets
        .map((dataset) => dataset.pollingIntervalMs)
        .filter((value): value is number => typeof value === 'number' && value > 0)
        .sort((a, b) => a - b)[0];
      if (!minInterval) continue;
      const intervalMs = Math.max(60_000, minInterval);
      const timer = window.setInterval(() => {
        void this.refreshInstalledItem(item.manifest.id).then(() => this.emitChange());
      }, intervalMs);
      this.pollTimers.set(item.manifest.id, timer);
    }
  }

  public getRecordCenter(selection: MarketplacePanelSelection): { lat: number; lon: number } | null {
    const data = selection.datasetId && selection.recordId
      ? this.getRecord(selection.itemId, selection.datasetId, selection.recordId)
      : null;
    return data?.record ? centroidFromGeometry(data.record.geometry) : null;
  }

  public getLayerStyleColors(layer: MarketplaceRuntimeLayer): {
    fill: [number, number, number, number];
    stroke: [number, number, number, number];
  } {
    const fillOpacity = clampOpacity(layer.surface.style?.opacity, layer.surface.geometryType === 'polygon' ? 0.38 : 0.72);
    const strokeOpacity = clampOpacity(layer.surface.style?.opacity, 0.92);
    return {
      fill: hexToRgba(layer.surface.style?.color, fillOpacity, [88, 242, 255, Math.round(fillOpacity * 255)]),
      stroke: hexToRgba(layer.surface.style?.strokeColor ?? layer.surface.style?.color, strokeOpacity, [210, 248, 255, Math.round(strokeOpacity * 255)]),
    };
  }
}
