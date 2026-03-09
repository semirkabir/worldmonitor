/**
 * Notification Center — bell icon + dropdown feed of signals, alerts, data events.
 * Listens for wm:breaking-news, polls signalAggregator, and tracks
 * intelligence updates to build a chronological activity feed.
 */

import { signalAggregator, type SignalType } from '@/services/signal-aggregator';
import type { BreakingAlert } from '@/services/breaking-news-alerts';
import { requestNotificationPermission } from '@/services/breaking-news-alerts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NotificationItem {
  id: string;
  kind: 'signal' | 'breaking' | 'intel';
  title: string;
  detail?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  signalType?: SignalType;
  country?: string;
  lat?: number;
  lon?: number;
  link?: string;
  timestamp: number;           // epoch ms
  read: boolean;
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
  private items: NotificationItem[] = [];
  private seenSignalIds = new Set<string>();
  private open = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onLocClick: ((lat: number, lon: number) => void) | null = null;
  private permissionRequested = false;

  /* ---- lifecycle ---- */

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'notif-center';

    // Bell button
    const btn = document.createElement('button');
    btn.className = 'notif-bell-btn';
    btn.title = 'Notifications';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>';
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

    // Dropdown header (safe static content)
    const hdr = document.createElement('div');
    hdr.className = 'notif-dropdown-header';
    const hdrTitle = document.createElement('span');
    hdrTitle.className = 'notif-dropdown-title';
    hdrTitle.textContent = 'Activity Feed';
    hdr.appendChild(hdrTitle);
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

    // Empty state
    const empty = document.createElement('div');
    empty.className = 'notif-empty';
    empty.textContent = 'No notifications yet';
    this.listEl.appendChild(empty);

    this.el.appendChild(this.dropdownEl);

    // Load persisted state
    this.loadState();

    // Event listeners
    document.addEventListener('wm:breaking-news', this.onBreaking as EventListener);
    document.addEventListener('wm:intelligence-updated', this.onIntelUpdate);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('click', this.onDocClick);

    // Start polling signal aggregator
    this.pollTimer = setInterval(() => this.pollSignals(), POLL_INTERVAL_MS);
    // Initial poll after a short delay to let data load
    setTimeout(() => this.pollSignals(), 5_000);
  }

  mount(parent: HTMLElement): void {
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
    this.addItem({
      id: `brk-${alert.id}`,
      kind: 'breaking',
      title: alert.headline,
      detail: alert.source,
      severity: alert.threatLevel,
      link: alert.link,
      timestamp: alert.timestamp.getTime(),
      read: false,
    });
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

        if (item.lat != null && item.lon != null && this.onLocClick) {
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
