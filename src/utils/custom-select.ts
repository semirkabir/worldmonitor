/**
 * Custom select — replaces native OS dropdown popup with a consistent dark UI.
 * The underlying <select> stays in the DOM (hidden) so all existing change
 * listeners, form values, and MutationObserver-based observers keep working.
 */

const UPGRADED = 'data-wm-sel';

function buildOption(opt: HTMLOptionElement, currentValue: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'wm-opt' + (opt.disabled ? ' wm-opt--disabled' : '') + (opt.value === currentValue ? ' wm-opt--sel' : '');
  el.dataset.val = opt.value;
  if (opt.disabled) el.setAttribute('aria-disabled', 'true');

  const check = document.createElement('span');
  check.className = 'wm-opt-check';
  check.textContent = opt.value === currentValue ? '✓' : '';

  const text = document.createElement('span');
  text.className = 'wm-opt-text';
  text.textContent = opt.text;

  el.append(check, text);
  return el;
}

function populateMenu(menu: HTMLElement, select: HTMLSelectElement): void {
  menu.innerHTML = '';
  const val = select.value;
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      const grp = document.createElement('div');
      grp.className = 'wm-optgrp';
      grp.textContent = child.label;
      menu.appendChild(grp);
      for (const opt of Array.from(child.children)) {
        if (opt instanceof HTMLOptionElement) menu.appendChild(buildOption(opt, val));
      }
    } else if (child instanceof HTMLOptionElement) {
      menu.appendChild(buildOption(child, val));
    }
  }
}

function getDisplayText(select: HTMLSelectElement): string {
  const opt = select.options[select.selectedIndex];
  return opt ? opt.text : '';
}

export function upgradeSelect(select: HTMLSelectElement): void {
  if (select.hasAttribute(UPGRADED)) return;
  // Skip selects that explicitly opt out or are inside the settings window
  // (settings-window.css already handles those well)
  if (select.dataset.wmNoCustom !== undefined) return;
  select.setAttribute(UPGRADED, '1');

  // --- Wrapper ---
  const wrap = document.createElement('div');
  wrap.className = 'wm-sel';
  if (select.disabled) wrap.classList.add('wm-sel--disabled');

  // Inherit layout from known select classes
  const cls = select.classList;
  if (
    cls.contains('unified-settings-select') ||
    cls.contains('unified-settings-lang-select') ||
    cls.contains('cascade-select') ||
    select.hasAttribute('data-model-select')
  ) {
    wrap.style.cssText += 'display:flex;width:auto;max-width:240px;';
  }
  if (cls.contains('us-clock-tz')) {
    wrap.style.cssText += 'flex:1 1 0;min-width:0;';
  }
  if (cls.contains('us-clock-format')) {
    wrap.style.cssText += 'width:60px;';
  }
  // margin-top for settings selects
  if (cls.contains('unified-settings-select') || cls.contains('unified-settings-lang-select')) {
    wrap.style.marginTop = '4px';
  }

  // --- Trigger button ---
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'wm-sel-btn';
  trigger.disabled = select.disabled;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  // Compact size for small header selects
  if (cls.contains('region-select') || cls.contains('focus-select') || cls.contains('popup-sound-select')) {
    trigger.classList.add('wm-sel-btn--sm');
  }
  if (cls.contains('popup-sound-select')) {
    trigger.style.maxWidth = '120px';
    menu.classList.add('wm-sel-menu--right');
  }

  const valEl = document.createElement('span');
  valEl.className = 'wm-sel-val';
  valEl.textContent = getDisplayText(select);

  const arrow = document.createElement('span');
  arrow.className = 'wm-sel-arrow';
  arrow.innerHTML = `<svg width="9" height="5" viewBox="0 0 9 5" fill="none"><path d="M0 0l4.5 5L9 0z" fill="currentColor"/></svg>`;

  if (cls.contains('region-select')) {
    const pin = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pin.setAttribute('width', '10');
    pin.setAttribute('height', '10');
    pin.setAttribute('viewBox', '0 0 24 24');
    pin.setAttribute('fill', 'none');
    pin.setAttribute('stroke', 'currentColor');
    pin.setAttribute('stroke-width', '2');
    pin.setAttribute('stroke-linecap', 'round');
    pin.setAttribute('stroke-linejoin', 'round');
    pin.classList.add('wm-sel-pin');
    const pinPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pinPath.setAttribute('d', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z');
    const pinDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pinDot.setAttribute('cx', '12');
    pinDot.setAttribute('cy', '10');
    pinDot.setAttribute('r', '3');
    pin.append(pinPath, pinDot);
    trigger.append(pin, valEl, arrow);
  } else {
    trigger.append(valEl, arrow);
  }

  // --- Dropdown menu ---
  const menu = document.createElement('div');
  menu.className = 'wm-sel-menu';
  menu.setAttribute('role', 'listbox');
  populateMenu(menu, select);

  // --- Assemble ---
  select.parentNode?.insertBefore(wrap, select);
  wrap.append(trigger, menu, select);

  // Hide native select but keep it functional
  select.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;overflow:hidden;';

  // --- State ---
  let isOpen = false;

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    menu.classList.remove('wm-sel-menu--open');
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onOutside);
  };

  const onOutside = (e: MouseEvent) => {
    if (!wrap.contains(e.target as Node)) close();
  };

  const open = () => {
    if (select.disabled) return;
    isOpen = true;
    trigger.setAttribute('aria-expanded', 'true');

    populateMenu(menu, select); // refresh — options may have changed
    menu.classList.add('wm-sel-menu--open');

    // Flip upward if too close to bottom of viewport
    const rect = wrap.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    menu.classList.toggle('wm-sel-menu--flip', spaceBelow < 220 && rect.top > 220);

    // Scroll selected into view
    requestAnimationFrame(() => {
      menu.querySelector('.wm-opt--sel')?.scrollIntoView({ block: 'nearest' });
    });

    setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen ? close() : open();
  });

  // Option selection
  menu.addEventListener('mousedown', (e) => {
    e.preventDefault(); // don't steal focus from trigger
    const optEl = (e.target as Element).closest<HTMLElement>('.wm-opt');
    if (!optEl || optEl.classList.contains('wm-opt--disabled')) return;

    const newVal = optEl.dataset.val ?? '';
    select.value = newVal;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    valEl.textContent = getDisplayText(select);
    close();
  });

  // Keyboard navigation
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      isOpen ? close() : open();
    } else if (e.key === 'Escape') {
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) open();
      const opts = Array.from(menu.querySelectorAll<HTMLElement>('.wm-opt:not(.wm-opt--disabled)'));
      const curIdx = opts.findIndex(o => o.classList.contains('wm-opt--sel'));
      const nextIdx = e.key === 'ArrowDown'
        ? Math.min(curIdx + 1, opts.length - 1)
        : Math.max(curIdx - 1, 0);
      const next = opts[nextIdx];
      if (next) {
        const newVal = next.dataset.val ?? '';
        select.value = newVal;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        valEl.textContent = getDisplayText(select);
        populateMenu(menu, select);
        next.scrollIntoView?.({ block: 'nearest' });
      }
    }
  });

  // Watch for options added/removed (e.g. Ollama model list loading)
  const optObserver = new MutationObserver(() => {
    valEl.textContent = getDisplayText(select);
    if (isOpen) populateMenu(menu, select);
  });
  optObserver.observe(select, { childList: true, subtree: true });

  // Watch disabled attribute
  const disabledObserver = new MutationObserver(() => {
    trigger.disabled = select.disabled;
    wrap.classList.toggle('wm-sel--disabled', select.disabled);
  });
  disabledObserver.observe(select, { attributes: true, attributeFilter: ['disabled'] });
}

let _globalObserver: MutationObserver | null = null;

export function initCustomSelects(): void {
  // Upgrade all selects currently in DOM
  document.querySelectorAll<HTMLSelectElement>(`select:not([${UPGRADED}])`).forEach(upgradeSelect);

  // Auto-upgrade selects added later (dynamic panels, settings, etc.)
  if (_globalObserver) return;
  _globalObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLSelectElement) {
          upgradeSelect(node);
        } else if (node instanceof Element) {
          node.querySelectorAll<HTMLSelectElement>(`select:not([${UPGRADED}])`).forEach(upgradeSelect);
        }
      }
    }
  });
  _globalObserver.observe(document.body, { childList: true, subtree: true });
}
