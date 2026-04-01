import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { fetchInsiderTransactions } from '@/services/market/finnhub-extra';

const TRANSACTION_LABELS: Record<string, string> = {
  P: 'Purchase',
  S: 'Sale',
  A: 'Award',
  D: 'Sale to Issuer',
  F: 'Tax Payment',
  G: 'Gift',
  M: 'Option Exercise',
  X: 'In-the-Money Exercise',
};

export class InsiderTradingPanel extends Panel {
  private currentSymbol = 'AAPL';

  constructor() {
    super({
      id: 'insider-trading',
      title: t('panels.insiderTrading'),
    });
  }

  private formatValue(value: number): string {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  }

  public async render(symbol?: string): Promise<void> {
    if (symbol) this.currentSymbol = symbol;

    this.showLoading();

    try {
      const transactions = await fetchInsiderTransactions(this.currentSymbol);

      if (!transactions || transactions.length === 0) {
        this.showError(`No insider transactions found for ${this.currentSymbol}`);
        return;
      }

      const html = transactions.slice(0, 30).map(tx => {
        const isPurchase = tx.transactionCode === 'P';
        const isSale = tx.transactionCode === 'S';
        const changeColor = isPurchase ? '#22c55e' : isSale ? '#ef4444' : '#888';
        const changeLabel = TRANSACTION_LABELS[tx.transactionCode] || tx.transactionCode;
        const changeSign = isPurchase ? '+' : isSale ? '-' : '';

        return `
          <div class="insider-item">
            <div class="insider-header">
              <span class="insider-name">${escapeHtml(tx.name)}</span>
              <span class="insider-date">${escapeHtml(tx.transactionDate)}</span>
              <span class="insider-type" style="color:${changeColor}">${changeSign}${changeLabel}</span>
            </div>
            <div class="insider-details">
              <div class="insider-detail"><span class="insider-label">Shares</span><span class="insider-value">${tx.change?.toLocaleString() ?? '—'}</span></div>
              <div class="insider-detail"><span class="insider-label">Price</span><span class="insider-value">${tx.transactionPrice ? `$${tx.transactionPrice.toFixed(2)}` : '—'}</span></div>
              <div class="insider-detail"><span class="insider-label">Value</span><span class="insider-value">${tx.transactionValue ? this.formatValue(tx.transactionValue) : '—'}</span></div>
              <div class="insider-detail"><span class="insider-label">Total Shares</span><span class="insider-value">${tx.share?.toLocaleString() ?? '—'}</span></div>
              <div class="insider-detail"><span class="insider-label">Filed</span><span class="insider-value">${escapeHtml(tx.filingDate)}</span></div>
            </div>
          </div>
        `;
      }).join('');

      this.setContent(`
        <div class="insider-controls">
          <input type="text" class="insider-symbol-input" id="insider-symbol" placeholder="Symbol..." value="${escapeHtml(this.currentSymbol)}" />
        </div>
        <div class="insider-list">${html}</div>
      `);

      const symbolInput = document.getElementById('insider-symbol') as HTMLInputElement | null;
      let debounce: ReturnType<typeof setTimeout>;
      symbolInput?.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const val = symbolInput.value.trim().toUpperCase();
          if (val) {
            this.currentSymbol = val;
            this.render();
          }
        }, 500);
      });
    } catch (err) {
      this.showError(`Failed to load insider transactions: ${err}`);
    }
  }
}
