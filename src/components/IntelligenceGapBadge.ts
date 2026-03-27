import { getRecentSignals, type CorrelationSignal } from '@/services/correlation';
import { getRecentAlerts, type UnifiedAlert } from '@/services/cross-module-integration';
import { getAlertSettings, updateAlertSettings } from '@/services/breaking-news-alerts';
import { t } from '@/services/i18n';
import { getSignalContext } from '@/utils/analysis-constants';
import { escapeHtml } from '@/utils/sanitize';
import { trackFindingClicked } from '@/services/analytics';
import { isLoggedIn } from '@/services/user-auth';

const LOW_COUNT_THRESHOLD = 3;
const MAX_VISIBLE_FINDINGS = 10;
const SORT_TIME_TOLERANCE_MS = 60000;
const REFRESH_INTERVAL_MS = 180000;
const ALERT_HOURS = 6;
const STORAGE_KEY = 'worldmonitor-intel-findings';
const POPUP_STORAGE_KEY = 'wm-alert-popup-enabled';
const SOUND_KEY = 'wm-intel-notif-sound';

// Intelligence icon: human head with gear (from Flaticon)
const INTELLIGENCE_ICON = `<img src="/intelligence-icon.png" width="16" height="16" alt="Intelligence" style="vertical-align:middle;filter:invert(1)" />`;

export type NotificationSound = 'beep' | 'bell' | 'chime' | 'ding' | 'none';

export const NOTIFICATION_SOUND_OPTIONS: { value: NotificationSound; label: string }[] = [
  { value: 'beep',  label: '🔈 Short beep' },
  { value: 'bell',  label: '🔔 Bell' },
  { value: 'chime', label: '🎵 Chime' },
  { value: 'ding',  label: '✨ Ding' },
  { value: 'none',  label: '🔇 Silent' },
];

function playNotificationSound(sound: NotificationSound): void {
  if (sound === 'none') return;
  try {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.28, ctx.currentTime);
    master.connect(ctx.destination);

    const schedule = (freq: number, startOffset: number, duration: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
      env.gain.setValueAtTime(0, ctx.currentTime + startOffset);
      env.gain.linearRampToValueAtTime(1, ctx.currentTime + startOffset + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);
      osc.connect(env);
      env.connect(master);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration);
    };

    switch (sound) {
      case 'beep':
        schedule(880, 0, 0.22, 'square');
        break;
      case 'bell':
        schedule(440, 0, 1.2);
        schedule(880, 0, 0.9);
        schedule(1320, 0, 0.6);
        break;
      case 'chime':
        schedule(523.25, 0,    0.35);
        schedule(659.25, 0.18, 0.35);
        schedule(783.99, 0.36, 0.45);
        break;
      case 'ding':
        schedule(1046.5, 0, 0.5);
        schedule(1318.5, 0.02, 0.35);
        break;
    }

    setTimeout(() => ctx.close().catch(() => {}), 2500);
  } catch { /* AudioContext unavailable */ }
}

type FindingSource = 'signal' | 'alert';

interface UnifiedFinding {
  id: string;
  source: FindingSource;
  type: string;
  title: string;
  description: string;
  confidence: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  timestamp: Date;
  original: CorrelationSignal | UnifiedAlert;
}

export class IntelligenceFindingsBadge {
  private badge: HTMLElement;
  private dropdown: HTMLElement;
  private isOpen = false;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private lastFindingCount = 0;
  private onSignalClick: ((signal: CorrelationSignal) => void) | null = null;
  private onAlertClick: ((alert: UnifiedAlert) => void) | null = null;
  private findings: UnifiedFinding[] = [];
  private boundCloseDropdown = () => this.closeDropdown();
  private pendingUpdateFrame = 0;
  private boundUpdate = () => {
    if (this.pendingUpdateFrame) return;
    this.pendingUpdateFrame = requestAnimationFrame(() => {
      this.pendingUpdateFrame = 0;
      this.update();
    });
  };
  private enabled: boolean;
  private popupEnabled: boolean;
  private notificationSound: NotificationSound;
  private contextMenu: HTMLElement | null = null;

  constructor() {
    this.enabled = IntelligenceFindingsBadge.getStoredEnabledState();
    this.popupEnabled = localStorage.getItem(POPUP_STORAGE_KEY) === '1';
    this.notificationSound = (localStorage.getItem(SOUND_KEY) as NotificationSound) || 'beep';

    this.badge = document.createElement('button');
    this.badge.className = 'intel-findings-badge';
    this.badge.title = t('components.intelligenceFindings.badgeTitle');
    this.badge.innerHTML = `<span class="findings-icon">${INTELLIGENCE_ICON}</span><span class="findings-count">0</span>`;

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'intel-findings-dropdown';

    this.badge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isLoggedIn()) {
        import('@/services/auth-modal').then(({ showAuthModal }) => showAuthModal());
        return;
      }
      this.toggleDropdown();
    });

    this.badge.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(e.clientX, e.clientY);
    });

    // Event delegation for finding items, toggle, and "more" link
    this.dropdown.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const toggleAttr = target.closest('[data-toggle]')?.getAttribute('data-toggle');
      if (toggleAttr === 'popup') {
        e.stopPropagation();
        this.popupEnabled = !this.popupEnabled;
        if (this.popupEnabled) {
          localStorage.setItem(POPUP_STORAGE_KEY, '1');
        } else {
          localStorage.removeItem(POPUP_STORAGE_KEY);
        }
        this.renderDropdown();
        return;
      }
      if (toggleAttr === 'breaking-alerts') {
        e.stopPropagation();
        const settings = getAlertSettings();
        updateAlertSettings({ enabled: !settings.enabled });
        this.renderDropdown();
        return;
      }

      // Handle "more findings" click - show all in modal
      if (target.closest('.findings-more')) {
        e.stopPropagation();
        this.showAllFindings();
        this.closeDropdown();
        return;
      }

      // Handle individual finding click
      const item = target.closest('.finding-item');
      if (!item) return;
      e.stopPropagation();
      const id = item.getAttribute('data-finding-id');
      const finding = this.findings.find(f => f.id === id);
      if (!finding) return;

      trackFindingClicked(finding.id, finding.source, finding.type, finding.priority);
      if (finding.source === 'signal' && this.onSignalClick) {
        this.onSignalClick(finding.original as CorrelationSignal);
      } else if (finding.source === 'alert' && this.onAlertClick) {
        this.onAlertClick(finding.original as UnifiedAlert);
      }
      this.closeDropdown();
    });

    // Sound selector change handler
    this.dropdown.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if ((target as HTMLSelectElement).id === 'intel-sound-select') {
        const sound = (target as HTMLSelectElement).value as NotificationSound;
        this.notificationSound = sound;
        if (sound !== 'none') localStorage.setItem(SOUND_KEY, sound);
        else localStorage.removeItem(SOUND_KEY);
        playNotificationSound(sound);
      }
    });

    if (this.enabled) {
      document.addEventListener('click', this.boundCloseDropdown);
      this.mount();
      this.update();
      this.startRefresh();
    }
  }

  public setOnSignalClick(handler: (signal: CorrelationSignal) => void): void {
    this.onSignalClick = handler;
  }

  public setOnAlertClick(handler: (alert: UnifiedAlert) => void): void {
    this.onAlertClick = handler;
  }

  public static getStoredEnabledState(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== 'hidden';
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isPopupEnabled(): boolean {
    return this.popupEnabled;
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;

    if (enabled) {
      localStorage.removeItem(STORAGE_KEY);
      document.addEventListener('click', this.boundCloseDropdown);
      this.mount();
      this.update();
      this.startRefresh();
    } else {
      localStorage.setItem(STORAGE_KEY, 'hidden');
      document.removeEventListener('click', this.boundCloseDropdown);
      document.removeEventListener('wm:intelligence-updated', this.boundUpdate);
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
      this.closeDropdown();
      this.dismissContextMenu();
      this.badge.remove();
    }
  }

  private showContextMenu(x: number, y: number): void {
    this.dismissContextMenu();

    const menu = document.createElement('div');
    menu.className = 'intel-findings-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.innerHTML = `<div class="context-menu-item">${t('components.intelligenceFindings.hideFindings')}</div>`;

    menu.querySelector('.context-menu-item')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setEnabled(false);
      this.dismissContextMenu();
    });

    const dismiss = () => this.dismissContextMenu();
    document.addEventListener('click', dismiss, { once: true });

    this.contextMenu = menu;
    document.body.appendChild(menu);
  }

  private dismissContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
  }

  private mount(): void {
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
      this.badge.appendChild(this.dropdown);
      headerRight.insertBefore(this.badge, headerRight.firstChild);
    }
  }

  private startRefresh(): void {
    document.addEventListener('wm:intelligence-updated', this.boundUpdate);
    this.refreshInterval = setInterval(this.boundUpdate, REFRESH_INTERVAL_MS);
  }

  public update(): void {
    this.findings = this.mergeFindings();
    const count = this.findings.length;

    const countEl = this.badge.querySelector('.findings-count');
    if (countEl) {
      countEl.textContent = String(count);
    }

    // Pulse animation + notification when new findings arrive
    if (count > this.lastFindingCount && this.lastFindingCount > 0) {
      this.badge.classList.add('pulse');
      setTimeout(() => this.badge.classList.remove('pulse'), 1000);
      if (this.popupEnabled && this.findings[0]) {
        playNotificationSound(this.notificationSound);
        this.showNotificationPopup(this.findings[0]);
      }
    }
    this.lastFindingCount = count;

    // Update badge status based on priority
    const hasCritical = this.findings.some(f => f.priority === 'critical');
    const hasHigh = this.findings.some(f => f.priority === 'high' || f.confidence >= 0.7);

    this.badge.classList.remove('status-none', 'status-low', 'status-high');
    if (count === 0) {
      this.badge.classList.add('status-none');
      this.badge.title = t('components.intelligenceFindings.none');
    } else if (hasCritical || hasHigh) {
      this.badge.classList.add('status-high');
      this.badge.title = t('components.intelligenceFindings.reviewRecommended', { count: String(count) });
    } else if (count <= LOW_COUNT_THRESHOLD) {
      this.badge.classList.add('status-low');
      this.badge.title = t('components.intelligenceFindings.count', { count: String(count) });
    } else {
      this.badge.classList.add('status-high');
      this.badge.title = t('components.intelligenceFindings.reviewRecommended', { count: String(count) });
    }

    this.renderDropdown();
  }

  private mergeFindings(): UnifiedFinding[] {
    const signals = getRecentSignals();
    const alerts = getRecentAlerts(ALERT_HOURS);

    const signalFindings: UnifiedFinding[] = signals.map(s => ({
      id: `signal-${s.id}`,
      source: 'signal' as FindingSource,
      type: s.type,
      title: s.title,
      description: s.description,
      confidence: s.confidence,
      priority: s.confidence >= 0.7 ? 'high' as const : s.confidence >= 0.5 ? 'medium' as const : 'low' as const,
      timestamp: s.timestamp,
      original: s,
    }));

    const alertFindings: UnifiedFinding[] = alerts.map(a => ({
      id: `alert-${a.id}`,
      source: 'alert' as FindingSource,
      type: a.type,
      title: a.title,
      description: a.summary,
      confidence: this.priorityToConfidence(a.priority),
      priority: a.priority,
      timestamp: a.timestamp,
      original: a,
    }));

    // Merge and sort by timestamp (newest first), then by priority
    return [...signalFindings, ...alertFindings].sort((a, b) => {
      const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
      if (Math.abs(timeDiff) < SORT_TIME_TOLERANCE_MS) {
        return this.priorityScore(b.priority) - this.priorityScore(a.priority);
      }
      return timeDiff;
    });
  }

  private priorityToConfidence(priority: string): number {
    const map: Record<string, number> = { critical: 95, high: 80, medium: 60, low: 40 };
    return map[priority] ?? 50;
  }

  private priorityScore(priority: string): number {
    const map: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return map[priority] ?? 0;
  }

  private showNotificationPopup(finding: UnifiedFinding): void {
    document.querySelector('.intel-notif-popup')?.remove();

    const priorityColor: Record<string, string> = {
      critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#6b7280',
    };
    const color = priorityColor[finding.priority] ?? '#6b7280';

    const popup = document.createElement('div');
    popup.className = 'intel-notif-popup';
    popup.innerHTML = `
      <div class="intel-notif-header">
        <span class="intel-notif-eyebrow">${INTELLIGENCE_ICON} Intelligence Finding</span>
        <button class="intel-notif-close" aria-label="Dismiss">×</button>
      </div>
      <div class="intel-notif-body">
        <span class="intel-notif-priority" style="background:${color}22;color:${color}">${finding.priority.toUpperCase()}</span>
        <div class="intel-notif-title">${escapeHtml(finding.title)}</div>
        <div class="intel-notif-desc">${escapeHtml(finding.description.slice(0, 100))}${finding.description.length > 100 ? '…' : ''}</div>
        <button class="intel-notif-expand">View details →</button>
      </div>
    `;

    const dismiss = () => {
      popup.classList.add('leaving');
      setTimeout(() => popup.remove(), 240);
    };

    const openPanel = () => {
      dismiss();
      if (finding.source === 'signal' && this.onSignalClick) {
        this.onSignalClick(finding.original as CorrelationSignal);
      } else if (finding.source === 'alert' && this.onAlertClick) {
        this.onAlertClick(finding.original as UnifiedAlert);
      }
    };

    popup.querySelector('.intel-notif-close')!.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });
    popup.querySelector('.intel-notif-expand')!.addEventListener('click', (e) => {
      e.stopPropagation();
      openPanel();
    });

    document.body.appendChild(popup);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        popup.classList.add('visible');
      });
    });
  }

  private renderPopupToggle(): string {
    const label = t('components.intelligenceFindings.popupAlerts');
    const checked = this.popupEnabled;
    const breakingSettings = getAlertSettings();
    const breakingLabel = t('components.intelligenceFindings.breakingAlerts');
    const soundOptions = NOTIFICATION_SOUND_OPTIONS.map(o =>
      `<option value="${o.value}"${o.value === this.notificationSound ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
    ).join('');
    return `<div class="popup-toggle-row" data-toggle="popup">
        <span class="popup-toggle-label">🔔 ${escapeHtml(label)}</span>
        <span class="popup-toggle-switch${checked ? ' on' : ''}"><span class="popup-toggle-knob"></span></span>
      </div>
      <div class="popup-toggle-row popup-sound-row${checked ? '' : ' disabled'}">
        <span class="popup-toggle-label">🎵 Alert sound</span>
        <select class="popup-sound-select" id="intel-sound-select"${checked ? '' : ' disabled'}>
          ${soundOptions}
        </select>
      </div>
      <div class="popup-toggle-row" data-toggle="breaking-alerts">
        <span class="popup-toggle-label">🚨 ${escapeHtml(breakingLabel)}</span>
        <span class="popup-toggle-switch${breakingSettings.enabled ? ' on' : ''}"><span class="popup-toggle-knob"></span></span>
      </div>`;
  }

  private renderDropdown(): void {
    const toggleHtml = this.renderPopupToggle();

    if (this.findings.length === 0) {
      this.dropdown.innerHTML = `
        <div class="findings-header">
          <span class="header-title">${t('components.intelligenceFindings.title')}</span>
          <span class="findings-badge none">${t('components.intelligenceFindings.monitoring')}</span>
        </div>
        ${toggleHtml}
        <div class="findings-content">
          <div class="findings-empty">
            <span class="empty-icon">📡</span>
            <span class="empty-text">${t('components.intelligenceFindings.scanning')}</span>
          </div>
        </div>
      `;
      return;
    }

    const criticalCount = this.findings.filter(f => f.priority === 'critical').length;
    const highCount = this.findings.filter(f => f.priority === 'high' || f.confidence >= 70).length;

    let statusClass = 'moderate';
    let statusText = t('components.intelligenceFindings.detected', { count: String(this.findings.length) });
    if (criticalCount > 0) {
      statusClass = 'critical';
      statusText = t('components.intelligenceFindings.critical', { count: String(criticalCount) });
    } else if (highCount > 0) {
      statusClass = 'high';
      statusText = t('components.intelligenceFindings.highPriority', { count: String(highCount) });
    }

    const findingsHtml = this.findings.slice(0, MAX_VISIBLE_FINDINGS).map(finding => {
      const timeAgo = this.formatTimeAgo(finding.timestamp);
      const icon = this.getTypeIcon(finding.type);
      const priorityClass = finding.priority;
      const insight = this.getInsight(finding);

      return `
        <div class="finding-item ${priorityClass}" data-finding-id="${escapeHtml(finding.id)}">
          <div class="finding-header">
            <span class="finding-type">${icon} ${escapeHtml(finding.title)}</span>
            <span class="finding-confidence ${priorityClass}">${t(`components.intelligenceFindings.priority.${finding.priority}`)}</span>
          </div>
          <div class="finding-description">${escapeHtml(finding.description)}</div>
          <div class="finding-meta">
            <span class="finding-insight">${escapeHtml(insight)}</span>
            <span class="finding-time">${timeAgo}</span>
          </div>
        </div>
      `;
    }).join('');

    const moreCount = this.findings.length - MAX_VISIBLE_FINDINGS;
    this.dropdown.innerHTML = `
      <div class="findings-header">
        <span class="header-title">${t('components.intelligenceFindings.title')}</span>
        <span class="findings-badge ${statusClass}">${statusText}</span>
      </div>
      ${toggleHtml}
      <div class="findings-content">
        <div class="findings-list">
          ${findingsHtml}
        </div>
        ${moreCount > 0 ? `<div class="findings-more">${t('components.intelligenceFindings.more', { count: String(moreCount) })}</div>` : ''}
      </div>
    `;
  }

  private getInsight(finding: UnifiedFinding): string {
    if (finding.source === 'signal') {
      const context = getSignalContext((finding.original as CorrelationSignal).type);
      return (context.actionableInsight ?? '').split('.')[0] || '';
    }
    // For alerts, provide actionable insight based on type and severity
    const alert = finding.original as UnifiedAlert;
    if (alert.type === 'cii_spike') {
      const cii = alert.components.ciiChange;
      if (cii && cii.change >= 30) return t('components.intelligenceFindings.insights.criticalDestabilization');
      if (cii && cii.change >= 20) return t('components.intelligenceFindings.insights.significantShift');
      return t('components.intelligenceFindings.insights.developingSituation');
    }
    if (alert.type === 'convergence') return t('components.intelligenceFindings.insights.convergence');
    if (alert.type === 'cascade') return t('components.intelligenceFindings.insights.cascade');
    return t('components.intelligenceFindings.insights.review');
  }

  private getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      // Correlation signals
      breaking_surge: '🔥',
      silent_divergence: '🔇',
      flow_price_divergence: '📊',
      explained_market_move: '💡',
      prediction_leads_news: '🔮',
      geo_convergence: '🌍',
      hotspot_escalation: '⚠️',
      news_leads_markets: '📰',
      velocity_spike: '📈',
      keyword_spike: '📊',
      convergence: '🔀',
      triangulation: '🔺',
      flow_drop: '⬇️',
      sector_cascade: '🌊',
      // Unified alerts
      cii_spike: '🔴',
      cascade: '⚡',
      composite: '🔗',
    };
    return icons[type] || '📌';
  }

  private formatTimeAgo(date: Date): string {
    const ms = Date.now() - date.getTime();
    if (ms < 60000) return t('components.intelligenceFindings.time.justNow');
    if (ms < 3600000) return t('components.intelligenceFindings.time.minutesAgo', { count: String(Math.floor(ms / 60000)) });
    if (ms < 86400000) return t('components.intelligenceFindings.time.hoursAgo', { count: String(Math.floor(ms / 3600000)) });
    return t('components.intelligenceFindings.time.daysAgo', { count: String(Math.floor(ms / 86400000)) });
  }

  private toggleDropdown(): void {
    this.isOpen = !this.isOpen;
    this.dropdown.classList.toggle('open', this.isOpen);
    this.badge.classList.toggle('active', this.isOpen);
    if (this.isOpen) {
      this.update();
    }
  }

  private closeDropdown(): void {
    this.isOpen = false;
    this.dropdown.classList.remove('open');
    this.badge.classList.remove('active');
  }

  private showAllFindings(): void {
    // Remove any existing panel
    document.getElementById('findings-detail-panel')?.remove();

    // Build panel using DOM methods to avoid full-screen overlay
    const panel = document.createElement('aside');
    panel.id = 'findings-detail-panel';
    panel.className = 'findings-detail-panel';

    const shell = document.createElement('div');
    shell.className = 'findings-detail-shell';

    const header = document.createElement('div');
    header.className = 'findings-detail-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'findings-detail-title';
    titleEl.innerHTML = `${INTELLIGENCE_ICON} ${t('components.intelligenceFindings.all', { count: String(this.findings.length) })}`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'findings-detail-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';

    header.append(titleEl, closeBtn);

    const content = document.createElement('div');
    content.className = 'findings-detail-content';

    // Build finding items
    this.findings.forEach(finding => {
      const timeAgo = this.formatTimeAgo(finding.timestamp);
      const icon = this.getTypeIcon(finding.type);
      const insight = this.getInsight(finding);

      const item = document.createElement('div');
      item.className = `findings-modal-item ${finding.priority}`;
      item.dataset.findingId = finding.id;

      const itemHeader = document.createElement('div');
      itemHeader.className = 'findings-modal-item-header';

      const typeEl = document.createElement('span');
      typeEl.className = 'findings-modal-item-type';
      typeEl.textContent = `${icon} ${finding.title}`;

      const priorityEl = document.createElement('span');
      priorityEl.className = `findings-modal-item-priority ${finding.priority}`;
      priorityEl.textContent = t(`components.intelligenceFindings.priority.${finding.priority}`);

      itemHeader.append(typeEl, priorityEl);

      const desc = document.createElement('div');
      desc.className = 'findings-modal-item-desc';
      desc.textContent = finding.description;

      const meta = document.createElement('div');
      meta.className = 'findings-modal-item-meta';

      const insightEl = document.createElement('span');
      insightEl.className = 'findings-modal-item-insight';
      insightEl.textContent = insight;

      const timeEl = document.createElement('span');
      timeEl.className = 'findings-modal-item-time';
      timeEl.textContent = timeAgo;

      meta.append(insightEl, timeEl);
      item.append(itemHeader, desc, meta);

      item.addEventListener('click', () => {
        trackFindingClicked(finding.id, finding.source, finding.type, finding.priority);
        if (finding.source === 'signal' && this.onSignalClick) {
          this.onSignalClick(finding.original as CorrelationSignal);
          closePanel();
        } else if (finding.source === 'alert' && this.onAlertClick) {
          this.onAlertClick(finding.original as UnifiedAlert);
          closePanel();
        }
      });

      content.appendChild(item);
    });

    shell.append(header, content);
    panel.appendChild(shell);

    const closePanel = () => {
      panel.classList.remove('active');
      setTimeout(() => panel.remove(), 300);
      document.removeEventListener('keydown', onEsc);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    closeBtn.addEventListener('click', closePanel);
    document.addEventListener('keydown', onEsc);

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('active'));
  }

  public destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    if (this.pendingUpdateFrame) {
      cancelAnimationFrame(this.pendingUpdateFrame);
    }
    document.removeEventListener('wm:intelligence-updated', this.boundUpdate);
    document.removeEventListener('click', this.boundCloseDropdown);
    this.badge.remove();
  }
}

// Re-export with old name for backwards compatibility
export { IntelligenceFindingsBadge as IntelligenceGapBadge };
