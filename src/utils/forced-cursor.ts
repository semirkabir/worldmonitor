type ForcedCursorKind = 'default' | 'pointer' | 'text' | 'help' | 'move' | 'resize-v' | 'resize-h' | 'resize-nwse' | 'resize-nesw';
type CursorPreference = 'auto' | 'forced';
type CursorTheme = 'classic' | 'lars-kurth-art-design-12';
type CursorThemeAssetKind = ForcedCursorKind | 'unavailable' | 'busy';

const CURSOR_PREFERENCE_KEY = 'wm-cursor-preference';
const CURSOR_THEME_KEY = 'wm-cursor-theme';
const LEGACY_FORCE_CURSOR_KEY = 'wm-force-cursor';
const CURSOR_ASSET_VERSION = '20260410a';

const CURSOR_THEME_OPTIONS: ReadonlyArray<{
  value: CursorTheme;
  label: string;
  description: string;
}> = [
  {
    value: 'classic',
    label: 'World Monitor Classic',
    description: 'Original green cursor set.',
  },
  {
    value: 'lars-kurth-art-design-12',
    label: 'Lars Kurth Art Design 12',
    description: 'Soft white cursor set with black details.',
  },
];

const cursorThemeAvailability = new Map<CursorTheme, boolean>();

type CursorThemeAsset = {
  cursorFile: string;
  previewFile?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const CURSOR_THEME_ASSETS: Record<CursorTheme, Record<CursorThemeAssetKind, CursorThemeAsset>> = {
  classic: {
    default: { cursorFile: '1-Normal-Select.cur', previewFile: '1-Normal-Select.cur.png', x: 0, y: 0, width: 32, height: 32 },
    pointer: { cursorFile: '15-Link-Select.cur', previewFile: '15-Link-Select.cur.png', x: 5, y: 0, width: 32, height: 32 },
    text: { cursorFile: '6-Text-Select.cur', previewFile: '6-Text-Select.cur.png', x: 13, y: 12, width: 32, height: 32 },
    help: { cursorFile: '2-Help-Select.cur', previewFile: '2-Help-Select.cur.png', x: 0, y: 0, width: 32, height: 32 },
    move: { cursorFile: '13-Move.cur', previewFile: '13-Move.cur.png', x: 15, y: 15, width: 32, height: 32 },
    'resize-v': { cursorFile: '9-Vertical-Resize.cur', previewFile: '9-Vertical-Resize.cur.png', x: 15, y: 15, width: 32, height: 32 },
    'resize-h': { cursorFile: '10-Horizontal-Resize.cur', previewFile: '10-Horizontal-Resize.cur.png', x: 15, y: 15, width: 32, height: 32 },
    'resize-nwse': { cursorFile: '11-Diagonal-Resize-1.cur', previewFile: '11-Diagonal-Resize-1.cur.png', x: 15, y: 15, width: 32, height: 32 },
    'resize-nesw': { cursorFile: '12-Diagonal-Resize-2.cur', previewFile: '12-Diagonal-Resize-2.cur.png', x: 15, y: 15, width: 32, height: 32 },
    unavailable: { cursorFile: '8-Unavailable.ani', x: 0, y: 0, width: 32, height: 32 },
    busy: { cursorFile: '4-Busy.ani', x: 0, y: 0, width: 32, height: 32 },
  },
  'lars-kurth-art-design-12': {
    // Lars pack artwork fills more of the 32x32 canvas, so scale the overlay
    // down to keep it visually closer to system cursor sizing.
    default: { cursorFile: 'LKad-12_arrow.cur', previewFile: 'LKad-12_arrow.cur.png', x: 0, y: 0, width: 22, height: 22 },
    pointer: { cursorFile: 'LKad-12_link.cur', previewFile: 'LKad-12_link.cur.png', x: 0, y: 0, width: 22, height: 22 },
    text: { cursorFile: 'LKad-12_text.cur', previewFile: 'LKad-12_text.cur.png', x: 0, y: 18, width: 22, height: 22 },
    help: { cursorFile: 'LKad-12_help.cur', previewFile: 'LKad-12_help.cur.png', x: 0, y: 0, width: 22, height: 22 },
    move: { cursorFile: 'LKad-12_move.cur', previewFile: 'LKad-12_move.cur.png', x: 10, y: 10, width: 22, height: 22 },
    'resize-v': { cursorFile: 'LKad-12_res-ver.cur', previewFile: 'LKad-12_res-ver.cur.png', x: 10, y: 10, width: 22, height: 22 },
    'resize-h': { cursorFile: 'LKad-12_res-hor.cur', previewFile: 'LKad-12_res-hor.cur.png', x: 10, y: 10, width: 22, height: 22 },
    'resize-nwse': { cursorFile: 'LKad-12_diag1.cur', previewFile: 'LKad-12_diag1.cur.png', x: 10, y: 10, width: 22, height: 22 },
    'resize-nesw': { cursorFile: 'LKad-12_diag2.cur', previewFile: 'LKad-12_diag2.cur.png', x: 11, y: 10, width: 22, height: 22 },
    unavailable: { cursorFile: 'LKad-12_nonono.cur', previewFile: 'LKad-12_nonono.cur.png', x: 0, y: 0, width: 22, height: 22 },
    busy: { cursorFile: 'LKad-12_busy.cur', previewFile: 'LKad-12_busy.cur.png', x: 0, y: 0, width: 22, height: 22 },
  },
};

let overlayEl: HTMLDivElement | null = null;
let imageEl: HTMLImageElement | null = null;
let enabled = false;
let currentKind: ForcedCursorKind = 'default';
let rafId = 0;
let latestX = 0;
let latestY = 0;
let mapCursorObserver: MutationObserver | null = null;

const FORCED_MAP_CURSOR_SELECTORS = [
  '.map-container',
  '.map-container canvas',
  '.map-container > div',
  '.maplibregl-canvas-container',
  '.maplibregl-canvas-container .maplibregl-canvas',
  '.maplibregl-canvas',
  '#deckgl-basemap',
  '#deckgl-basemap canvas',
  '#deckgl-overlay',
  '#deckgl-overlay *',
  '#deckgl-overlay canvas',
  '.globe-mode',
  '.globe-mode canvas',
  '.globe-mode [data-marker-id]',
  '.globe-mode [data-marker-id] *',
].join(', ');

function getCursorThemeDefinition(theme: CursorTheme): (typeof CURSOR_THEME_OPTIONS)[number] {
  return CURSOR_THEME_OPTIONS.find((option) => option.value === theme) ?? CURSOR_THEME_OPTIONS[0]!;
}

function getCursorThemeBasePath(theme: CursorTheme): string {
  return theme === 'classic' ? '/cursors' : `/cursors/${theme}`;
}

function getCursorAssetUrl(file: string, theme: CursorTheme = getCursorTheme()): string {
  const basePath = getCursorThemeBasePath(theme);
  return `${basePath}/${file}?v=${CURSOR_ASSET_VERSION}`;
}

function getCursorThemeAsset(kind: CursorThemeAssetKind, theme: CursorTheme = getCursorTheme()): CursorThemeAsset {
  return CURSOR_THEME_ASSETS[theme][kind];
}

function getCursorPreviewUrl(kind: ForcedCursorKind, theme: CursorTheme = getCursorTheme()): string {
  const asset = getCursorThemeAsset(kind, theme);
  return getCursorAssetUrl(asset.previewFile ?? asset.cursorFile, theme);
}

function getCursorCheckUrl(theme: CursorTheme = getCursorTheme()): string {
  return getCursorAssetUrl(getCursorThemeAsset('default', theme).cursorFile, theme);
}

function getCursorCssValue(kind: CursorThemeAssetKind, fallbackCss: string, theme: CursorTheme = getCursorTheme()): string {
  const asset = getCursorThemeAsset(kind, theme);
  const urls = [`url('${getCursorAssetUrl(asset.cursorFile, theme)}') ${asset.x} ${asset.y}`];
  if (asset.previewFile) urls.push(`url('${getCursorAssetUrl(asset.previewFile, theme)}') ${asset.x} ${asset.y}`);
  urls.push(fallbackCss);
  return urls.join(', ');
}

function isForcedCursorEnabled(): boolean {
  return getCursorPreference() === 'forced';
}

function resolveInlineCursor(cursor: string): string {
  return isForcedCursorEnabled() ? 'none' : cursor;
}

function getCursorPreference(): CursorPreference {
  const stored = localStorage.getItem(CURSOR_PREFERENCE_KEY);
  if (stored === 'auto' || stored === 'forced') return stored;
  if (localStorage.getItem(LEGACY_FORCE_CURSOR_KEY) === '1') return 'forced';
  return 'auto';
}

function getCursorTheme(): CursorTheme {
  const stored = localStorage.getItem(CURSOR_THEME_KEY);
  if (stored === 'classic' || stored === 'lars-kurth-art-design-12') return stored;
  return 'classic';
}

async function checkCursorThemeAvailability(theme: CursorTheme): Promise<boolean> {
  if (cursorThemeAvailability.has(theme)) return cursorThemeAvailability.get(theme)!;
  const assetUrl = getCursorCheckUrl(theme);
  try {
    const response = await fetch(assetUrl, { cache: 'no-store' });
    const ok = response.ok;
    cursorThemeAvailability.set(theme, ok);
    return ok;
  } catch {
    cursorThemeAvailability.set(theme, false);
    return false;
  }
}

function isFinePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

function applySystemCursorTheme(): void {
  const root = document.documentElement;
  root.dataset.cursorTheme = 'system';
  root.style.setProperty('--wm-cursor-default', 'default');
  root.style.setProperty('--wm-cursor-pointer', 'pointer');
  root.style.setProperty('--wm-cursor-text', 'text');
  root.style.setProperty('--wm-cursor-help', 'help');
  root.style.setProperty('--wm-cursor-unavailable', 'not-allowed');
  root.style.setProperty('--wm-cursor-busy', 'wait');
  root.style.setProperty('--wm-cursor-resize-v', 'ns-resize');
  root.style.setProperty('--wm-cursor-resize-h', 'ew-resize');
  root.style.setProperty('--wm-cursor-resize-nwse', 'nwse-resize');
  root.style.setProperty('--wm-cursor-resize-nesw', 'nesw-resize');
  root.style.setProperty('--wm-cursor-move', 'grab');
  root.style.setProperty('--wm-cursor-grabbing', 'grabbing');
}

function applyCursorTheme(theme: CursorTheme = getCursorTheme()): void {
  const root = document.documentElement;
  root.dataset.cursorTheme = theme;
  root.style.setProperty('--wm-cursor-default', getCursorCssValue('default', 'default', theme));
  root.style.setProperty('--wm-cursor-pointer', getCursorCssValue('pointer', 'pointer', theme));
  root.style.setProperty('--wm-cursor-text', getCursorCssValue('text', 'text', theme));
  root.style.setProperty('--wm-cursor-help', getCursorCssValue('help', 'help', theme));
  root.style.setProperty('--wm-cursor-unavailable', getCursorCssValue('unavailable', 'not-allowed', theme));
  root.style.setProperty('--wm-cursor-busy', getCursorCssValue('busy', 'wait', theme));
  root.style.setProperty('--wm-cursor-resize-v', getCursorCssValue('resize-v', 'ns-resize', theme));
  root.style.setProperty('--wm-cursor-resize-h', getCursorCssValue('resize-h', 'ew-resize', theme));
  root.style.setProperty('--wm-cursor-resize-nwse', getCursorCssValue('resize-nwse', 'nwse-resize', theme));
  root.style.setProperty('--wm-cursor-resize-nesw', getCursorCssValue('resize-nesw', 'nesw-resize', theme));
  root.style.setProperty('--wm-cursor-move', getCursorCssValue('move', 'grab', theme));
  root.style.setProperty('--wm-cursor-grabbing', getCursorCssValue('move', 'grabbing', theme));
  if (imageEl) {
    imageEl.dataset.ready = '0';
    updateImage(currentKind);
  }
}

function applyCursorMode(): void {
  applySystemCursorTheme();
  if (getCursorPreference() === 'forced' && imageEl) {
    imageEl.dataset.ready = '0';
    updateImage(currentKind);
  }
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

function applyForcedCursorToElement(el: Element): void {
  if (!(el instanceof HTMLElement)) return;
  el.style.setProperty('cursor', 'none', 'important');
}

function clearForcedCursorFromElement(el: Element): void {
  if (!(el instanceof HTMLElement)) return;
  if (el.style.getPropertyValue('cursor') === 'none') {
    el.style.removeProperty('cursor');
  }
}

function syncForcedMapCursorTargets(force: boolean): void {
  document.querySelectorAll(FORCED_MAP_CURSOR_SELECTORS).forEach((el) => {
    if (force) applyForcedCursorToElement(el);
    else clearForcedCursorFromElement(el);
  });
}

function startMapCursorObserver(): void {
  if (mapCursorObserver) return;
  mapCursorObserver = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        const target = mutation.target;
        if (target.matches(FORCED_MAP_CURSOR_SELECTORS) || target.closest('.map-container, .globe-mode')) {
          applyForcedCursorToElement(target);
          if (target instanceof HTMLElement) {
            target.querySelectorAll(FORCED_MAP_CURSOR_SELECTORS).forEach(applyForcedCursorToElement);
          }
        }
      }
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches(FORCED_MAP_CURSOR_SELECTORS) || node.closest('.map-container, .globe-mode')) {
          applyForcedCursorToElement(node);
          node.querySelectorAll(FORCED_MAP_CURSOR_SELECTORS).forEach(applyForcedCursorToElement);
        }
      });
    }
  });
  mapCursorObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
}

function stopMapCursorObserver(): void {
  if (!mapCursorObserver) return;
  mapCursorObserver.disconnect();
  mapCursorObserver = null;
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
  const def = getCursorThemeAsset(kind);
  const primarySrc = getCursorPreviewUrl(kind);
  const fallbackSrc = getCursorPreviewUrl(kind, 'classic');
  imageEl.onerror = () => {
    if (!imageEl || imageEl.dataset.fallbackApplied === '1') return;
    imageEl.dataset.fallbackApplied = '1';
    imageEl.src = fallbackSrc;
  };
  imageEl.dataset.fallbackApplied = '0';
  imageEl.src = primarySrc;
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

function findDeclaredCursor(el: HTMLElement): string | null {
  let node: HTMLElement | null = el;
  while (node) {
    const inlineCursor = node.style.cursor?.trim();
    if (inlineCursor && inlineCursor !== 'none') return inlineCursor;
    node = node.parentElement;
  }
  return null;
}

function cursorKindForElement(el: HTMLElement): ForcedCursorKind {
  const computed = getComputedStyle(el).cursor;
  // When cursor:none is active the computed value is 'none' — infer intent from structure
  if (computed !== 'none') return classifyCursor(computed);
  const declaredCursor = findDeclaredCursor(el);
  if (declaredCursor) return classifyCursor(declaredCursor);
  if (el.closest('[data-marker-id], .maplibregl-marker, .maplibregl-popup, .deckgl-tooltip')) return 'pointer';
  if (el.closest('a, button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="switch"], [role="checkbox"], [tabindex="0"], .clickable, .btn')) return 'pointer';
  if (el.closest('.maplibregl-canvas-container, .map-container, #deckgl-overlay, .globe-mode')) return 'move';
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
    if (target.closest('.map-container, .globe-mode')) {
      const mapRoot = target.closest('.map-container, .globe-mode');
      if (mapRoot) {
        applyForcedCursorToElement(mapRoot);
        mapRoot.querySelectorAll(FORCED_MAP_CURSOR_SELECTORS).forEach(applyForcedCursorToElement);
      }
    }
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
  document.documentElement.classList.add('forced-cursor-enabled');
  document.body.classList.add('forced-cursor-enabled');
  syncForcedMapCursorTargets(true);
  startMapCursorObserver();
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
  document.documentElement.classList.remove('forced-cursor-enabled');
  document.body.classList.remove('forced-cursor-enabled');
  stopMapCursorObserver();
  syncForcedMapCursorTargets(false);
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
  applyCursorMode();
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
  applyCursorMode();

  if (value === 'forced') enableForcedCursor();
  else disableForcedCursor();
}

function setForcedCursorEnabled(value: boolean): void {
  setCursorPreference(value ? 'forced' : 'auto');
}

function setCursorTheme(value: CursorTheme): void {
  const nextTheme = getCursorThemeDefinition(value).value;
  localStorage.setItem(CURSOR_THEME_KEY, nextTheme);
  applyCursorMode();
  if (getCursorPreference() === 'forced' && imageEl) {
    imageEl.dataset.ready = '0';
    updateImage(currentKind);
  }
}

export type { CursorPreference, CursorTheme };
export {
  checkCursorThemeAvailability,
  CURSOR_THEME_OPTIONS,
  applyCursorTheme,
  getCursorAssetUrl,
  getCursorCheckUrl,
  getCursorPreviewUrl,
  getCursorPreference,
  getCursorTheme,
  installForcedCursor,
  isForcedCursorEnabled,
  resolveInlineCursor,
  setCursorPreference,
  setCursorTheme,
  setForcedCursorEnabled,
};
