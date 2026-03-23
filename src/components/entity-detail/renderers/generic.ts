import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

const SKIP_KEYS = new Set([
  'id', 'lat', 'lon', 'points', 'geometry', 'alternatives', '_clusterId', 'source',
]);
const HEADER_KEYS = new Set(['name', 'title', 'shortName']);
const SUBTITLE_KEYS = new Set(['country', 'city']);
const PARAGRAPH_KEYS = new Set(['description', 'note', 'notes', 'summary', 'desc', 'significance', 'details', 'impact']);
const TAG_ARRAY_KEYS = new Set(['owners', 'countries', 'specialties', 'commodities', 'transitCountries', 'categories', 'tags']);

function formatKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(key: string, value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (key === 'marketCap') return `$${value >= 1 ? `${value.toFixed(1)}T` : `${(value * 1000).toFixed(0)}B`}`;
    if (key === 'capacityTbps') return `${value} Tbps`;
    if (key === 'capacityMbpd') return `${value} Mbpd`;
    if (key === 'capacityBcmY') return `${value} BCM/yr`;
    if (key === 'powerMW') return `${value} MW`;
    if (key === 'chipCount') return value.toLocaleString();
    if (key === 'gfciRank') return `#${value}`;
    if (Number.isInteger(value) && Math.abs(value) >= 1_000_000) return value.toLocaleString();
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Fallback renderer — auto-renders any entity's properties as key/value cards.
 * Handles description/note as paragraphs, arrays as tags, landingPoints/countriesServed as lists.
 */
export class GenericEntityRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const obj = (data ?? {}) as Record<string, unknown>;
    const container = ctx.el('div', 'edp-generic');

    // --- Header ---
    const header = ctx.el('div', 'edp-header');
    const name = String(obj.name || obj.title || obj.shortName || 'Unknown');
    header.append(ctx.el('h2', 'edp-title', name));

    const subtitleParts: string[] = [];
    if (obj.city) subtitleParts.push(String(obj.city));
    if (obj.country) subtitleParts.push(String(obj.country));
    if (subtitleParts.length > 0) header.append(ctx.el('div', 'edp-subtitle', subtitleParts.join(', ')));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    if (obj.type) badgeRow.append(ctx.badge(String(obj.type), 'edp-badge'));
    if (obj.status) {
      const s = String(obj.status).toLowerCase();
      const cls = s === 'active' || s === 'operating' || s === 'existing' ? 'edp-badge edp-badge-status'
        : s === 'construction' || s === 'planned' ? 'edp-badge edp-badge-warning'
          : s === 'inactive' || s === 'decommissioned' || s === 'closed' ? 'edp-badge edp-badge-dim'
            : 'edp-badge';
      badgeRow.append(ctx.badge(String(obj.status).toUpperCase(), cls));
    }
    if (obj.tier) badgeRow.append(ctx.badge(String(obj.tier), 'edp-badge edp-badge-tier'));
    if (obj.severity) badgeRow.append(ctx.badge(String(obj.severity), 'edp-badge edp-badge-severity'));
    if (obj.major === true) badgeRow.append(ctx.badge('MAJOR', 'edp-badge edp-badge-severity'));
    if (badgeRow.childElementCount > 0) header.append(badgeRow);
    container.append(header);

    // --- Description / note paragraph ---
    for (const key of PARAGRAPH_KEYS) {
      if (typeof obj[key] === 'string' && (obj[key] as string).length > 0) {
        container.append(ctx.el('p', 'edp-description', obj[key] as string));
        break;
      }
    }

    // --- Collect remaining keys ---
    const rendered = new Set([
      ...SKIP_KEYS, ...HEADER_KEYS, ...SUBTITLE_KEYS, ...PARAGRAPH_KEYS,
      'type', 'status', 'tier', 'severity', 'major',
    ]);

    const detailEntries: [string, unknown][] = [];
    const tagEntries: [string, string[]][] = [];

    for (const key of Object.keys(obj)) {
      if (rendered.has(key)) continue;
      const value = obj[key];
      if (value == null) continue;

      // Special: landingPoints
      if (key === 'landingPoints' && Array.isArray(value) && value.length > 0) {
        const [lpCard, lpBody] = ctx.sectionCard(`Landing Points (${value.length})`);
        for (const lp of value as Array<{ city?: string; countryName?: string; country?: string }>) {
          const lpRow = ctx.el('div', 'edp-lp-row');
          const city = lp.city || '';
          const country = lp.countryName || lp.country || '';
          lpRow.append(ctx.el('span', 'edp-lp-city', city));
          if (country) lpRow.append(ctx.el('span', 'edp-lp-country', country ? ` · ${country}` : ''));
          lpBody.append(lpRow);
        }
        container.append(lpCard);
        rendered.add(key);
        continue;
      }

      // Special: countriesServed
      if (key === 'countriesServed' && Array.isArray(value) && value.length > 0) {
        const [csCard, csBody] = ctx.sectionCard('Countries Served');
        for (const cs of value as Array<{ country?: string; capacityShare?: number; isRedundant?: boolean }>) {
          const pct = cs.capacityShare != null ? `${Math.round(cs.capacityShare * 100)}%` : '';
          const extra = cs.isRedundant ? ' (redundant)' : '';
          csBody.append(row(ctx, cs.country || '?', pct + extra));
        }
        container.append(csCard);
        rendered.add(key);
        continue;
      }

      // Tag arrays
      if (TAG_ARRAY_KEYS.has(key) && Array.isArray(value) && value.every(v => typeof v === 'string')) {
        tagEntries.push([key, value as string[]]);
        rendered.add(key);
        continue;
      }

      // Skip complex nested objects
      if (typeof value === 'object' && !Array.isArray(value)) continue;

      detailEntries.push([key, value]);
      rendered.add(key);
    }

    // --- Details card ---
    if (detailEntries.length > 0) {
      const [card, body] = ctx.sectionCard('Details');
      for (const [key, value] of detailEntries) {
        body.append(row(ctx, formatKey(key), formatValue(key, value)));
      }
      container.append(card);
    }

    // --- Tag sections ---
    for (const [key, items] of tagEntries) {
      const [card, body] = ctx.sectionCard(formatKey(key));
      const tagWrap = ctx.el('div', 'edp-tags');
      for (const item of items) tagWrap.append(ctx.badge(item, 'edp-tag'));
      body.append(tagWrap);
      container.append(card);
    }

    // --- Coordinates ---
    if (typeof obj.lat === 'number' && typeof obj.lon === 'number') {
      const [coordCard, coordBody] = ctx.sectionCard('Location');
      coordBody.append(row(ctx, 'Coordinates', `${(obj.lat as number).toFixed(4)}°, ${(obj.lon as number).toFixed(4)}°`));
      container.append(coordCard);
    }

    return container;
  }
}
