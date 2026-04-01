import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { fetchEarningsCalendar } from '@/services/market/finnhub-extra';

export class EarningsCalendarPanel extends Panel {
  private filterSymbol = '';
  private filterRange: 'week' | 'month' = 'week';

  constructor() {
    super({
      id: 'earnings-calendar',
      title: t('panels.earningsCalendar'),
    });
  }

  private formatRevenue(rev: number): string {
    if (rev >= 1e9) return `$${(rev / 1e9).toFixed(1)}B`;
    if (rev >= 1e6) return `$${(rev / 1e6).toFixed(1)}M`;
    return `$${rev.toFixed(0)}`;
  }

  public async render(data?: { symbol?: string; range?: 'week' | 'month' }): Promise<void> {
    if (data?.symbol) this.filterSymbol = data.symbol;
    if (data?.range) this.filterRange = data.range;

    const days = this.filterRange === 'week' ? 7 : 30;
    const from = new Date().toISOString().split('T')[0];
    const to = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

    this.showLoading();

    try {
      let events = await fetchEarningsCalendar(from, to);
      if (this.filterSymbol) {
        events = events.filter(e => e.symbol.toUpperCase() === this.filterSymbol);
      }

      if (events.length === 0) {
        this.showError(t('common.noData'));
        return;
      }

      const html = events.slice(0, 50).map(ev => {
        const timeColor = ev.hour === 'bmo' ? '#3b82f6' : '#f59e0b';
        const timeLabel = ev.hour === 'bmo' ? 'Before Open' : 'After Close';

        const epsSurprise = ev.epsActual && ev.epsEstimate
          ? (((ev.epsActual - ev.epsEstimate) / Math.abs(ev.epsEstimate)) * 100).toFixed(1)
          : null;
        const epsBeat = epsSurprise ? parseFloat(epsSurprise) >= 0 : null;

        return `
          <div class="ecp-item">
            <div class="ecp-header-row">
              <span class="ecp-symbol">${escapeHtml(ev.symbol)}</span>
              <span class="ecp-name">${escapeHtml(ev.name)}</span>
              <span class="ecp-date">${escapeHtml(ev.date)}</span>
              <span class="ecp-time" style="color:${timeColor}">${timeLabel}</span>
            </div>
            <div class="ecp-details">
              <div class="ecp-detail"><span class="ecp-label">EPS Est</span><span class="ecp-value">${ev.epsEstimate?.toFixed(2) ?? '—'}</span></div>
              <div class="ecp-detail"><span class="ecp-label">EPS Act</span><span class="ecp-value ${epsBeat === true ? 'ecp-beat' : epsBeat === false ? 'ecp-miss' : ''}">${ev.epsActual?.toFixed(2) ?? '—'}</span></div>
              ${epsSurprise !== null ? `<div class="ecp-detail"><span class="ecp-label">Surprise</span><span class="ecp-value ${epsBeat === true ? 'ecp-beat' : 'ecp-miss'}">${epsBeat === true ? '+' : ''}${epsSurprise}%</span></div>` : ''}
              <div class="ecp-detail"><span class="ecp-label">Rev Est</span><span class="ecp-value">${ev.revenueEstimate ? this.formatRevenue(ev.revenueEstimate) : '—'}</span></div>
              <div class="ecp-detail"><span class="ecp-label">Rev Act</span><span class="ecp-value">${ev.revenueActual ? this.formatRevenue(ev.revenueActual) : '—'}</span></div>
            </div>
          </div>
        `;
      }).join('');

      this.setContent(`
        <div class="ecp-controls">
          <select class="ecp-range-select" id="ecp-range">
            <option value="week" ${this.filterRange === 'week' ? 'selected' : ''}>Next 7 Days</option>
            <option value="month" ${this.filterRange === 'month' ? 'selected' : ''}>Next 30 Days</option>
          </select>
          <input type="text" class="ecp-symbol-input" id="ecp-symbol" placeholder="Symbol..." value="${escapeHtml(this.filterSymbol)}" />
        </div>
        <div class="ecp-list">${html}</div>
      `);

      const rangeSelect = document.getElementById('ecp-range') as HTMLSelectElement | null;
      rangeSelect?.addEventListener('change', () => {
        this.filterRange = rangeSelect.value as 'week' | 'month';
        this.render();
      });

      const symbolInput = document.getElementById('ecp-symbol') as HTMLInputElement | null;
      let debounce: ReturnType<typeof setTimeout>;
      symbolInput?.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          this.filterSymbol = symbolInput.value.trim().toUpperCase();
          this.render();
        }, 400);
      });
    } catch (err) {
      this.showError(`Failed to load earnings: ${err}`);
    }
  }
}
