type CursorDiagnosticState = {
  enabled: boolean;
  cleanup: (() => void) | null;
  lastFingerprint: string;
};

const state: CursorDiagnosticState = {
  enabled: false,
  cleanup: null,
  lastFingerprint: '',
};

const CURSOR_ASSETS = [
  '/cursors/1-Normal-Select.cur?v=20260410a',
  '/cursors/13-Move.cur?v=20260410a',
  '/cursors/15-Link-Select.cur?v=20260410a',
  '/cursors/9-Vertical-Resize.cur?v=20260410a',
  '/cursors/10-Horizontal-Resize.cur?v=20260410a',
];

function describeElement(el: Element | null): string {
  if (!el) return '(none)';
  const htmlEl = el as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const id = htmlEl.id ? `#${htmlEl.id}` : '';
  const classes = Array.from(htmlEl.classList).slice(0, 4).map((cls) => `.${cls}`).join('');
  return `${tag}${id}${classes}`;
}

function getInterestingAncestor(el: Element | null): Element | null {
  if (!el) return null;
  return el.closest([
    '.panel-header',
    '.panel-resize-handle',
    '.panel-col-resize-handle',
    '.map-resize-handle',
    '.bottom-grid-resize-handle',
    '.corner-resize-handle',
    '.wc-drag-handle',
    '.live-channel-btn',
    '.live-news-manage-row',
    '.maplibregl-canvas-container',
    '#deckgl-overlay canvas',
    '.map-container',
  ].join(','));
}

function getStylesheetCursorRuleCount(): number {
  let count = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if ('cssText' in rule && rule.cssText.includes('/cursors/')) count++;
    }
  }
  return count;
}

async function checkCursorAssets(): Promise<void> {
  const results = await Promise.all(CURSOR_ASSETS.map(async (asset) => {
    try {
      const response = await fetch(asset, { cache: 'no-store' });
      return { asset, ok: response.ok, status: response.status, type: response.headers.get('content-type') };
    } catch (error) {
      return { asset, ok: false, status: 0, error: String(error) };
    }
  }));
  console.debug('[CursorDiag] Asset checks', results);
}

function inspectPointerTarget(target: Element | null, source: string): void {
  if (!target) return;
  const interesting = getInterestingAncestor(target);
  const targetCursor = getComputedStyle(target as HTMLElement).cursor;
  const interestingCursor = interesting
    ? getComputedStyle(interesting as HTMLElement).cursor
    : null;
  const fingerprint = [source, describeElement(target), targetCursor, describeElement(interesting), interestingCursor].join('|');
  if (fingerprint === state.lastFingerprint) return;
  state.lastFingerprint = fingerprint;
  console.debug('[CursorDiag] Pointer inspection', {
    source,
    target: describeElement(target),
    targetCursor,
    interestingAncestor: describeElement(interesting),
    interestingCursor,
  });
}

function enableCursorDiagnostics(): void {
  if (state.enabled) return;
  state.enabled = true;
  state.lastFingerprint = '';

  const onMove = (event: MouseEvent) => {
    inspectPointerTarget(document.elementFromPoint(event.clientX, event.clientY), 'mousemove');
  };

  const onPointerDown = (event: PointerEvent) => {
    inspectPointerTarget(document.elementFromPoint(event.clientX, event.clientY), 'pointerdown');
  };

  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('pointerdown', onPointerDown, { passive: true });

  state.cleanup = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('pointerdown', onPointerDown);
  };

  console.debug('[CursorDiag] Enabled', {
    stylesheetCursorRuleCount: getStylesheetCursorRuleCount(),
    location: window.location.href,
  });
  void checkCursorAssets();
}

function disableCursorDiagnostics(): void {
  state.cleanup?.();
  state.cleanup = null;
  state.enabled = false;
  state.lastFingerprint = '';
  console.debug('[CursorDiag] Disabled');
}

function installCursorDiagnostics(): void {
  const api = {
    enable: enableCursorDiagnostics,
    disable: disableCursorDiagnostics,
    inspectAtPointer() {
      const target = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      inspectPointerTarget(target, 'manual-center');
    },
    inspectSelector(selector: string) {
      inspectPointerTarget(document.querySelector(selector), `manual:${selector}`);
    },
    checkAssets: checkCursorAssets,
  };

  (window as Window & { cursorDebug?: typeof api }).cursorDebug = api;

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('cursorDebug') === '1' || localStorage.getItem('wm-cursor-debug') === '1') {
    enableCursorDiagnostics();
  }
}

export { installCursorDiagnostics };
