import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

interface RiskFactor {
  name: string;
  score: number;
  trend: 'up' | 'down' | 'flat';
  details: string;
  description: string;
}

export class GeopoliticalRiskPanel extends Panel {
  private globalScore = 0;
  private factors: RiskFactor[] = [];
  private loading = true;

  constructor() {
    super({ id: 'geopolitical-risk', title: '🌐 Geopolitical Risk Index (GRI)' });
    void this.fetchData();
  }

  public async fetchData(): Promise<void> {
    // Simulate complex model processing for the Composite Index
    await new Promise(r => setTimeout(r, 800));
    
    // In a real implementation, this would aggregate real-time instability indexes,
    // conflict intensities, economic shocks, and supply chain disruptions
    // Currently using realistic simulated data points to establish the composite
    
    this.globalScore = 74.5;
    this.factors = [
      { name: 'Major Power Tensions', score: 82, trend: 'up', details: 'US-China tech restrictions, Taiwan Strait military activity', description: 'Risk of direct or proxy conflict between nuclear states.' },
      { name: 'Middle East Escalation', score: 88, trend: 'up', details: 'Red Sea shipping disruptions, proxy engagements', description: 'Regional multi-front conflict involving state and non-state actors.' },
      { name: 'Global Supply Chain', score: 65, trend: 'flat', details: 'Chokepoint rerouting (Suez/Panama), semiconductor bottlenecks', description: 'Vulnerability of critical trade routes and resource availability.' },
      { name: 'Cyber & Infrastructure', score: 71, trend: 'up', details: 'State-sponsored attacks on water/power, ransomware surges', description: 'Threats to critical civilian and military networks.' },
      { name: 'Economic Fragmentation', score: 68, trend: 'down', details: 'Friend-shoring, tariff escalations, BRICS alternatives', description: 'Balkanization of global financial and trade systems.' },
    ];
    
    this.loading = false;
    this.renderPanel();
  }

  private renderPanel(): void {
    if (this.loading) {
      this.showLoading('Calculating Composite Risk Index...');
      return;
    }

    // Determine gauge color based on score (0-100)
    let gaugeColor = '#4caf50'; // Low
    if (this.globalScore >= 80) gaugeColor = '#f44336'; // Critical
    else if (this.globalScore >= 60) gaugeColor = '#ff9800'; // High
    else if (this.globalScore >= 40) gaugeColor = '#ffc107'; // Moderate

    // Create SVG gauge
    const radius = 40;
    const strokeWidth = 10;
    
    // Convert 0-100 to angle (180 to 0) where 100 is far right (red)
    const circumference = Math.PI * radius; // Semi-circle
    const offset = circumference - (this.globalScore / 100) * circumference;
    
    const gaugeSvg = `
      <svg width="180" height="100" viewBox="0 0 100 60" class="gri-gauge-svg">
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="${strokeWidth}" stroke-linecap="round" />
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="${gaugeColor}" stroke-width="${strokeWidth}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" class="gri-gauge-value" />
        <text x="50" y="45" text-anchor="middle" font-size="22" font-weight="bold" fill="var(--text)">${this.globalScore.toFixed(1)}</text>
        <text x="50" y="58" text-anchor="middle" font-size="8" fill="var(--text-dim)">COMPOSITE INDEX</text>
      </svg>
    `;

    const html = `
      <div class="gri-container">
        <div class="gri-header">
          <div class="gri-gauge-wrapper">
            ${gaugeSvg}
          </div>
          <div class="gri-summary">
            <div class="gri-status ${this.globalScore >= 75 ? 'status-critical' : 'status-elevated'}">
              ${this.globalScore >= 75 ? 'CRITICAL RISK' : 'ELEVATED RISK'}
            </div>
            <div class="gri-desc">
              Driven by escalating major power tensions and persistent conflict in key geographic chokepoints.
            </div>
          </div>
        </div>
        
        <div class="gri-factors">
          <div class="gri-factors-title">Key Risk Components</div>
          ${this.factors.map(f => this.renderFactor(f)).join('')}
        </div>
      </div>
    `;

    this.setContent(html);
  }

  private renderFactor(f: RiskFactor): string {
    let colorClass = 'risk-low';
    if (f.score >= 80) colorClass = 'risk-critical';
    else if (f.score >= 60) colorClass = 'risk-high';
    else if (f.score >= 40) colorClass = 'risk-med';

    const trendIconParams = f.trend === 'up' ? 'text-red 📈' : f.trend === 'down' ? 'text-green 📉' : 'text-gray ➖';
    
    return `
      <div class="gri-factor">
        <div class="gri-factor-header">
          <span class="gri-factor-name" title="${escapeHtml(f.description)}">${escapeHtml(f.name)}</span>
          <div class="gri-factor-score">
            <span class="gri-trend" title="Trend: ${f.trend}">${trendIconParams.split(' ')[1]}</span>
            <span class="gri-score-badge ${colorClass}">${f.score}</span>
          </div>
        </div>
        <div class="gri-factor-bar-bg">
          <div class="gri-factor-bar-fg ${colorClass}-bg" style="width: ${f.score}%;"></div>
        </div>
        <div class="gri-factor-details">${escapeHtml(f.details)}</div>
      </div>
    `;
  }
}
