import type { PanelConfig } from '@/types';
import { isDesktopRuntime } from '@/services/runtime';

export const LIMITED_LOCAL_RPC_DEV_MODE = import.meta.env.DEV && !isDesktopRuntime();

const DISABLED_PANEL_KEYS = new Set([
  'markets-news', 'finance',
  'economic-calendar', 'sanctions-tracker',
  'geopolitical-risk', 'trade-flows', 'earnings-calendar', 'ipo-calendar', 'insider-trading', 'social-sentiment',
  'options-chain', 'portfolio-tracker', 'trade-policy', 'supply-chain', 'forex', 'bonds', 'centralbanks',
  'derivatives', 'fintech', 'regulation', 'institutional', 'analysis', 'gcc-investments', 'gccNews',
  'service-status', 'tech-readiness', 'events', 'ucdp-events', 'displacement', 'climate', 'giving', 'airline-intel',
]);

const DISABLED_TASKS = new Set([
  'pizzint', 'spending', 'tradePolicy', 'supplyChain', 'giving', 'intelligence',
  'techEvents', 'temporalBaseline',
]);

export function applyLocalDevPanelStability(panels: Record<string, PanelConfig>): Record<string, PanelConfig> {
  if (!LIMITED_LOCAL_RPC_DEV_MODE) return panels;
  return Object.fromEntries(
    Object.entries(panels).map(([key, config]) => [key, DISABLED_PANEL_KEYS.has(key) ? { ...config, enabled: false } : config]),
  );
}

export function enforceLocalDevPanelStability(panelSettings: Record<string, PanelConfig>): Record<string, PanelConfig> {
  if (!LIMITED_LOCAL_RPC_DEV_MODE) return panelSettings;
  for (const key of DISABLED_PANEL_KEYS) {
    const current = panelSettings[key];
    if (current) panelSettings[key] = { ...current, enabled: false };
  }
  return panelSettings;
}

export function isLocalDevTaskEnabled(taskName: string): boolean {
  return !LIMITED_LOCAL_RPC_DEV_MODE || !DISABLED_TASKS.has(taskName);
}

export function isIntelligenceRpcAvailable(): boolean {
  return !LIMITED_LOCAL_RPC_DEV_MODE;
}
