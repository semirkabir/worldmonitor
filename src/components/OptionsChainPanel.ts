import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import {
  fetchStockQuote,
  fetchOptionChain,
  type OptionContract,
  type OptionChainExpiry,
} from '@/services/market/finnhub-extra';

export class OptionsChainPanel extends Panel {
  private currentSymbol = 'AAPL';
  private selectedExpiry = 0;

  constructor() {
    super({
      id: 'options-chain',
      title: t('panels.optionsChain'),
    });
    void this.render();
  }

  public async render(symbol?: string): Promise<void> {
    if (symbol) this.currentSymbol = symbol;

    this.showLoading();

    try {
      const [quote, chain] = await Promise.all([
        fetchStockQuote(this.currentSymbol).catch(() => null),
        fetchOptionChain(this.currentSymbol),
      ]);

      if (!chain || chain.length === 0) {
        this.showError(`No options data for ${this.currentSymbol}`);
        return;
      }

      const expiry = chain[Math.min(this.selectedExpiry, chain.length - 1)] as OptionChainExpiry;
      const underlyingPrice = quote?.c ?? 0;

      const expiryOptions = chain.map((e, i) => `
        <option value="${i}" ${i === this.selectedExpiry ? 'selected' : ''}>${escapeHtml(e.expirationDate)}</option>
      `).join('');

      const html = `
        <div class="opt-controls">
          <input type="text" class="opt-symbol-input" id="opt-symbol" placeholder="Symbol..." value="${escapeHtml(this.currentSymbol)}" />
          ${underlyingPrice ? `<span class="opt-price">$${underlyingPrice.toFixed(2)}</span>` : ''}
          <select class="opt-expiry-select" id="opt-expiry">${expiryOptions}</select>
        </div>
        <div class="opt-container">
          <div class="opt-side">
            <h4>Calls</h4>
            <div class="opt-table">
              <div class="opt-header">
                <span>Strike</span><span>Last</span><span>Bid</span><span>Ask</span><span>Vol</span><span>OI</span><span>IV</span>
              </div>
              ${expiry.calls.slice(0, 20).map(o => this.renderOptionRow(o, underlyingPrice, 'call')).join('')}
            </div>
          </div>
          <div class="opt-side">
            <h4>Puts</h4>
            <div class="opt-table">
              <div class="opt-header">
                <span>Strike</span><span>Last</span><span>Bid</span><span>Ask</span><span>Vol</span><span>OI</span><span>IV</span>
              </div>
              ${expiry.puts.slice(0, 20).map(o => this.renderOptionRow(o, underlyingPrice, 'put')).join('')}
            </div>
          </div>
        </div>
      `;

      this.setContent(html);

      const symbolInput = document.getElementById('opt-symbol') as HTMLInputElement | null;
      let debounce: ReturnType<typeof setTimeout>;
      symbolInput?.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const val = symbolInput.value.trim().toUpperCase();
          if (val) {
            this.currentSymbol = val;
            this.selectedExpiry = 0;
            void this.render();
          }
        }, 500);
      });

      const expirySelect = document.getElementById('opt-expiry') as HTMLSelectElement | null;
      expirySelect?.addEventListener('change', () => {
        this.selectedExpiry = parseInt(expirySelect.value, 10);
        void this.render();
      });
    } catch (err) {
      this.showError(`Failed to load options: ${err}`);
    }
  }

  private renderOptionRow(o: OptionContract, underlying: number, type: string): string {
    const strike = o.strike ?? 0;
    const itm = type === 'call' ? strike < underlying : strike > underlying;
    const last = o.lastPrice != null ? o.lastPrice.toFixed(2) : '—';
    const bid = o.bid != null ? o.bid.toFixed(2) : '—';
    const ask = o.ask != null ? o.ask.toFixed(2) : '—';
    const vol = o.volume != null ? o.volume.toLocaleString() : '—';
    const oi = o.openInterest != null ? o.openInterest.toLocaleString() : '—';
    const iv = o.impliedVolatility != null ? `${(o.impliedVolatility * 100).toFixed(1)}%` : '—';

    return `
      <div class="opt-row ${itm ? 'opt-itm' : ''}">
        <span class="opt-strike">${strike.toFixed(2)}</span>
        <span class="opt-last">${last}</span>
        <span class="opt-bid">${bid}</span>
        <span class="opt-ask">${ask}</span>
        <span class="opt-vol">${vol}</span>
        <span class="opt-oi">${oi}</span>
        <span class="opt-iv">${iv}</span>
      </div>
    `;
  }
}
