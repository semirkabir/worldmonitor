/**
 * Notification Center — bell icon + dropdown feed of signals, alerts, data events.
 * Listens for wm:breaking-news, polls signalAggregator, and tracks
 * intelligence updates to build a chronological activity feed.
 */

import { signalAggregator, type SignalType } from '@/services/signal-aggregator';
import type { BreakingAlert } from '@/services/breaking-news-alerts';
import { requestNotificationPermission, getAlertSettings } from '@/services/breaking-news-alerts';
import { getRecentSignals, type CorrelationSignal } from '@/services/correlation';
import { getRecentAlerts, type UnifiedAlert } from '@/services/cross-module-integration';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NotificationItem {
  id: string;
  kind: 'signal' | 'breaking' | 'intel' | 'finding';
  title: string;
  detail?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  signalType?: SignalType;
  country?: string;
  lat?: number;
  lon?: number;
  link?: string;
  timestamp: number;
  read: boolean;
  originalSignal?: CorrelationSignal;
  originalAlert?: UnifiedAlert;
}

const STORAGE_KEY = 'wm-notif-center-v1';
const MAX_ITEMS = 200;
const POLL_INTERVAL_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SIGNAL_ICONS: Record<SignalType, string> = {
  internet_outage: '🌐',
  military_flight: '✈️',
  military_vessel: '🚢',
  protest: '📢',
  ais_disruption: '📡',
  satellite_fire: '🔥',
  temporal_anomaly: '📊',
  active_strike: '💥',
  supplemental: '🧩',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function severityClass(s: string): string {
  switch (s) {
    case 'critical': return 'notif-critical';
    case 'high': return 'notif-high';
    case 'medium': return 'notif-medium';
    default: return 'notif-low';
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export class NotificationCenter {
  private el: HTMLElement;
  private badgeEl: HTMLElement;
  private dropdownEl: HTMLElement;
  private listEl: HTMLElement;
  private bannerEl: HTMLElement;
  private items: NotificationItem[] = [];
  private seenSignalIds = new Set<string>();
  private seenFindingIds = new Set<string>();
  private open = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onLocClick: ((lat: number, lon: number) => void) | null = null;
  private onFindingClick: ((signal: CorrelationSignal) => void) | null = null;
  private onAlertClick: ((alert: UnifiedAlert) => void) | null = null;
  private permissionRequested = false;
  private audio: HTMLAudioElement | null = null;
  private lastSoundMs = 0;
  private activeBanners: NotificationItem[] = [];
  private readonly SOUND_COOLDOWN_MS = 5 * 60 * 1000;
  private readonly BANNER_DISMISS_MS = 60_000;

  /* ---- lifecycle ---- */

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'notif-center';

    // Bell button
    const btn = document.createElement('button');
    btn.className = 'notif-bell-btn';
    btn.title = 'Activity';
    btn.innerHTML = '💻';
    btn.addEventListener('click', () => this.toggle());
    this.el.appendChild(btn);

    // Badge
    this.badgeEl = document.createElement('span');
    this.badgeEl.className = 'notif-badge';
    this.badgeEl.style.display = 'none';
    btn.appendChild(this.badgeEl);

    // Dropdown
    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'notif-dropdown';
    this.dropdownEl.style.display = 'none';

    // Dropdown header - just the mark all button
    const hdr = document.createElement('div');
    hdr.className = 'notif-dropdown-header';
    const markAllBtn = document.createElement('button');
    markAllBtn.className = 'notif-mark-all';
    markAllBtn.title = 'Mark all read';
    markAllBtn.textContent = '✓';
    markAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.markAllRead();
    });
    hdr.appendChild(markAllBtn);
    this.dropdownEl.appendChild(hdr);

    // List
    this.listEl = document.createElement('div');
    this.listEl.className = 'notif-list';
    this.dropdownEl.appendChild(this.listEl);

    // Banner area for breaking alerts
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'notif-banners';
    this.bannerEl.style.display = 'none';
    this.dropdownEl.appendChild(this.bannerEl);

    // Empty state
    const empty = document.createElement('div');
    empty.className = 'notif-empty';
    empty.textContent = 'No notifications yet';
    this.listEl.appendChild(empty);

    this.el.appendChild(this.dropdownEl);

    // Initialize audio for breaking alerts
    this.initAudio();

    // Load persisted state
    this.loadState();

    // Event listeners
    document.addEventListener('wm:breaking-news', this.onBreaking as EventListener);
    document.addEventListener('wm:intelligence-updated', this.onIntelUpdate);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('click', this.onDocClick);

    // Start polling signal aggregator
    this.pollTimer = setInterval(() => {
      this.pollSignals();
      this.pollFindings();
    }, POLL_INTERVAL_MS);
    // Initial poll after a short delay to let data load
    setTimeout(() => {
      this.pollSignals();
      this.pollFindings();
    }, 5_000);
  }

  mount(parent: HTMLElement, before?: HTMLElement | null): void {
    if (before && before.parentElement === parent) {
      parent.insertBefore(this.el, before);
      return;
    }
    parent.appendChild(this.el);
  }

  destroy(): void {
    document.removeEventListener('wm:breaking-news', this.onBreaking as EventListener);
    document.removeEventListener('wm:intelligence-updated', this.onIntelUpdate);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('click', this.onDocClick);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.el.remove();
  }

  setLocationClickHandler(handler: (lat: number, lon: number) => void): void {
    this.onLocClick = handler;
  }

  setFindingClickHandler(handler: (signal: CorrelationSignal) => void): void {
    this.onFindingClick = handler;
  }

  setAlertClickHandler(handler: (alert: UnifiedAlert) => void): void {
    this.onAlertClick = handler;
  }

  /* ---- audio ---- */

  private initAudio(): void {
    this.audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQYjfKapmWswEjCJvuPQfSoXZZ+3qqBJESSP0unGaxMJVYiytrFeLhR6p8znrFUXRW+bs7V3Qx1hn8Xjp1cYPnegprhkMCFmoLi1k0sZTYGlqqlUIA==');
    this.audio.volume = 0.3;
  }

  private playSound(): void {
    const settings = getAlertSettings();
    if (!settings.soundEnabled || !this.audio) return;
    if (Date.now() - this.lastSoundMs < this.SOUND_COOLDOWN_MS) return;
    this.audio.currentTime = 0;
    this.audio.play()?.catch(() => {});
    this.lastSoundMs = Date.now();
  }

  /* ---- banners ---- */

  private showBannerAlert(item: NotificationItem): void {
    if (this.activeBanners.some(b => b.id === item.id)) return;
    if (this.activeBanners.length >= 3) {
      const oldest = this.activeBanners.shift();
      if (oldest) this.removeBannerElement(oldest.id);
    }

    this.activeBanners.push(item);
    this.renderBanners();
    this.updateBadge();

    setTimeout(() => this.dismissBanner(item.id), this.BANNER_DISMISS_MS);
  }

  private dismissBanner(id: string): void {
    const idx = this.activeBanners.findIndex(b => b.id === id);
    if (idx !== -1) {
      this.activeBanners.splice(idx, 1);
      this.removeBannerElement(id);
      this.renderBanners();
    }
  }

  private removeBannerElement(id: string): void {
    const existing = this.bannerEl.querySelector(`[data-banner-id="${id}"]`);
    if (existing) existing.remove();
  }

  private renderBanners(): void {
    this.bannerEl.replaceChildren();
    if (this.activeBanners.length === 0) {
      this.bannerEl.style.display = 'none';
      return;
    }
    this.bannerEl.style.display = '';

    for (const item of this.activeBanners) {
      const banner = document.createElement('div');
      banner.className = `notif-banner ${item.severity === 'critical' ? 'critical' : 'high'}`;
      banner.dataset.bannerId = item.id;

      const icon = document.createElement('span');
      icon.className = 'notif-banner-icon';
      icon.textContent = '🚨';

      const content = document.createElement('div');
      content.className = 'notif-banner-content';

      const title = document.createElement('div');
      title.className = 'notif-banner-title';
      title.textContent = item.title;

      const source = document.createElement('div');
      source.className = 'notif-banner-source';
      source.textContent = item.detail || '';

      content.appendChild(title);
      content.appendChild(source);

      const dismiss = document.createElement('button');
      dismiss.className = 'notif-banner-dismiss';
      dismiss.textContent = '×';
      dismiss.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dismissBanner(item.id);
      });

      banner.appendChild(icon);
      banner.appendChild(content);
      banner.appendChild(dismiss);

      banner.addEventListener('click', () => {
        this.markRead(item.id);
        if (item.link) {
          window.open(item.link, '_blank', 'noopener');
        }
        this.dismissBanner(item.id);
      });

      this.bannerEl.appendChild(banner);
    }
  }

  /* ---- toggle ---- */

  private toggle(): void {
    this.open ? this.close() : this.show();
  }

  private show(): void {
    // Request desktop notification permission on first interaction
    if (!this.permissionRequested) {
      this.permissionRequested = true;
      requestNotificationPermission();
    }
    this.open = true;
    this.dropdownEl.style.display = '';
    this.renderList();
    requestAnimationFrame(() => this.dropdownEl.classList.add('active'));
  }

  private close(): void {
    this.open = false;
    this.dropdownEl.classList.remove('active');
    setTimeout(() => { if (!this.open) this.dropdownEl.style.display = 'none'; }, 200);
  }

  /* ---- event handlers ---- */

  private onBreaking = (e: CustomEvent<BreakingAlert>): void => {
    const alert = e.detail;
    const item: NotificationItem = {
      id: `brk-${alert.id}`,
      kind: 'breaking',
      title: alert.headline,
      detail: alert.source,
      severity: alert.threatLevel,
      link: alert.link,
      timestamp: alert.timestamp.getTime(),
      read: false,
    };
    this.addItem(item);
    this.playSound();
    if (alert.threatLevel === 'critical' || alert.threatLevel === 'high') {
      this.showBannerAlert(item);
    }
  };

  private onIntelUpdate = (): void => {
    this.addItem({
      id: `intel-${Date.now()}`,
      kind: 'intel',
      title: 'Intelligence assessment updated',
      severity: 'medium',
      timestamp: Date.now(),
      read: false,
    });
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.open) {
      e.stopPropagation();
      this.close();
    }
  };

  private onDocClick = (e: MouseEvent): void => {
    if (this.open && !this.el.contains(e.target as Node)) {
      this.close();
    }
  };

  /* ---- signal polling ---- */

  private pollSignals(): void {
    const summary = signalAggregator.getSummary();
    if (summary.totalSignals === 0) return;

    for (const cluster of summary.topCountries) {
      for (const sig of cluster.signals) {
        const sigId = `sig-${sig.type}-${sig.country}-${sig.timestamp.getTime()}`;
        if (this.seenSignalIds.has(sigId)) continue;
        this.seenSignalIds.add(sigId);

        this.addItem({
          id: sigId,
          kind: 'signal',
          title: sig.title,
          detail: sig.countryName,
          severity: sig.severity,
          signalType: sig.type,
          country: sig.country,
          lat: sig.lat,
          lon: sig.lon,
          timestamp: sig.timestamp.getTime(),
          read: false,
        });
      }
    }
  }

  /* ---- intelligence findings polling ---- */

  private pollFindings(): void {
    const signals = getRecentSignals();
    const alerts = getRecentAlerts(6);

    for (const sig of signals) {
      const sigId = `finding-signal-${sig.id}`;
      if (this.seenFindingIds.has(sigId)) continue;
      this.seenFindingIds.add(sigId);

      this.addItem({
        id: sigId,
        kind: 'finding',
        title: sig.title,
        detail: sig.description?.slice(0, 100) || sig.type,
        severity: sig.confidence >= 0.7 ? 'high' : sig.confidence >= 0.5 ? 'medium' : 'low',
        timestamp: sig.timestamp.getTime(),
        read: false,
        originalSignal: sig,
      });
    }

    for (const alert of alerts) {
      const alertId = `finding-alert-${alert.id}`;
      if (this.seenFindingIds.has(alertId)) continue;
      this.seenFindingIds.add(alertId);

      this.addItem({
        id: alertId,
        kind: 'finding',
        title: alert.title,
        detail: alert.summary?.slice(0, 100) || alert.type,
        severity: alert.priority,
        timestamp: alert.timestamp.getTime(),
        read: false,
        originalAlert: alert,
      });
    }
  }

  /* ---- items ---- */

  private addItem(item: NotificationItem): void {
    if (this.items.some(i => i.id === item.id)) return;
    this.items.unshift(item);
    if (this.items.length > MAX_ITEMS) this.items.length = MAX_ITEMS;
    this.updateBadge();
    if (this.open) this.renderList();
    this.saveState();
  }

  private markAllRead(): void {
    for (const item of this.items) item.read = true;
    this.updateBadge();
    if (this.open) this.renderList();
    this.saveState();
  }

  private markRead(id: string): void {
    const item = this.items.find(i => i.id === id);
    if (item && !item.read) {
      item.read = true;
      this.updateBadge();
      this.saveState();
    }
  }

  /* ---- badge ---- */

  private updateBadge(): void {
    const unread = this.items.filter(i => !i.read).length;
    if (unread > 0) {
      this.badgeEl.textContent = unread > 99 ? '99+' : String(unread);
      this.badgeEl.style.display = '';
    } else {
      this.badgeEl.style.display = 'none';
    }
  }

  /* ---- render ---- */

  private renderList(): void {
    if (this.items.length === 0) {
      this.listEl.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'notif-empty';
      empty.textContent = 'No notifications yet';
      this.listEl.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();

    for (const item of this.items.slice(0, 50)) {
      const row = document.createElement('div');
      row.className = `notif-item ${severityClass(item.severity)} ${item.read ? 'read' : 'unread'}`;
      row.dataset.id = item.id;

      const icon = item.kind === 'breaking' ? '🚨'
        : item.kind === 'intel' ? '🧠'
        : item.kind === 'finding' ? '🎯'
        : item.signalType ? (SIGNAL_ICONS[item.signalType] ?? '📌')
        : '📌';

      // Build row with safe DOM methods
      const iconSpan = document.createElement('span');
      iconSpan.className = 'notif-icon';
      iconSpan.textContent = icon;

      const body = document.createElement('div');
      body.className = 'notif-body';
      const titleDiv = document.createElement('div');
      titleDiv.className = 'notif-title';
      titleDiv.textContent = item.title;
      body.appendChild(titleDiv);
      if (item.detail) {
        const detailDiv = document.createElement('div');
        detailDiv.className = 'notif-detail';
        detailDiv.textContent = item.detail;
        body.appendChild(detailDiv);
      }

      const timeSpan = document.createElement('span');
      timeSpan.className = 'notif-time';
      timeSpan.textContent = timeAgo(item.timestamp);

      row.appendChild(iconSpan);
      row.appendChild(body);
      row.appendChild(timeSpan);

      row.addEventListener('click', () => {
        this.markRead(item.id);
        row.classList.remove('unread');
        row.classList.add('read');

        if (item.kind === 'finding') {
          if (item.originalSignal && this.onFindingClick) {
            this.onFindingClick(item.originalSignal);
            this.close();
          } else if (item.originalAlert && this.onAlertClick) {
            this.onAlertClick(item.originalAlert);
            this.close();
          }
        } else if (item.lat != null && item.lon != null && this.onLocClick) {
          this.onLocClick(item.lat, item.lon);
          this.close();
        } else if (item.link) {
          window.open(item.link, '_blank', 'noopener');
        }
      });

      frag.appendChild(row);
    }

    this.listEl.replaceChildren(frag);
  }

  /* ---- persistence ---- */

  private saveState(): void {
    try {
      const data = {
        items: this.items.slice(0, MAX_ITEMS),
        seenIds: [...this.seenSignalIds].slice(-500),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* quota */ }
  }

  private loadState(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.items)) {
        this.items = data.items;
      }
      if (Array.isArray(data.seenIds)) {
        this.seenSignalIds = new Set(data.seenIds);
      }
      // Prune items older than 24h
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      this.items = this.items.filter(i => i.timestamp > cutoff);
      this.updateBadge();
    } catch { /* corrupt */ }
  }
}
