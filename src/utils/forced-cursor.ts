type ForcedCursorKind = 'default' | 'pointer' | 'text' | 'help' | 'move' | 'resize-v' | 'resize-h' | 'resize-nwse' | 'resize-nesw';
type CursorPreference = 'auto' | 'forced';

const CURSOR_PREFERENCE_KEY = 'wm-cursor-preference';
const LEGACY_FORCE_CURSOR_KEY = 'wm-force-cursor';

const CURSOR_MAP: Record<ForcedCursorKind, { src: string; x: number; y: number; width: number; height: number }> = {
  default: { src: '/cursors/1-Normal-Select.cur.png?v=20260410a', x: 0, y: 0, width: 32, height: 32 },
  pointer: { src: '/cursors/15-Link-Select.cur.png?v=20260410a', x: 5, y: 0, width: 32, height: 32 },
  text: { src: '/cursors/6-Text-Select.cur.png?v=20260410a', x: 13, y: 12, width: 32, height: 32 },
  help: { src: '/cursors/2-Help-Select.cur.png?v=20260410a', x: 0, y: 0, width: 32, height: 32 },
  move: { src: '/cursors/13-Move.cur.png?v=20260410a', x: 15, y: 15, width: 32, height: 32 },
  'resize-v': { src: '/cursors/9-Vertical-Resize.cur.png?v=20260410a', x: 15, y: 15, width: 32, height: 32 },
  'resize-h': { src: '/cursors/10-Horizontal-Resize.cur.png?v=20260410a', x: 15, y: 15, width: 32, height: 32 },
  'resize-nwse': { src: '/cursors/11-Diagonal-Resize-1.cur.png?v=20260410a', x: 15, y: 15, width: 32, height: 32 },
  'resize-nesw': { src: '/cursors/12-Diagonal-Resize-2.cur.png?v=20260410a', x: 15, y: 15, width: 32, height: 32 },
};

let overlayEl: HTMLDivElement | null = null;
let imageEl: HTMLImageElement | null = null;
let enabled = false;
let currentKind: ForcedCursorKind = 'default';
let rafId = 0;
let latestX = 0;
let latestY = 0;

function isForcedCursorEnabled(): boolean {
  return getCursorPreference() === 'forced';
}

function getCursorPreference(): CursorPreference {
  const stored = localStorage.getItem(CURSOR_PREFERENCE_KEY);
  if (stored === 'auto' || stored === 'forced') return stored;
  if (localStorage.getItem(LEGACY_FORCE_CURSOR_KEY) === '1') return 'forced';
  return 'auto';
}

function isFinePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

function ensureOverlay(): void {
  if (overlayEl && imageEl) return;
  overlayEl = document.createElement('div');
  overlayEl.className = 'forced-cursor-overlay';
  overlayEl.setAttribute('aria-hidden', 'true');
  imageEl = document.createElement('img');
  imageEl.className = 'forced-cursor-image';
  imageEl.alt = '';
  overlayEl.appendChild(imageEl);
  document.body.appendChild(overlayEl);
}

function classifyCursor(cursor: string): ForcedCursorKind {
  const value = cursor.toLowerCase();
  if (value.includes('11-diagonal-resize-1') || value.includes('nwse-resize')) return 'resize-nwse';
  if (value.includes('12-diagonal-resize-2') || value.includes('nesw-resize')) return 'resize-nesw';
  if (value.includes('10-horizontal-resize') || value.includes('ew-resize') || value.includes('col-resize')) return 'resize-h';
  if (value.includes('9-vertical-resize') || value.includes('ns-resize') || value.includes('row-resize')) return 'resize-v';
  if (value.includes('13-move') || value.includes('grab') || value.includes('grabbing') || value.includes('move')) return 'move';
  if (value.includes('6-text-select') || value.includes('text')) return 'text';
  if (value.includes('2-help-select') || value.includes('help')) return 'help';
  if (value.includes('15-link-select') || value.includes('pointer')) return 'pointer';
  return 'default';
}

function updateImage(kind: ForcedCursorKind): void {
  if (!imageEl) return;
  if (currentKind === kind && imageEl.dataset.ready === '1') return;
  currentKind = kind;
  const def = CURSOR_MAP[kind];
  imageEl.src = def.src;
  imageEl.width = def.width;
  imageEl.height = def.height;
  imageEl.style.width = `${def.width}px`;
  imageEl.style.height = `${def.height}px`;
  imageEl.style.transform = `translate(${-def.x}px, ${-def.y}px)`;
  imageEl.dataset.ready = '1';
}

function flushPosition(): void {
  rafId = 0;
  if (!overlayEl) return;
  overlayEl.style.transform = `translate(${latestX}px, ${latestY}px)`;
}

function schedulePosition(): void {
  if (rafId) return;
  rafId = window.requestAnimationFrame(flushPosition);
}

function cursorKindForElement(el: HTMLElement): ForcedCursorKind {
  const computed = getComputedStyle(el).cursor;
  // When cursor:none is active the computed value is 'none' — infer intent from structure
  if (computed !== 'none') return classifyCursor(computed);
  if (el.closest('.maplibregl-canvas-container, .map-container, #deckgl-overlay')) return 'move';
  if (el.closest('a, button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="switch"], [role="checkbox"], [tabindex="0"], .clickable, .btn')) return 'pointer';
  if (el.closest('input[type="text"], input[type="search"], textarea, [contenteditable]')) return 'text';
  if (el.closest('.map-resize-handle, .bottom-grid-resize-handle, .panel-resize-handle')) return 'resize-v';
  if (el.closest('.panel-col-resize-handle')) return 'resize-h';
  if (el.closest('.corner-resize-handle')) return 'resize-nwse';
  return 'default';
}

function handlePointerMove(event: MouseEvent): void {
  latestX = event.clientX;
  latestY = event.clientY;
  const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
  if (target) {
    updateImage(cursorKindForElement(target));
  }
  if (overlayEl) overlayEl.style.opacity = '1';
  schedulePosition();
}

function handlePointerLeave(): void {
  if (overlayEl) overlayEl.style.opacity = '0';
}

function enableForcedCursor(): void {
  if (enabled || !isFinePointer()) return;
  enabled = true;
  ensureOverlay();
  document.body.classList.add('forced-cursor-enabled');
  updateImage('default');
  document.addEventListener('mousemove', handlePointerMove, { passive: true });
  document.addEventListener('mouseenter', handlePointerMove as EventListener, { passive: true, capture: true });
  document.addEventListener('mouseleave', handlePointerLeave, { passive: true, capture: true });
  window.addEventListener('blur', handlePointerLeave);
  console.info('[ForcedCursor] Enabled');
}

function disableForcedCursor(): void {
  if (!enabled) return;
  enabled = false;
  document.body.classList.remove('forced-cursor-enabled');
  document.removeEventListener('mousemove', handlePointerMove);
  document.removeEventListener('mouseenter', handlePointerMove as EventListener, true);
  document.removeEventListener('mouseleave', handlePointerLeave, true);
  window.removeEventListener('blur', handlePointerLeave);
  if (overlayEl) overlayEl.style.opacity = '0';
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
  console.info('[ForcedCursor] Disabled');
}

function installForcedCursor(): void {
  (window as Window & { forceCursor?: boolean }).forceCursor = isForcedCursorEnabled();
  Object.defineProperty(window, 'forceCursor', {
    get() {
      return isForcedCursorEnabled();
    },
    set(value: boolean) {
      setForcedCursorEnabled(value);
    },
    configurable: true,
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('forceCursor') === '1') {
    setCursorPreference('forced');
  }

  if (isForcedCursorEnabled()) {
    enableForcedCursor();
  }
}

function setCursorPreference(value: CursorPreference): void {
  localStorage.setItem(CURSOR_PREFERENCE_KEY, value);
  if (value === 'forced') localStorage.setItem(LEGACY_FORCE_CURSOR_KEY, '1');
  else localStorage.removeItem(LEGACY_FORCE_CURSOR_KEY);

  if (value === 'forced') enableForcedCursor();
  else disableForcedCursor();
}

function setForcedCursorEnabled(value: boolean): void {
  setCursorPreference(value ? 'forced' : 'auto');
}

export type { CursorPreference };
export { getCursorPreference, installForcedCursor, isForcedCursorEnabled, setCursorPreference, setForcedCursorEnabled };
