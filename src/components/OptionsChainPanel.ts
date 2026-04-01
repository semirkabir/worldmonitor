import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';

interface OptionContract {
  strike: string | number;
  type: string;
  last_price?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  open_interest?: number;
  implied_volatility?: number;
}

export class OptionsChainPanel extends Panel {
  private currentSymbol = 'AAPL';

  constructor() {
    super({
      id: 'options-chain',
      title: t('panels.optionsChain'),
    });
  }

  public async render(symbol?: string): Promise<void> {
    if (symbol) this.currentSymbol = symbol;

    this.showLoading();

    try {
      const quote = await this.fetchQuote(this.currentSymbol);
      const options = await this.fetchOptions(this.currentSymbol);

      if (!options || options.length === 0) {
        this.showError(`No options data for ${this.currentSymbol}`);
        return;
      }

      const opts = options as OptionContract[];
      const calls = opts.filter(o => o.type === 'call').sort((a, b) => Number(a.strike) - Number(b.strike));
      const puts = opts.filter(o => o.type === 'put').sort((a, b) => Number(a.strike) - Number(b.strike));

      const underlyingPrice = (quote as Record<string, unknown>)?.c as number || (quote as Record<string, unknown>)?.price as number || 0;

      const html = `
        <div class="opt-controls">
          <input type="text" class="opt-symbol-input" id="opt-symbol" placeholder="Symbol..." value="${escapeHtml(this.currentSymbol)}" />
          <span class="opt-price">Price: $${typeof underlyingPrice === 'number' ? underlyingPrice.toFixed(2) : '—'}</span>
        </div>
        <div class="opt-container">
          <div class="opt-side">
            <h4>Calls</h4>
            <div class="opt-table">
              <div class="opt-header">
                <span>Strike</span><span>Last</span><span>Bid</span><span>Ask</span><span>Vol</span><span>OI</span><span>IV</span>
              </div>
              ${calls.slice(0, 20).map(o => this.renderOptionRow(o, underlyingPrice, 'call')).join('')}
            </div>
          </div>
          <div class="opt-side">
            <h4>Puts</h4>
            <div class="opt-table">
              <div class="opt-header">
                <span>Strike</span><span>Last</span><span>Bid</span><span>Ask</span><span>Vol</span><span>OI</span><span>IV</span>
              </div>
              ${puts.slice(0, 20).map(o => this.renderOptionRow(o, underlyingPrice, 'put')).join('')}
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
            this.render();
          }
        }, 500);
      });
    } catch (err) {
      this.showError(`Failed to load options: ${err}`);
    }
  }

  private renderOptionRow(o: OptionContract, underlying: number, type: string): string {
    const strike = Number(o.strike || 0);
    const itm = type === 'call' ? strike < underlying : strike > underlying;
    const last = o.last_price != null ? o.last_price.toFixed(2) : '—';
    const bid = o.bid != null ? o.bid.toFixed(2) : '—';
    const ask = o.ask != null ? o.ask.toFixed(2) : '—';
    const vol = o.volume != null ? o.volume.toLocaleString() : '—';
    const oi = o.open_interest != null ? o.open_interest.toLocaleString() : '—';
    const iv = o.implied_volatility != null ? `${(o.implied_volatility * 100).toFixed(1)}%` : '—';

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

  private async fetchQuote(symbol: string): Promise<Record<string, unknown> | null> {
    const url = `/api/market/v1/list-market-quotes?symbols=${encodeURIComponent(symbol)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.quotes?.[0] || null;
  }

  private async fetchOptions(symbol: string): Promise<unknown[]> {
    const url = `/api/market-data?endpoint=option-chain&symbol=${encodeURIComponent(symbol)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const error = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error((error as { error?: string }).error || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return (data as Record<string, unknown>).data as unknown[] || (data as Record<string, unknown>).options as unknown[] || [];
  }
}
