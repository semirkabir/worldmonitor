import type { NewsItem } from '@/types';
import type { OrefAlert } from '@/services/oref-alerts';
import { getSourceTier } from '@/config/feeds';

export interface BreakingAlert {
  id: string;
  headline: string;
  source: string;
  link?: string;
  threatLevel: 'critical' | 'high';
  timestamp: Date;
  origin: 'rss_alert' | 'keyword_spike' | 'hotspot_escalation' | 'military_surge' | 'oref_siren';
}

export interface AlertSettings {
  enabled: boolean;
  soundEnabled: boolean;
  desktopNotificationsEnabled: boolean;
  sensitivity: 'critical-only' | 'critical-and-high';
}

const SETTINGS_KEY = 'wm-breaking-alerts-v1';
const DEDUPE_KEY = 'wm-breaking-alerts-dedupe';
const RECENCY_GATE_MS = 15 * 60 * 1000;
const PER_EVENT_COOLDOWN_MS = 30 * 60 * 1000;
const GLOBAL_COOLDOWN_MS = 60 * 1000;
// Suppress RSS-based alerts during initial feed fetch after app load.
// OREF siren alerts bypass this — real-time sirens must never be delayed.
const STARTUP_GRACE_MS = 10 * 1000;

const DEFAULT_SETTINGS: AlertSettings = {
  enabled: true,
  soundEnabled: true,
  desktopNotificationsEnabled: true,
  sensitivity: 'critical-and-high',
};

const dedupeMap = new Map<string, number>();
let lastGlobalAlertMs = 0;
let lastGlobalAlertLevel: 'critical' | 'high' | null = null;
let storageListener: ((e: StorageEvent) => void) | null = null;
let cachedSettings: AlertSettings | null = null;
let initTimestamp = 0;

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, '').trim().slice(0, 80);
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function makeAlertKey(headline: string, source: string, link?: string): string {
  const parts = normalizeTitle(headline) + '|' + source + '|' + extractHostname(link ?? '');
  return simpleHash(parts);
}

// ─── Persist dedup map to localStorage ─────────────────────────────────────
// Prevents the same article from re-firing on every page load/refresh.

function loadDedupeMap(): void {
  try {
    const raw = localStorage.getItem(DEDUPE_KEY);
    if (!raw) return;
    const entries: Array<[string, number]> = JSON.parse(raw);
    const now = Date.now();
    for (const [key, ts] of entries) {
      if (now - ts < PER_EVENT_COOLDOWN_MS) {
        dedupeMap.set(key, ts);
      }
    }
  } catch {}
}

function saveDedupeMap(): void {
  try {
    const entries = [...dedupeMap.entries()];
    localStorage.setItem(DEDUPE_KEY, JSON.stringify(entries));
  } catch {}
}

// ─── Settings ──────────────────────────────────────────────────────────────

export function getAlertSettings(): AlertSettings {
  if (cachedSettings) return cachedSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cachedSettings = { ...DEFAULT_SETTINGS, ...parsed };
      return cachedSettings!;
    }
  } catch {}
  cachedSettings = { ...DEFAULT_SETTINGS };
  return cachedSettings;
}

export function updateAlertSettings(partial: Partial<AlertSettings>): void {
  const current = getAlertSettings();
  const updated = { ...current, ...partial };
  cachedSettings = updated;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch {}
}

// ─── Gate checks ───────────────────────────────────────────────────────────

function isRecent(pubDate: Date): boolean {
  return pubDate.getTime() >= (Date.now() - RECENCY_GATE_MS);
}

function isInStartupGrace(): boolean {
  return initTimestamp > 0 && (Date.now() - initTimestamp) < STARTUP_GRACE_MS;
}

function pruneDedupeMap(): void {
  const now = Date.now();
  for (const [key, ts] of dedupeMap) {
    if (now - ts >= PER_EVENT_COOLDOWN_MS) dedupeMap.delete(key);
  }
}

function isDuplicate(key: string): boolean {
  const lastFired = dedupeMap.get(key);
  if (lastFired === undefined) return false;
  return (Date.now() - lastFired) < PER_EVENT_COOLDOWN_MS;
}

function isGlobalCooldown(candidateLevel: 'critical' | 'high'): boolean {
  if ((Date.now() - lastGlobalAlertMs) >= GLOBAL_COOLDOWN_MS) return false;
  if (candidateLevel === 'critical' && lastGlobalAlertLevel !== 'critical') return false;
  return true;
}

function sendDesktopNotification(alert: BreakingAlert): void {
  const settings = getAlertSettings();
  if (!settings.desktopNotificationsEnabled) return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  // Only notify when tab is hidden
  if (document.visibilityState === 'visible') return;

  const tag = `wm-alert-${alert.id}`;
  const icon = alert.threatLevel === 'critical'
    ? 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect fill="%23ef4444" width="64" height="64" rx="12"/><text x="32" y="44" text-anchor="middle" fill="white" font-size="36">⚠</text></svg>'
    : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect fill="%23f97316" width="64" height="64" rx="12"/><text x="32" y="44" text-anchor="middle" fill="white" font-size="36">!</text></svg>';

  try {
    const n = new Notification(`World Monitor — ${alert.threatLevel.toUpperCase()}`, {
      body: alert.headline,
      tag,
      icon,
      requireInteraction: alert.threatLevel === 'critical',
    });
    if (alert.link) {
      n.onclick = () => { window.focus(); window.open(alert.link, '_blank', 'noopener'); n.close(); };
    } else {
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch { /* mobile Safari, etc. */ }
}

/** Request notification permission if not already granted. Called from settings UI. */
export function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  if (Notification.permission === 'denied') return Promise.resolve('denied');
  return Notification.requestPermission();
}

function dispatchAlert(alert: BreakingAlert): void {
  pruneDedupeMap();
  dedupeMap.set(alert.id, Date.now());
  lastGlobalAlertMs = Date.now();
  lastGlobalAlertLevel = alert.threatLevel;
  saveDedupeMap();
  sendDesktopNotification(alert);
  document.dispatchEvent(new CustomEvent('wm:breaking-news', { detail: alert }));
}

export function checkBatchForBreakingAlerts(items: NewsItem[]): void {
  const settings = getAlertSettings();
  if (!settings.enabled) return;

  // During startup grace period, suppress RSS alerts so the initial feed fetch
  // doesn't surface stale articles as "breaking". Articles with updated pubDate
  // (e.g. CBS "updated 2m ago" on a hours-old story) would otherwise fire every
  // time the app is opened.
  if (isInStartupGrace()) return;

  let best: BreakingAlert | null = null;

  for (const item of items) {
    if (!item.isAlert) continue;
    if (!item.threat) continue;
    if (!isRecent(item.pubDate)) continue;

    const level = item.threat.level;
    if (level !== 'critical' && level !== 'high') continue;
    if (settings.sensitivity === 'critical-only' && level !== 'critical') continue;

    // Tier 3+ sources (think tanks, specialty) need LLM confirmation to fire alerts.
    // Keyword-only "war" matches on analysis articles are too noisy.
    const tier = getSourceTier(item.source);
    if (tier >= 3 && item.threat.source === 'keyword') continue;

    const key = makeAlertKey(item.title, item.source, item.link);
    if (isDuplicate(key)) continue;

    const isBetter = !best
      || (level === 'critical' && best.threatLevel !== 'critical')
      || (level === best.threatLevel && item.pubDate.getTime() > best.timestamp.getTime());

    if (isBetter) {
      best = {
        id: key,
        headline: item.title,
        source: item.source,
        link: item.link,
        threatLevel: level as 'critical' | 'high',
        timestamp: item.pubDate,
        origin: 'rss_alert',
      };
    }
  }

  if (best && !isGlobalCooldown(best.threatLevel)) dispatchAlert(best);
}

export function dispatchOrefBreakingAlert(alerts: OrefAlert[]): void {
  const settings = getAlertSettings();
  if (!settings.enabled || !alerts.length) return;

  const title = alerts[0]?.title || 'Siren alert';
  const allLocations = alerts.flatMap(a => a.data);
  const shown = allLocations.slice(0, 3);
  const overflow = allLocations.length - shown.length;
  const locationSuffix = shown.length
    ? ' — ' + shown.join(', ') + (overflow > 0 ? ` +${overflow} areas` : '')
    : '';
  const headline = title + locationSuffix;

  const keyParts = alerts.map(a => a.id || `${a.cat}|${a.title}|${a.alertDate}`).sort();
  const dedupeKey = 'oref:' + simpleHash(keyParts.join(','));

  if (isDuplicate(dedupeKey)) return;

  dispatchAlert({
    id: dedupeKey,
    headline,
    source: 'OREF Pikud HaOref',
    threatLevel: 'critical',
    timestamp: new Date(),
    origin: 'oref_siren',
  });
}

export function initBreakingNewsAlerts(): void {
  initTimestamp = Date.now();
  loadDedupeMap();
  storageListener = (e: StorageEvent) => {
    if (e.key === SETTINGS_KEY) {
      cachedSettings = null;
    }
  };
  window.addEventListener('storage', storageListener);
}

export function destroyBreakingNewsAlerts(): void {
  if (storageListener) {
    window.removeEventListener('storage', storageListener);
    storageListener = null;
  }
  dedupeMap.clear();
  cachedSettings = null;
  lastGlobalAlertMs = 0;
  lastGlobalAlertLevel = null;
  initTimestamp = 0;
}
