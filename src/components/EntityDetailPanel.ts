import type { PopupType } from './MapPopup';
import type { EntityRenderer, EntityRenderContext, EntityRendererRegistry } from './entity-detail/types';
import { GenericEntityRenderer } from './entity-detail/renderers/generic';

/**
 * Right-side detail panel that slides in when a user clicks a map entity.
 * Modeled on CountryDeepDivePanel — same slide-in animation, card system, maximize support.
 */
export class EntityDetailPanel {
  private panel: HTMLElement;
  private content: HTMLElement;
  private closeButton: HTMLButtonElement;
  private currentType: PopupType | null = null;
  private currentData: unknown = null;
  private isMaximizedState = false;
  private abortController: AbortController = new AbortController();
  private lastFocusedElement: HTMLElement | null = null;
  private onCloseCallback?: () => void;
  private navStack: HTMLElement[][] = [];

  private readonly registry: EntityRendererRegistry;
  private readonly generic: GenericEntityRenderer = new GenericEntityRenderer();

  private readonly handleGlobalKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.hide();
      return;
    }
    // Trap focus inside panel
    if (e.key === 'Tab') {
      const focusable = this.getFocusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last!.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first!.focus(); }
      }
    }
  };

  constructor(registry: EntityRendererRegistry = {}) {
    this.registry = registry;
    this.panel = this.getOrCreatePanel();

    const content = this.panel.querySelector<HTMLElement>('#entity-detail-content');
    const closeButton = this.panel.querySelector<HTMLButtonElement>('#entity-detail-close');
    if (!content || !closeButton) throw new Error('Entity detail panel structure is invalid');

    this.content = content;
    this.closeButton = closeButton;
    this.closeButton.addEventListener('click', () => this.hide());

    // Maximize backdrop click
    this.panel.addEventListener('click', (e) => {
      if (this.isMaximizedState && !(e.target as HTMLElement).closest('.edp-panel-content')) {
        this.minimize();
      }
    });
  }

  // ---- Public API ----

  public show(type: PopupType, data: unknown): void {
    this.navStack = [];
    this.abortController.abort();
    this.abortController = new AbortController();
    this.currentType = type;
    this.currentData = data;

    const renderer: EntityRenderer = this.registry[type] ?? this.generic;
    const ctx = this.buildContext();
    const skeleton = renderer.renderSkeleton(data, ctx);

    this.content.replaceChildren(skeleton);
    this.open();

    // Kick off async enrichment
    if (renderer.enrich) {
      const signal = this.abortController.signal;
      renderer.enrich(data, signal)
        .then((enriched) => {
          if (!signal.aborted && this.currentData === data) {
            renderer.renderEnriched?.(this.content, enriched, ctx);
          }
        })
        .catch(() => { /* enrichment failed silently */ });
    }
  }

  public hide(): void {
    if (this.isMaximizedState) {
      this.isMaximizedState = false;
      this.panel.classList.remove('edp-maximized');
    }
    this.abortController.abort();
    this.close();
    this.currentType = null;
    this.currentData = null;
    this.onCloseCallback?.();
  }

  public isVisible(): boolean {
    return this.panel.classList.contains('edp-active');
  }

  public getEntityType(): PopupType | null {
    return this.currentType;
  }

  public onClose(cb: () => void): void {
    this.onCloseCallback = cb;
  }

  public maximize(): void {
    if (this.isMaximizedState) return;
    this.isMaximizedState = true;
    this.panel.classList.add('edp-maximized');
  }

  public minimize(): void {
    if (!this.isMaximizedState) return;
    this.isMaximizedState = false;
    this.panel.classList.remove('edp-maximized');
  }

  // ---- Private ----

  private open(): void {
    if (this.panel.classList.contains('edp-active')) return;
    if (!this.panel.isConnected) {
      document.body.appendChild(this.panel);
    }
    this.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.panel.classList.add('edp-active');
    this.panel.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', this.handleGlobalKeydown);
    requestAnimationFrame(() => this.closeButton.focus());
  }

  private close(): void {
    if (!this.panel.classList.contains('edp-active')) return;
    this.panel.classList.remove('edp-active');
    this.panel.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', this.handleGlobalKeydown);
    if (this.lastFocusedElement) this.lastFocusedElement.focus();
  }

  private getFocusableElements(): HTMLElement[] {
    const selectors = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    return Array.from(this.panel.querySelectorAll<HTMLElement>(selectors))
      .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null);
  }

  private getOrCreatePanel(): HTMLElement {
    const existing = document.getElementById('entity-detail-panel');
    if (existing) return existing;

    const panel = this.el('aside', 'entity-detail-panel');
    panel.id = 'entity-detail-panel';
    panel.setAttribute('aria-label', 'Entity Details');
    panel.setAttribute('aria-hidden', 'true');

    const shell = this.el('div', 'edp-shell');
    const close = this.el('button', 'edp-close', '\u00d7') as HTMLButtonElement;
    close.id = 'entity-detail-close';
    close.setAttribute('aria-label', 'Close');

    const content = this.el('div', 'edp-panel-content');
    content.id = 'entity-detail-content';
    shell.append(close, content);
    panel.append(shell);
    document.body.append(panel);
    return panel;
  }

  private navigateTo(el: HTMLElement): void {
    this.navStack.push(Array.from(this.content.children) as HTMLElement[]);
    const backBtn = this.el('button', 'edp-back-btn', '← Back');
    backBtn.addEventListener('click', () => this.navBack());
    el.prepend(backBtn);
    this.content.replaceChildren(el);
  }

  private navBack(): void {
    const prev = this.navStack.pop();
    if (prev) this.content.replaceChildren(...prev);
  }

  private buildContext(): EntityRenderContext {
    return {
      el: this.el.bind(this),
      sectionCard: this.sectionCard.bind(this),
      badge: this.badge.bind(this),
      makeLoading: this.makeLoading.bind(this),
      makeEmpty: this.makeEmpty.bind(this),
      signal: this.abortController.signal,
      navigate: (el) => this.navigateTo(el),
    };
  }

  private sectionCard(title: string): [HTMLElement, HTMLElement] {
    const card = this.el('section', 'edp-card');
    const heading = this.el('h3', 'edp-card-title', title);
    const body = this.el('div', 'edp-card-body');
    card.append(heading, body);
    return [card, body];
  }

  private badge(text: string, className: string): HTMLElement {
    return this.el('span', className, text);
  }

  private makeLoading(text: string): HTMLElement {
    const wrap = this.el('div', 'edp-loading-inline');
    wrap.append(
      this.el('div', 'edp-loading-line'),
      this.el('div', 'edp-loading-line edp-loading-line-short'),
      this.el('span', 'edp-loading-text', text),
    );
    return wrap;
  }

  private makeEmpty(text: string): HTMLElement {
    return this.el('div', 'edp-empty', text);
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
}
