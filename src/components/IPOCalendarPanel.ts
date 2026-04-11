import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { fetchIPOCalendar } from '@/services/market/finnhub-extra';

export class IPOCalendarPanel extends Panel {
  private filterRange: 'month' | 'quarter' = 'month';

  constructor() {
    super({
      id: 'ipo-calendar',
      title: t('panels.ipoCalendar'),
    });
    void this.render();
  }

  public async render(): Promise<void> {
    const days = this.filterRange === 'month' ? 30 : 90;
    const from = new Date().toISOString().split('T')[0];
    const to = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

    this.showLoading();

    try {
      const ipos = await fetchIPOCalendar(from, to);

      if (!ipos || ipos.length === 0) {
        this.showError(t('common.noData'));
        return;
      }

      const html = ipos.slice(0, 30).map(ipo => {
        const priceRange = ipo.priceRangeLow && ipo.priceRangeHigh && ipo.priceRangeLow !== '0'
          ? `$${ipo.priceRangeLow} - $${ipo.priceRangeHigh}`
          : ipo.expectedPrice || 'TBD';

        const statusColor = ipo.status === 'priced' ? '#22c55e' : ipo.status === 'withdrawn' ? '#ef4444' : '#f59e0b';

        return `
          <div class="ipo-item">
            <div class="ipo-header">
              <span class="ipo-symbol">${escapeHtml(ipo.symbol)}</span>
              <span class="ipo-name">${escapeHtml(ipo.name)}</span>
              <span class="ipo-exchange">${escapeHtml(ipo.exchange)}</span>
              <span class="ipo-status" style="color:${statusColor}">${escapeHtml(ipo.status)}</span>
            </div>
            <div class="ipo-details">
              <div class="ipo-detail"><span class="ipo-label">Price</span><span class="ipo-value">${escapeHtml(priceRange)}</span></div>
              <div class="ipo-detail"><span class="ipo-label">Shares</span><span class="ipo-value">${ipo.numberOfShares ? ipo.numberOfShares.toLocaleString() : '—'}</span></div>
              <div class="ipo-detail"><span class="ipo-label">Filed</span><span class="ipo-value">${escapeHtml(ipo.filingDate)}</span></div>
              <div class="ipo-detail"><span class="ipo-label">Expected</span><span class="ipo-value">${escapeHtml(ipo.announcementDate)}</span></div>
            </div>
          </div>
        `;
      }).join('');

      this.setContent(`
        <div class="ipo-controls">
          <select class="ipo-range-select" id="ipo-range">
            <option value="month" ${this.filterRange === 'month' ? 'selected' : ''}>Next 30 Days</option>
            <option value="quarter" ${this.filterRange === 'quarter' ? 'selected' : ''}>Next 90 Days</option>
          </select>
        </div>
        <div class="ipo-list">${html}</div>
      `);

      const rangeSelect = document.getElementById('ipo-range') as HTMLSelectElement | null;
      rangeSelect?.addEventListener('change', () => {
        this.filterRange = rangeSelect.value as 'month' | 'quarter';
        this.render();
      });
    } catch (err) {
      this.showError(`Failed to load IPO calendar: ${err}`);
    }
  }
}
