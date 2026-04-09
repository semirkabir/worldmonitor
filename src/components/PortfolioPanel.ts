import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { MarketServiceClient } from '@/generated/client/worldmonitor/market/v1/service_client';
import {
  fetchCongressTrades,
  fetchInstitutionalHoldings,
  getUserPositions,
  addUserPosition,
  removeUserPosition,
  NOTABLE_INVESTORS,
  type CongressTrade,
} from '@/services/market/portfolio';

type Tab = 'portfolio' | 'congress' | 'institutions' | 'notable';

const TAB_LABELS: Record<Tab, string> = {
  portfolio: 'My Portfolio',
  congress: 'Congress',
  institutions: 'Institutions',
  notable: 'Notable',
};

const client = new MarketServiceClient('', {
  fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
});

export class PortfolioPanel extends Panel {
  private activeTab: Tab = 'portfolio';
  private congressCache: CongressTrade[] | null = null;
  private congressFilter = '';
  private institutionCik: string = NOTABLE_INVESTORS[0]!.cik;

  constructor() {
    super({
      id: 'portfolio-tracker',
      title: t('panels.portfolioTracker'),
    });
    void this.render();
  }

  public async render(): Promise<void> {
    this.renderShell();
    await this.renderTabContent();
  }

  private renderShell(): void {
    const tabBar = Object.entries(TAB_LABELS)
      .map(([key, label]) =>
        `<button class="pf-tab${key === this.activeTab ? ' pf-tab-active' : ''}" data-tab="${escapeHtml(key)}">${escapeHtml(label)}</button>`)
      .join('');

    const shell = `
      <div class="pf-shell">
        <div class="pf-tab-bar">${tabBar}</div>
        <div class="pf-content" id="pf-content"></div>
      </div>
    `;
    this.setContentNow(shell);

    // Tab click handlers
    this.content.querySelectorAll<HTMLElement>('.pf-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab as Tab;
        this.content.querySelectorAll('.pf-tab').forEach(t => t.classList.remove('pf-tab-active'));
        btn.classList.add('pf-tab-active');
        this.renderTabContent();
      });
    });
  }

  private async renderTabContent(): Promise<void> {
    const contentEl = this.content.querySelector('#pf-content') as HTMLElement | null;
    if (!contentEl) return;
    contentEl.innerHTML = '<div class="pf-loading">Loading\u2026</div>';

    try {
      switch (this.activeTab) {
        case 'portfolio': await this.renderPortfolioTab(contentEl); break;
        case 'congress': await this.renderCongressTab(contentEl); break;
        case 'institutions': await this.renderInstitutionsTab(contentEl); break;
        case 'notable': this.renderNotableTab(contentEl); break;
      }
    } catch (err) {
      contentEl.innerHTML = `<div class="pf-error">Error loading data: ${escapeHtml(String(err))}</div>`;
    }
  }

  // ─── My Portfolio ────────────────────────────────────────────────────────

  private async renderPortfolioTab(contentEl: HTMLElement): Promise<void> {
    const positions = getUserPositions();

    // Fetch live quotes for all positions
    const quotes = new Map<string, { price: number; change: number }>();
    if (positions.length > 0) {
      try {
        const resp = await client.listMarketQuotes({ symbols: positions.map(p => p.symbol) });
        for (const q of resp.quotes) quotes.set(q.symbol, q);
      } catch { /* quotes unavailable */ }
    }

    let totalValue = 0;
    let totalCost = 0;
    const rows = positions.map(pos => {
      const quote = quotes.get(pos.symbol);
      const currentPrice = quote?.price ?? 0;
      const marketValue = currentPrice * pos.shares;
      const costBasis = pos.avgCost * pos.shares;
      const pnl = marketValue - costBasis;
      const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      totalValue += marketValue;
      totalCost += costBasis;

      const pnlClass = pnl >= 0 ? 'pf-positive' : 'pf-negative';
      const pnlSign = pnl >= 0 ? '+' : '';

      return `
        <div class="pf-position-row">
          <div class="pf-pos-info">
            <span class="pf-pos-symbol ticker-link" data-ticker="${escapeHtml(pos.symbol)}" data-name="${escapeHtml(pos.name)}">${escapeHtml(pos.symbol)}</span>
            <span class="pf-pos-name">${escapeHtml(pos.name)}</span>
          </div>
          <div class="pf-pos-data">
            <div class="pf-pos-col">
              <span class="pf-pos-label">Shares</span>
              <span class="pf-pos-val">${pos.shares.toLocaleString()}</span>
            </div>
            <div class="pf-pos-col">
              <span class="pf-pos-label">Avg Cost</span>
              <span class="pf-pos-val">$${pos.avgCost.toFixed(2)}</span>
            </div>
            <div class="pf-pos-col">
              <span class="pf-pos-label">Price</span>
              <span class="pf-pos-val">${currentPrice ? '$' + currentPrice.toFixed(2) : '\u2014'}</span>
            </div>
            <div class="pf-pos-col">
              <span class="pf-pos-label">P&amp;L</span>
              <span class="pf-pos-val ${pnlClass}">${pnlSign}$${Math.abs(pnl).toFixed(2)} (${pnlSign}${pnlPct.toFixed(1)}%)</span>
            </div>
            <button class="pf-remove-btn" data-symbol="${escapeHtml(pos.symbol)}" title="Remove">\u00d7</button>
          </div>
        </div>
      `;
    }).join('');

    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const totalPnlClass = totalPnl >= 0 ? 'pf-positive' : 'pf-negative';
    const totalPnlSign = totalPnl >= 0 ? '+' : '';

    contentEl.innerHTML = `
      <div class="pf-add-form">
        <input type="text" class="pf-input" id="pf-add-symbol" placeholder="Symbol (e.g. AAPL)" />
        <input type="number" class="pf-input pf-input-sm" id="pf-add-shares" placeholder="Shares" min="0" step="1" />
        <input type="number" class="pf-input pf-input-sm" id="pf-add-cost" placeholder="Avg Cost" min="0" step="0.01" />
        <button class="pf-add-btn" id="pf-add-btn">Add</button>
      </div>
      ${positions.length > 0 ? `
        <div class="pf-summary">
          <div class="pf-summary-item">
            <span class="pf-summary-label">Portfolio Value</span>
            <span class="pf-summary-val">$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="pf-summary-item">
            <span class="pf-summary-label">Total P&amp;L</span>
            <span class="pf-summary-val ${totalPnlClass}">${totalPnlSign}$${Math.abs(totalPnl).toFixed(2)} (${totalPnlSign}${totalPnlPct.toFixed(1)}%)</span>
          </div>
        </div>
        <div class="pf-positions">${rows}</div>
      ` : '<div class="pf-empty">No positions yet. Add a stock above to start tracking your portfolio.</div>'}
    `;

    // Add position handler
    const addBtn = contentEl.querySelector('#pf-add-btn');
    addBtn?.addEventListener('click', () => {
      const symbolInput = contentEl.querySelector('#pf-add-symbol') as HTMLInputElement;
      const sharesInput = contentEl.querySelector('#pf-add-shares') as HTMLInputElement;
      const costInput = contentEl.querySelector('#pf-add-cost') as HTMLInputElement;
      const symbol = symbolInput.value.trim().toUpperCase();
      const shares = parseFloat(sharesInput.value);
      const avgCost = parseFloat(costInput.value);
      if (!symbol || !shares || !avgCost) return;
      addUserPosition({ symbol, name: symbol, shares, avgCost });
      this.renderTabContent();
    });

    // Remove handlers
    contentEl.querySelectorAll<HTMLElement>('.pf-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const symbol = btn.dataset.symbol;
        if (symbol) {
          removeUserPosition(symbol);
          this.renderTabContent();
        }
      });
    });
  }

  // ─── Congress Tab ────────────────────────────────────────────────────────

  private async renderCongressTab(contentEl: HTMLElement): Promise<void> {
    if (!this.congressCache) {
      const resp = await fetchCongressTrades();
      this.congressCache = resp.trades;
    }

    let trades = this.congressCache;
    if (this.congressFilter) {
      const f = this.congressFilter.toLowerCase();
      trades = trades.filter(tr =>
        tr.politician.toLowerCase().includes(f) ||
        tr.ticker.toLowerCase().includes(f) ||
        tr.party.toLowerCase().includes(f)
      );
    }

    const rows = trades.slice(0, 100).map(trade => {
      const isPurchase = trade.transactionType.toLowerCase().includes('purchase');
      const isSale = trade.transactionType.toLowerCase().includes('sale');
      const typeClass = isPurchase ? 'pf-positive' : isSale ? 'pf-negative' : '';
      const typeLabel = isPurchase ? 'BUY' : isSale ? 'SELL' : escapeHtml(trade.transactionType);
      const partyColor = trade.party === 'Republican' ? '#ef4444' : trade.party === 'Democrat' ? '#3b82f6' : '#888';

      return `
        <div class="pf-congress-row">
          <div class="pf-cg-header">
            <span class="pf-cg-name">${escapeHtml(trade.politician)}</span>
            <span class="pf-cg-party" style="color:${partyColor}">${escapeHtml(trade.party.charAt(0))}</span>
            <span class="pf-cg-chamber">${escapeHtml(trade.chamber)}</span>
            <span class="pf-cg-date">${escapeHtml(trade.transactionDate)}</span>
          </div>
          <div class="pf-cg-details">
            <span class="pf-cg-ticker ticker-link" data-ticker="${escapeHtml(trade.ticker)}" data-name="${escapeHtml(trade.assetDescription)}">${escapeHtml(trade.ticker)}</span>
            <span class="pf-cg-type ${typeClass}">${typeLabel}</span>
            <span class="pf-cg-amount">${escapeHtml(trade.amount)}</span>
          </div>
          ${trade.assetDescription ? `<div class="pf-cg-desc">${escapeHtml(trade.assetDescription.slice(0, 80))}</div>` : ''}
        </div>
      `;
    }).join('');

    contentEl.innerHTML = `
      <div class="pf-filter-bar">
        <input type="text" class="pf-input" id="pf-congress-filter" placeholder="Filter by name, ticker, or party\u2026" value="${escapeHtml(this.congressFilter)}" />
        <span class="pf-count">${trades.length} trades</span>
      </div>
      <div class="pf-congress-list">${rows || '<div class="pf-empty">No trades found</div>'}</div>
    `;

    const filterInput = contentEl.querySelector('#pf-congress-filter') as HTMLInputElement;
    let debounce: ReturnType<typeof setTimeout>;
    filterInput?.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        this.congressFilter = filterInput.value.trim();
        this.renderTabContent();
      }, 300);
    });
  }

  // ─── Institutions Tab ────────────────────────────────────────────────────

  private async renderInstitutionsTab(contentEl: HTMLElement): Promise<void> {
    const selectorHtml = NOTABLE_INVESTORS.map(inv =>
      `<option value="${escapeHtml(inv.cik)}"${inv.cik === this.institutionCik ? ' selected' : ''}>${escapeHtml(inv.name)} (${escapeHtml(inv.description)})</option>`
    ).join('');

    contentEl.innerHTML = `
      <div class="pf-filter-bar">
        <select class="pf-select" id="pf-institution-select">${selectorHtml}</select>
      </div>
      <div id="pf-holdings-content"><div class="pf-loading">Loading 13F holdings\u2026</div></div>
    `;

    const select = contentEl.querySelector('#pf-institution-select') as HTMLSelectElement;
    select?.addEventListener('change', () => {
      this.institutionCik = select.value;
      this.loadInstitutionHoldings(contentEl);
    });

    await this.loadInstitutionHoldings(contentEl);
  }

  private async loadInstitutionHoldings(contentEl: HTMLElement): Promise<void> {
    const holdingsDiv = contentEl.querySelector('#pf-holdings-content') as HTMLElement | null;
    if (!holdingsDiv) return;
    holdingsDiv.innerHTML = '<div class="pf-loading">Loading 13F holdings\u2026</div>';

    try {
      const data = await fetchInstitutionalHoldings(this.institutionCik);

      if (data.holdings.length === 0) {
        holdingsDiv.innerHTML = '<div class="pf-empty">No holdings data available for this filer.</div>';
        return;
      }

      const totalValue = data.holdings.reduce((sum, h) => sum + h.value, 0);

      const rows = data.holdings.map((h, i) => {
        const pct = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
        return `
          <div class="pf-holding-row">
            <span class="pf-hold-rank">${i + 1}</span>
            <div class="pf-hold-info">
              <span class="pf-hold-name">${escapeHtml(h.issuer)}</span>
              <span class="pf-hold-title">${escapeHtml(h.title)}</span>
            </div>
            <div class="pf-hold-data">
              <span class="pf-hold-value">$${formatLargeNum(h.value)}</span>
              <span class="pf-hold-shares">${h.shares.toLocaleString()} shr</span>
              <div class="pf-hold-pct-bar">
                <div class="pf-hold-pct-fill" style="width:${Math.min(pct, 100)}%"></div>
              </div>
              <span class="pf-hold-pct">${pct.toFixed(1)}%</span>
            </div>
          </div>
        `;
      }).join('');

      holdingsDiv.innerHTML = `
        <div class="pf-inst-header">
          <span class="pf-inst-name">${escapeHtml(data.name)}</span>
          <span class="pf-inst-meta">Filed: ${escapeHtml(data.filingDate)} \u00b7 ${data.totalHoldings} positions \u00b7 AUM: $${formatLargeNum(totalValue)}</span>
        </div>
        <div class="pf-holdings-list">${rows}</div>
      `;
    } catch (err) {
      holdingsDiv.innerHTML = `<div class="pf-error">Failed to load holdings: ${escapeHtml(String(err))}</div>`;
    }
  }

  // ─── Notable Tab ─────────────────────────────────────────────────────────

  private renderNotableTab(contentEl: HTMLElement): void {
    const cards = NOTABLE_INVESTORS.map(inv => `
      <div class="pf-notable-card" data-cik="${escapeHtml(inv.cik)}">
        <div class="pf-notable-name">${escapeHtml(inv.name)}</div>
        <div class="pf-notable-desc">${escapeHtml(inv.description)}</div>
        <div class="pf-notable-action">View Holdings \u2192</div>
      </div>
    `).join('');

    contentEl.innerHTML = `
      <div class="pf-notable-header">Notable investors and fund managers with public 13F filings.</div>
      <div class="pf-notable-grid">${cards}</div>
    `;

    contentEl.querySelectorAll<HTMLElement>('.pf-notable-card').forEach(card => {
      card.addEventListener('click', () => {
        const cik = card.dataset.cik;
        if (cik) {
          this.institutionCik = cik;
          this.activeTab = 'institutions';
          this.renderShell();
          this.renderTabContent();
        }
      });
    });
  }
}

function formatLargeNum(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2) + 'T';
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toFixed(0);
}
