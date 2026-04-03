import type { WeatherAlert } from '@/services/weather';
import { getWeatherEventCategory } from '@/services/weather';
import { WEATHER_CATEGORY_LABELS } from '@/config/map-layer-definitions';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

function severityBadgeClass(severity: WeatherAlert['severity']): string {
  switch (severity) {
    case 'Extreme':  return 'edp-badge edp-badge-severity';
    case 'Severe':   return 'edp-badge edp-badge-warning';
    case 'Moderate': return 'edp-badge edp-badge-tier';
    case 'Minor':    return 'edp-badge';
    default:         return 'edp-badge edp-badge-dim';
  }
}

function formatDate(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

/** Parse NWS "* WHAT...text * WHERE...text" format into labeled sections. */
function parseNWSBullets(text: string): { label: string; body: string }[] {
  const parts = text.split(/\*\s+/).filter(s => s.trim());
  return parts.map(part => {
    const dotIdx = part.indexOf('...');
    if (dotIdx !== -1) {
      return { label: part.slice(0, dotIdx).trim(), body: part.slice(dotIdx + 3).trim() };
    }
    return { label: '', body: part.trim() };
  });
}

export class WeatherAlertRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const alert = data as WeatherAlert;
    const container = ctx.el('div', 'edp-generic');

    // Header
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', alert.event));
    if (alert.areaDesc) {
      header.append(ctx.el('div', 'edp-subtitle', alert.areaDesc));
    }
    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(alert.severity.toUpperCase(), severityBadgeClass(alert.severity)));
    const category = getWeatherEventCategory(alert.event);
    if (category !== 'default') {
      badgeRow.append(ctx.badge(WEATHER_CATEGORY_LABELS[category], 'edp-badge'));
    }
    header.append(badgeRow);
    container.append(header);

    // Description — parsed NWS bullets
    if (alert.description) {
      const bullets = parseNWSBullets(alert.description);
      const bulletsEl = ctx.el('div', 'edp-weather-bullets');
      for (const { label, body } of bullets) {
        const item = ctx.el('div', 'edp-weather-bullet-item');
        if (label) item.append(ctx.el('div', 'edp-weather-bullet-label', label));
        item.append(ctx.el('div', 'edp-weather-bullet-text', body));
        bulletsEl.append(item);
      }
      container.append(bulletsEl);
    }

    // Details card
    const [card, body] = ctx.sectionCard('Details');
    if (alert.headline) body.append(row(ctx, 'Headline', alert.headline));
    body.append(row(ctx, 'Onset', formatDate(alert.onset)));
    body.append(row(ctx, 'Expires', formatDate(alert.expires)));
    container.append(card);

    return container;
  }
}
