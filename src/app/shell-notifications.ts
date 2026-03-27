import { h } from '@/utils/dom-utils';

export type ShellNotificationTone = 'info' | 'success' | 'warning' | 'error';

export interface ShellConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

const SHELL_TOAST_CLASS = 'wm-shell-toast';
const SHELL_TOAST_VISIBLE_CLASS = 'wm-shell-toast-visible';
const SHELL_CONFIRM_ID = 'wmShellConfirm';

export function showShellNotification(
  message: string,
  tone: ShellNotificationTone = 'info',
  timeoutMs = 2600,
  placement: 'bottom' | 'top' = 'bottom',
): void {
  document.querySelector(`.${SHELL_TOAST_CLASS}`)?.remove();

  const placementClass = placement === 'top' ? `${SHELL_TOAST_CLASS}--top` : '';
  const toast = h('div', {
    className: `${SHELL_TOAST_CLASS} ${SHELL_TOAST_CLASS}--${tone}${placementClass ? ` ${placementClass}` : ''}`,
    role: 'status',
    'aria-live': tone === 'error' ? 'assertive' : 'polite',
  });

  const badge = h('span', { className: 'wm-shell-toast-badge' }, tone.toUpperCase());
  const text = h('span', { className: 'wm-shell-toast-text' }, message);
  toast.append(badge, text);
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add(SHELL_TOAST_VISIBLE_CLASS));

  window.setTimeout(() => {
    toast.classList.remove(SHELL_TOAST_VISIBLE_CLASS);
    window.setTimeout(() => toast.remove(), 220);
  }, timeoutMs);
}

export function confirmShellAction(options: ShellConfirmOptions): Promise<boolean> {
  document.getElementById(SHELL_CONFIRM_ID)?.remove();

  return new Promise((resolve) => {
    const overlay = h('div', {
      className: 'wm-shell-confirm-overlay',
      id: SHELL_CONFIRM_ID,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'wmShellConfirmTitle',
    });

    const close = (accepted: boolean) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(accepted);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      }
    };

    const card = h('div', { className: 'wm-shell-confirm-card' });
    const eyebrow = h(
      'div',
      { className: `wm-shell-confirm-eyebrow${options.danger ? ' danger' : ''}` },
      options.danger ? 'Confirm destructive action' : 'Confirm action',
    );
    const title = h('h3', { className: 'wm-shell-confirm-title', id: 'wmShellConfirmTitle' }, options.title);
    const body = h('p', { className: 'wm-shell-confirm-message' }, options.message);
    const actions = h('div', { className: 'wm-shell-confirm-actions' });
    const cancelBtn = h('button', { className: 'wm-shell-confirm-btn secondary', type: 'button' }, options.cancelLabel ?? 'Cancel');
    const confirmBtn = h(
      'button',
      { className: `wm-shell-confirm-btn primary${options.danger ? ' danger' : ''}`, type: 'button' },
      options.confirmLabel ?? 'Confirm',
    );

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false);
    });

    actions.append(cancelBtn, confirmBtn);
    card.append(eyebrow, title, body, actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
    confirmBtn.focus();
  });
}
