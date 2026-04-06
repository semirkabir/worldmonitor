import type { Command } from '@/config/commands';
import type { SearchResultType } from '@/components/SearchModal';

export function describeCommandAction(command: Command): string {
  if (command.id.startsWith('nav:')) return 'Refocus the map on this region';
  if (command.id.startsWith('country:')) return 'Open the country briefing';
  if (command.id.startsWith('country-map:')) return 'Center the map on this country';
  if (command.id.startsWith('panel:')) return 'Jump to this panel';
  if (command.id.startsWith('layer:')) return 'Toggle this map layer';
  if (command.id.startsWith('layers:')) return 'Apply a layer preset';
  if (command.id.startsWith('view:')) return 'Change the current view';
  if (command.id.startsWith('time:')) return 'Update the map time window';
  return 'Run this command';
}

export function getSearchResultActionLabel(type: SearchResultType): string {
  const labels: Record<SearchResultType, string> = {
    country: 'Open country briefing',
    news: 'Jump to matching coverage',
    hotspot: 'Focus this map hotspot',
    market: 'Jump to markets panel',
    prediction: 'Open market details',
    conflict: 'Focus this conflict zone',
    base: 'Focus this base on the map',
    pipeline: 'Open pipeline on the map',
    cable: 'Open cable on the map',
    datacenter: 'Open data center on the map',
    earthquake: 'Inspect on the map',
    outage: 'Inspect on the map',
    nuclear: 'Focus this facility',
    irradiator: 'Focus this site',
    techcompany: 'Focus company location',
    ailab: 'Focus lab location',
    startup: 'Focus startup ecosystem',
    techevent: 'Inspect upcoming event',
    techhq: 'Inspect HQ location',
    accelerator: 'Inspect accelerator',
    exchange: 'Inspect exchange location',
    financialcenter: 'Inspect financial hub',
    centralbank: 'Inspect central bank',
    commodityhub: 'Inspect commodity hub',
    company: 'Open company detail panel',
    marketplace: 'Open marketplace dataset panel',
  };
  return labels[type];
}

export function getQuickActionCommandIds(variant: string): string[] {
  switch (variant) {
    case 'tech':
      return ['nav:global', 'panel:tech', 'layers:infra', 'time:24h', 'view:fullscreen', 'view:settings'];
    case 'finance':
      return ['nav:global', 'panel:markets', 'layers:finance', 'time:24h', 'view:fullscreen', 'view:settings'];
    case 'happy':
      return ['nav:global', 'view:refresh', 'time:24h', 'view:fullscreen', 'view:settings'];
    case 'commodity':
      return ['nav:global', 'panel:commodities', 'layers:infra', 'time:24h', 'view:fullscreen', 'view:settings'];
    default:
      return ['nav:global', 'layers:intel', 'layers:military', 'time:24h', 'view:fullscreen', 'view:settings'];
  }
}
