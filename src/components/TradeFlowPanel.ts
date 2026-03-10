import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

interface TradeData {
  from: string;
  to: string;
  value: number; // in billions
  commodity: string;
  trend: 'up' | 'down' | 'flat';
}

export class TradeFlowPanel extends Panel {
  private flows: TradeData[] = [];
  private loading = true;
  private commodityFilter = 'Energy';

  constructor() {
    super({ id: 'trade-flows', title: '🚢 Global Trade Flows' });
    this.content.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.classList.contains('trade-filter')) {
        this.commodityFilter = target.value;
        this.loading = true;
        this.renderPanel();
        void this.fetchData();
      }
    });

    void this.fetchData();
  }

  public async fetchData(): Promise<void> {
    await new Promise(r => setTimeout(r, 600)); // Simulate API call to UN Comtrade

    // Generate simulated trade data based on the filter
    const baseVal = this.commodityFilter === 'Energy' ? 40 : this.commodityFilter === 'Tech' ? 30 : 50;

    if (this.commodityFilter === 'Energy') {
      this.flows = [
        { from: 'Middle East', to: 'China', value: baseVal * 2.5, commodity: 'Crude Oil', trend: 'up' },
        { from: 'United States', to: 'Europe', value: baseVal * 1.8, commodity: 'LNG', trend: 'up' },
        { from: 'Russia', to: 'India', value: baseVal * 1.5, commodity: 'Crude Oil', trend: 'flat' },
        { from: 'Russia', to: 'China', value: baseVal * 1.2, commodity: 'Natural Gas', trend: 'up' },
        { from: 'Australia', to: 'Japan', value: baseVal * 0.9, commodity: 'Coal/LNG', trend: 'down' },
      ];
    } else if (this.commodityFilter === 'Tech') {
      this.flows = [
        { from: 'Taiwan', to: 'United States', value: baseVal * 3.1, commodity: 'Semiconductors', trend: 'up' },
        { from: 'China', to: 'Europe', value: baseVal * 2.8, commodity: 'Electronics', trend: 'flat' },
        { from: 'China', to: 'United States', value: baseVal * 2.2, commodity: 'Electronics', trend: 'down' },
        { from: 'South Korea', to: 'China', value: baseVal * 1.5, commodity: 'Memory Chips', trend: 'down' },
        { from: 'Japan', to: 'Taiwan', value: baseVal * 1.1, commodity: 'Semicond. Equip.', trend: 'up' },
      ];
    } else {
      this.flows = [
        { from: 'China', to: 'United States', value: baseVal * 6.5, commodity: 'All Goods', trend: 'down' },
        { from: 'Mexico', to: 'United States', value: baseVal * 5.8, commodity: 'Automotive/Mfg', trend: 'up' },
        { from: 'China', to: 'Europe', value: baseVal * 5.2, commodity: 'All Goods', trend: 'flat' },
        { from: 'United States', to: 'Europe', value: baseVal * 4.1, commodity: 'All Goods', trend: 'up' },
        { from: 'Germany', to: 'China', value: baseVal * 2.9, commodity: 'Automotive/Mach.', trend: 'down' },
      ];
    }

    // Sort by value descending
    this.flows.sort((a, b) => b.value - a.value);

    this.loading = false;
    this.renderPanel();
  }

  private renderPanel(): void {
    if (this.loading) {
      this.showLoading('Aggregating trade volume data...');
      return;
    }

    const maxValue = Math.max(...this.flows.map(f => f.value));

    const flowsHtml = this.flows.map(flow => {
      const pct = (flow.value / maxValue) * 100;
      const trendIconParams = flow.trend === 'up' ? 'text-green 📈' : flow.trend === 'down' ? 'text-red 📉' : 'text-gray ➖';
      const [trendClass, trendIcon] = trendIconParams.split(' ');

      return `
        <div class="trade-row">
          <div class="trade-route">
            <span class="trade-origin">${escapeHtml(flow.from)}</span>
            <span class="trade-arrow">➔</span>
            <span class="trade-dest">${escapeHtml(flow.to)}</span>
          </div>
          <div class="trade-details">
            <span class="trade-commodity">${escapeHtml(flow.commodity)}</span>
            <div class="trade-value-wrap">
              <span class="trade-val">$${flow.value.toFixed(1)}B</span>
              <span class="trade-trend ${trendClass}" title="${flow.trend}">${trendIcon}</span>
            </div>
          </div>
          <div class="trade-bar-bg">
            <div class="trade-bar-fg" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <div class="trade-container">
        <div class="trade-header">
          <span class="trade-desc">Major bilateral trade corridors</span>
          <select class="trade-filter" title="Commodity Class">
            <option value="All" ${this.commodityFilter === 'All' ? 'selected' : ''}>All Goods</option>
            <option value="Energy" ${this.commodityFilter === 'Energy' ? 'selected' : ''}>Energy & Resources</option>
            <option value="Tech" ${this.commodityFilter === 'Tech' ? 'selected' : ''}>Technology & Chips</option>
          </select>
        </div>
        <div class="trade-list">
          ${flowsHtml}
        </div>
        <div class="trade-footer">
          <small>Estimated monthly volume. Highlights shifts from sanctions & re-routing.</small>
        </div>
      </div>
    `;

    this.setContent(html);
  }
}
