import { Panel } from './Panel';
import type { SolarWeatherSnapshot } from '@/services/solar-weather';
import { escapeHtml } from '@/utils/sanitize';

function getKpSeverity(kp: number): 'low' | 'medium' | 'high' | 'critical' {
  if (kp >= 7) return 'critical';
  if (kp >= 5) return 'high';
  if (kp >= 4) return 'medium';
  return 'low';
}

function getImpactText(kp: number): string {
  if (kp >= 7) return 'Geomagnetic storm. GPS, HF radio, and satellite operations may be disrupted.';
  if (kp >= 5) return 'Minor-to-moderate storm. GPS accuracy and HF radio propagation may degrade.';
  if (kp >= 4) return 'Active conditions. High-latitude aurora and minor infrastructure effects possible.';
  return 'Quiet-to-unsettled conditions.';
}

export class SolarWeatherPanel extends Panel {
  private snapshot: SolarWeatherSnapshot | null = null;

  constructor() {
    super({ id: 'solar-weather', title: 'Solar Weather' });
    this.showLoading('Loading solar weather...');
  }

  public setData(snapshot: SolarWeatherSnapshot): void {
    this.snapshot = snapshot;
    this.render();
  }

  private render(): void {
    if (!this.snapshot) {
      this.showEmptyState('No solar weather data available');
      return;
    }

    const kpSeverity = getKpSeverity(this.snapshot.kpIndex);
    const alertsHtml = this.snapshot.alerts.length > 0
      ? this.snapshot.alerts.slice(0, 5).map(alert => `
        <div class="trade-restriction-card">
          <div class="trade-restriction-header">
            <span class="trade-country">${escapeHtml(alert.headline)}</span>
            <span class="trade-badge">${escapeHtml(alert.productId)}</span>
          </div>
          <div class="trade-restriction-body">
            <div class="trade-description">${escapeHtml(new Date(alert.issuedAt).toLocaleString())}</div>
          </div>
        </div>
      `).join('')
      : '<div class="economic-empty">No active NOAA alerts.</div>';

    this.setContent(`
      <div class="economic-content">
        <div class="trade-restriction-card">
          <div class="trade-restriction-header">
            <span class="trade-country">Planetary Kp</span>
            <span class="trade-badge">${this.snapshot.kpIndex.toFixed(1)}</span>
            <span class="trade-status status-${kpSeverity}">${kpSeverity}</span>
          </div>
          <div class="trade-restriction-body">
            <div class="trade-description">${escapeHtml(getImpactText(this.snapshot.kpIndex))}</div>
            <div class="trade-affected">Solar wind: ${this.snapshot.solarWindSpeed?.toFixed(0) ?? 'n/a'} km/s · Plasma density: ${this.snapshot.plasmaDensity?.toFixed(1) ?? 'n/a'} p/cc</div>
          </div>
        </div>
        <div class="trade-restrictions-list">${alertsHtml}</div>
      </div>
    `);
  }
}
