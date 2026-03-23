import { t } from '@/services/i18n';
import { h } from '@/utils/dom-utils';

const DISMISS_KEY = 'wm-layer-warning-dismissed';
let activeDialog: HTMLElement | null = null;

export function showLayerWarning(threshold: number): void {
  if (localStorage.getItem(DISMISS_KEY) === '1') return;
  if (activeDialog) return;

  const overlay = document.createElement('div');
  overlay.className = 'layer-warn-overlay';
  const createSvgEl = (tag: string, attrs = {}) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }
    return el;
  };
  const dismissCheckbox = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const warningSvg = createSvgEl('svg', {
    width: '24',
    height: '24',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
  });
  warningSvg.append(
    createSvgEl('path', { d: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' }),
    createSvgEl('line', { x1: '12', y1: '9', x2: '12', y2: '13' }),
    createSvgEl('line', { x1: '12', y1: '17', x2: '12.01', y2: '17' }),
  );
  const dialog = h('div', { className: 'layer-warn-dialog' },
    h('div', { className: 'layer-warn-icon' },
      warningSvg),
    h('div', { className: 'layer-warn-text' },
      h('strong', {}, t('components.deckgl.layerWarningTitle')),
      h('p', {}, t('components.deckgl.layerWarningBody', { threshold }))),
    h('label', { className: 'layer-warn-dismiss' },
      dismissCheckbox,
      h('span', {}, t('components.deckgl.layerWarningDismiss'))),
    h('button', { className: 'layer-warn-ok', type: 'button' }, t('components.deckgl.layerWarningOk')),
  );
  overlay.appendChild(dialog);

  const close = () => {
    if (dismissCheckbox.checked) localStorage.setItem(DISMISS_KEY, '1');
    overlay.classList.add('layer-warn-out');
    setTimeout(() => { overlay.remove(); activeDialog = null; }, 200);
  };

  overlay.querySelector('.layer-warn-ok')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  document.body.appendChild(overlay);
  activeDialog = overlay;
  requestAnimationFrame(() => overlay.classList.add('layer-warn-in'));
}
