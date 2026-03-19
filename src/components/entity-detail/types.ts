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
