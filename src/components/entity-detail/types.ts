import type { PopupType } from '../MapPopup';

/** Helpers passed to each renderer for DOM construction */
export interface EntityRenderContext {
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
  sectionCard: (title: string) => [HTMLElement, HTMLElement];
  badge: (text: string, className: string) => HTMLElement;
  makeLoading: (text: string) => HTMLElement;
  makeEmpty: (text: string) => HTMLElement;
  signal: AbortSignal;
}

/** Each entity type can register a renderer */
export interface EntityRenderer {
  /** Render the initial skeleton/header for this entity */
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement;
  /** Optional: fetch live data and return enriched result */
  enrich?(data: unknown, signal: AbortSignal): Promise<unknown>;
  /** Optional: update the skeleton with enriched data */
  renderEnriched?(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void;
}

export type EntityRendererRegistry = Partial<Record<PopupType, EntityRenderer>>;

// ─── Shared renderer helpers ──────────────────────────────────────────────────

/** Standard label/value detail row used by all entity renderers. */
export function row(ctx: EntityRenderContext, label: string, value: string): HTMLElement {
  const r = ctx.el('div', 'edp-detail-row');
  r.append(ctx.el('span', 'edp-detail-label', label));
  r.append(ctx.el('span', 'edp-detail-value', value));
  return r;
}

/** Inline tags row: label + tag chips in the same row, appended to body. */
export function rowTags(ctx: EntityRenderContext, body: HTMLElement, label: string, items: string[]): void {
  const r = ctx.el('div', 'edp-detail-row');
  r.append(ctx.el('span', 'edp-detail-label', label));
  const tags = ctx.el('div', 'edp-tags');
  for (const item of items) tags.append(ctx.badge(item, 'edp-tag'));
  r.append(tags);
  body.append(r);
}

/**
 * Maps a status string to its badge CSS class.
 * active/existing/operating/open → edp-badge-status (green)
 * planned/construction           → edp-badge-warning (amber)
 * everything else                → edp-badge-dim (grey)
 */
export function statusBadgeClass(status: string): string {
  if (['active', 'existing', 'operating', 'open'].includes(status)) return 'edp-badge edp-badge-status';
  if (['planned', 'construction'].includes(status))                  return 'edp-badge edp-badge-warning';
  return 'edp-badge edp-badge-dim';
}
