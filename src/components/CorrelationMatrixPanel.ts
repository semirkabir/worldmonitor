import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

interface AssetCorrelation {
  id: string;
  name: string;
  symbol: string;
  correlations: Record<string, number>;
}

export class CorrelationMatrixPanel extends Panel {
  private assets: AssetCorrelation[] = [];
  private loading = true;
  private timeframe: '1D' | '1W' | '1M' | 'YTD' = '1M';

  constructor() {
    super({ id: 'correlation-matrix', title: '🔗 Correlation Matrix' });
    this.content.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.classList.contains('matrix-timeframe')) {
        this.timeframe = target.value as any;
        this.loading = true;
        this.renderPanel();
        void this.fetchData();
      }
    });

    void this.fetchData();
  }

  public async fetchData(): Promise<void> {
    await new Promise(r => setTimeout(r, 600)); // Simulate calculation

    // Generate realistic cross-asset correlations (simulated)
    // 1.0 = Perfect positive, -1.0 = Perfect negative, 0.0 = Uncorrelated
    
    // Base standard template depending on timeframe
    const baseMult = this.timeframe === '1M' ? 1.0 : this.timeframe === '1W' ? 0.7 : this.timeframe === 'YTD' ? 0.9 : 0.5;

    // A helper to clamp between -1 and 1
    const cl = (v: number) => Math.max(-1, Math.min(1, v));
    
    // Simulate typical correlations: SPY/BTC positive, SPY/GLD slightly positive, SPY/DXY negative, SPY/VIX highly negative, OIL/DXY negative
    const btc_spy = cl(0.65 * baseMult);
    const gld_spy = cl(0.15 * baseMult);
    const dxy_spy = cl(-0.45 * baseMult);
    const vix_spy = cl(-0.85 * baseMult);
    const oil_spy = cl(0.30 * baseMult);
    
    const dxy_gld = cl(-0.75 * baseMult);
    const dxy_btc = cl(-0.55 * baseMult);
    const vix_btc = cl(-0.60 * baseMult);
    
    const oil_dxy = cl(-0.35 * baseMult);
    const gld_btc = cl(0.20 * baseMult);

    this.assets = [
      { id: 'spy', name: 'S&P 500', symbol: 'SPY', correlations: { spy: 1, btc: btc_spy, gld: gld_spy, dxy: dxy_spy, vix: vix_spy, oil: oil_spy } },
      { id: 'btc', name: 'Bitcoin', symbol: 'BTC', correlations: { spy: btc_spy, btc: 1, gld: gld_btc, dxy: dxy_btc, vix: vix_btc, oil: cl(0.15 * baseMult) } },
      { id: 'gld', name: 'Gold', symbol: 'GLD', correlations: { spy: gld_spy, btc: gld_btc, gld: 1, dxy: dxy_gld, vix: cl(0.25 * baseMult), oil: cl(0.40 * baseMult) } },
      { id: 'dxy', name: 'US Dollar', symbol: 'DXY', correlations: { spy: dxy_spy, btc: dxy_btc, gld: dxy_gld, dxy: 1, vix: cl(0.35 * baseMult), oil: oil_dxy } },
      { id: 'vix', name: 'Volatility', symbol: 'VIX', correlations: { spy: vix_spy, btc: vix_btc, gld: cl(0.25 * baseMult), dxy: cl(0.35 * baseMult), vix: 1, oil: cl(-0.20 * baseMult) } },
      { id: 'oil', name: 'Crude Oil', symbol: 'USO', correlations: { spy: oil_spy, btc: cl(0.15 * baseMult), gld: cl(0.40 * baseMult), dxy: oil_dxy, vix: cl(-0.20 * baseMult), oil: 1 } },
    ];

    this.loading = false;
    this.renderPanel();
  }

  private getColor(val: number): string {
    // Red for negative (-1), Gray for zero (0), Green for positive (1)
    if (val === 1) return 'rgba(30,30,30,0.4)'; // Self
    if (val > 0) {
      const alpha = Math.min(0.9, val * 1.2);
      return `rgba(68, 255, 136, ${alpha})`; // Green
    } else if (val < 0) {
      const alpha = Math.min(0.9, Math.abs(val) * 1.2);
      return `rgba(255, 68, 68, ${alpha})`; // Red
    }
    return 'rgba(128,128,128,0.1)';
  }

  private renderPanel(): void {
    if (this.loading) {
      this.showLoading('Calculating cross-asset correlations...');
      return;
    }

    const labels = this.assets.map(a => a.symbol);
    
    // Header row
    let tableHtml = '<div class="matrix-grid">';
    
    // Top-left corner empty
    tableHtml += `<div class="matrix-cell matrix-header corner"></div>`;
    
    // Top headers
    for (const label of labels) {
      tableHtml += `<div class="matrix-cell matrix-header top-header">${escapeHtml(label)}</div>`;
    }

    // Rows
    for (let r = 0; r < this.assets.length; r++) {
      const rowAsset = this.assets[r]!;
      // Left header
      tableHtml += `<div class="matrix-cell matrix-header left-header" title="${escapeHtml(rowAsset.name)}">${escapeHtml(rowAsset.symbol)}</div>`;
      
      // Data cells
      for (let c = 0; c < this.assets.length; c++) {
        const colAsset = this.assets[c]!;
        const val = rowAsset.correlations[colAsset.id] || 0;
        
        let displayVal = val.toFixed(2);
        if (r === c) displayVal = '-';
        
        const style = r === c ? 'background: var(--surface-hover); color: var(--text-dim);' : `background: ${this.getColor(val)}; color: ${Math.abs(val) > 0.4 ? '#fff' : 'var(--text)'}`;
        
        tableHtml += `<div class="matrix-cell" style="${style}" title="${rowAsset.name} vs ${colAsset.name}">${displayVal}</div>`;
      }
    }
    
    tableHtml += '</div>';

    const html = `
      <div class="matrix-container">
        <div class="matrix-controls">
          <span class="matrix-desc">Cross-Asset Correlations</span>
          <select class="matrix-timeframe" title="Timeframe">
            <option value="1D" ${this.timeframe === '1D' ? 'selected' : ''}>1 Day</option>
            <option value="1W" ${this.timeframe === '1W' ? 'selected' : ''}>1 Week</option>
            <option value="1M" ${this.timeframe === '1M' ? 'selected' : ''}>1 Month</option>
            <option value="YTD" ${this.timeframe === 'YTD' ? 'selected' : ''}>YTD</option>
          </select>
        </div>
        <div class="matrix-wrapper">
          ${tableHtml}
        </div>
        <div class="matrix-legend">
          <div class="legend-item"><div class="legend-color legend-pos"></div> Positive</div>
          <div class="legend-item"><div class="legend-color legend-neu"></div> None</div>
          <div class="legend-item"><div class="legend-color legend-neg"></div> Negative</div>
        </div>
      </div>
    `;

    this.setContent(html);
  }
}
