import { Panel } from './Panel';
import { t } from '@/services/i18n';
import type { MarketData, CryptoData } from '@/types';
import { formatPrice, formatChange, getChangeClass, getHeatmapClass } from '@/utils';
import { escapeHtml } from '@/utils/sanitize';
import { miniSparkline } from '@/utils/sparkline';
import {
  getMarketWatchlistEntries,
  resetMarketWatchlist,
  setMarketWatchlistEntries,
  type MarketWatchlistEntry,
} from '@/services/market-watchlist';
import { checkFeatureAccess } from '@/services/auth-modal';
import { MARKET_SYMBOLS, SECTORS, COMMODITIES } from '@/config/markets';
import { COMMODITY_MARKET_SYMBOLS, COMMODITY_SECTORS, COMMODITY_PRICES } from '@/config/commodity-markets';

export class MarketPanel extends Panel {
  private settingsBtn: HTMLButtonElement | null = null;
  private overlay: HTMLElement | null = null;

  constructor() {
    super({ id: 'markets', title: t('panels.markets') });
    this.createSettingsButton();
  }

  private createSettingsButton(): void {
    this.settingsBtn = document.createElement('button');
    this.settingsBtn.className = 'live-news-settings-btn';
    this.settingsBtn.title = 'Customize market watchlist';
    this.settingsBtn.textContent = 'Watchlist';
    this.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openWatchlistModal();
    });
    this.header.appendChild(this.settingsBtn);
  }

  private static buildTickerCatalog(): { symbol: string; name: string; display?: string }[] {
    const seen = new Set<string>();
    const out: { symbol: string; name: string; display?: string }[] = [];
    const add = (sym: string, name: string, display?: string) => {
      if (!seen.has(sym)) { seen.add(sym); out.push({ symbol: sym, name, display }); }
    };
    for (const m of MARKET_SYMBOLS) add(m.symbol, m.name, m.display);
    for (const s of SECTORS) add(s.symbol, s.name);
    for (const c of COMMODITIES) add(c.symbol, c.name, c.display);
    for (const m of COMMODITY_MARKET_SYMBOLS) add(m.symbol, m.name, m.display);
    for (const s of COMMODITY_SECTORS) add(s.symbol, s.name);
    for (const c of COMMODITY_PRICES) add(c.symbol, c.name, c.display);
    return out;
  }

  private openWatchlistModal(): void {
    if (!checkFeatureAccess('watchlist')) return;
    if (this.overlay) return;

    const catalog = MarketPanel.buildTickerCatalog();
    let entries: MarketWatchlistEntry[] = [...getMarketWatchlistEntries()];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeWatchlistModal(); });

    const modal = document.createElement('div');
    modal.className = 'modal unified-settings-modal';
    modal.style.maxWidth = '480px';
    modal.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Market Watchlist</span>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      <div style="padding:14px 16px 16px">
        <div style="position:relative">
          <input class="wl-search" type="text" placeholder="Search stocks, ETFs, futures…" autocomplete="off"
            style="width:100%;background:rgba(255,255,255,0.05);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:8px 12px;font-family:inherit;font-size:13px;outline:none;box-sizing:border-box"/>
        </div>
        <div class="wl-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;min-height:28px"></div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:14px">
          <button type="button" class="panels-reset-layout" id="wmMarketResetBtn">Reset</button>
          <div style="flex:1"></div>
          <button type="button" class="panels-reset-layout" id="wmMarketCancelBtn">Cancel</button>
          <button type="button" class="panels-reset-layout" id="wmMarketSaveBtn" style="border-color:var(--text-dim);color:var(--text)">Save</button>
        </div>
      </div>
    `;

    modal.querySelector('.modal-close')?.addEventListener('click', () => this.closeWatchlistModal());
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.overlay = overlay;

    // Dropdown rendered at body level to avoid modal overflow-y:auto clipping
    const dropdown = document.createElement('div');
    dropdown.className = 'wl-portal-dropdown';
    dropdown.style.cssText = 'display:none;position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--border);border-radius:6px;max-height:220px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.4)';
    document.body.appendChild(dropdown);

    const searchInput = modal.querySelector<HTMLInputElement>('.wl-search')!;
    const chipsEl = modal.querySelector<HTMLElement>('.wl-chips')!;

    const positionDropdown = () => {
      const rect = searchInput.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + 2}px`;
      dropdown.style.left = `${rect.left}px`;
      dropdown.style.width = `${rect.width}px`;
    };

    const renderChips = () => {
      chipsEl.innerHTML = '';
      if (entries.length === 0) {
        chipsEl.innerHTML = `<span style="color:var(--text-faint);font-size:11px">No custom tickers — defaults will be shown</span>`;
        return;
      }
      for (const entry of entries) {
        const chip = document.createElement('div');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:11px;color:var(--text)';
        chip.innerHTML = `<span style="font-weight:600">${escapeHtml(entry.display || entry.symbol)}</span>${entry.name ? `<span style="color:var(--text-dim)">${escapeHtml(entry.name)}</span>` : ''}<button aria-label="Remove" style="background:none;border:none;color:var(--text-faint);cursor:pointer;padding:0;margin-left:2px;font-size:14px;line-height:1">×</button>`;
        chip.querySelector('button')?.addEventListener('click', () => {
          entries = entries.filter(e => e.symbol !== entry.symbol);
          renderChips();
        });
        chipsEl.appendChild(chip);
      }
    };

    // Prevent blur on input when clicking inside dropdown
    dropdown.addEventListener('mousedown', (e) => e.preventDefault());

    const addEntry = (match: { symbol: string; name: string; display?: string }) => {
      if (entries.some(e => e.symbol === match.symbol)) return;
      entries.push({ symbol: match.symbol, name: match.name, ...(match.display ? { display: match.display } : {}) });
      searchInput.value = '';
      dropdown.style.display = 'none';
      renderChips();
      searchInput.focus();
    };

    const showDropdown = (query: string) => {
      const q = query.toLowerCase();
      if (!q) { dropdown.style.display = 'none'; return; }
      const selected = new Set(entries.map(e => e.symbol));
      const matches = catalog
        .filter(item => !selected.has(item.symbol) && (item.symbol.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)))
        .slice(0, 10);
      if (matches.length === 0) { dropdown.style.display = 'none'; return; }
      dropdown.innerHTML = '';
      for (const match of matches) {
        const row = document.createElement('div');
        row.style.cssText = 'padding:7px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:12px';
        row.innerHTML = `<span style="font-weight:600;color:var(--text);min-width:64px">${escapeHtml(match.display || match.symbol)}</span><span style="color:var(--text-dim)">${escapeHtml(match.name)}</span>`;
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.06)'; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; });
        row.addEventListener('click', () => addEntry(match));
        dropdown.appendChild(row);
      }
      positionDropdown();
      dropdown.style.display = 'block';
    };

    searchInput.addEventListener('input', () => showDropdown(searchInput.value.trim()));
    searchInput.addEventListener('blur', () => { setTimeout(() => { dropdown.style.display = 'none'; }, 200); });
    searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) showDropdown(searchInput.value.trim()); });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const firstRow = dropdown.querySelector('div') as HTMLElement | null;
        if (firstRow) firstRow.click();
      } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
      }
    });

    modal.querySelector<HTMLButtonElement>('#wmMarketCancelBtn')?.addEventListener('click', () => this.closeWatchlistModal());
    modal.querySelector<HTMLButtonElement>('#wmMarketResetBtn')?.addEventListener('click', () => {
      resetMarketWatchlist();
      this.closeWatchlistModal();
    });
    modal.querySelector<HTMLButtonElement>('#wmMarketSaveBtn')?.addEventListener('click', () => {
      if (entries.length === 0) resetMarketWatchlist();
      else setMarketWatchlistEntries(entries);
      this.closeWatchlistModal();
    });

    renderChips();
    searchInput.focus();
  }

  private closeWatchlistModal(): void {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = null;
    document.querySelector('.wl-portal-dropdown')?.remove();
  }

  public renderMarkets(data: MarketData[], rateLimited?: boolean): void {
    if (data.length === 0) {
      this.showRetrying(rateLimited ? t('common.rateLimitedMarket') : t('common.failedMarketData'));
      return;
    }

    const html = data
      .map(
        (stock) => `
      <div class="market-item">
        <div class="market-info">
          <span class="market-name">${escapeHtml(stock.name)}</span>
          <span class="market-symbol">${escapeHtml(stock.display)}</span>
        </div>
        <div class="market-data">
          ${miniSparkline(stock.sparkline, stock.change)}
          <span class="market-price">${formatPrice(stock.price!)}</span>
          <span class="market-change ${getChangeClass(stock.change!)}">${formatChange(stock.change!)}</span>
        </div>
      </div>
    `
      )
      .join('');

    this.setContent(html);
  }
}

export class HeatmapPanel extends Panel {
  constructor() {
    super({ id: 'heatmap', title: t('panels.heatmap') });
  }

  public renderHeatmap(data: Array<{ name: string; change: number | null }>): void {
    const validData = data.filter((d) => d.change !== null);

    if (validData.length === 0) {
      this.showRetrying(t('common.failedSectorData'));
      return;
    }

    const html =
      '<div class="heatmap">' +
      validData
        .map(
          (sector) => `
        <div class="heatmap-cell ${getHeatmapClass(sector.change!)}">
          <div class="sector-name">${escapeHtml(sector.name)}</div>
          <div class="sector-change ${getChangeClass(sector.change!)}">${formatChange(sector.change!)}</div>
        </div>
      `
        )
        .join('') +
      '</div>';

    this.setContent(html);
  }
}

export class CommoditiesPanel extends Panel {
  constructor() {
    super({ id: 'commodities', title: t('panels.commodities') });
  }

  public renderCommodities(data: Array<{ display: string; price: number | null; change: number | null; sparkline?: number[] }>): void {
    const validData = data.filter((d) => d.price !== null);

    if (validData.length === 0) {
      this.showRetrying(t('common.failedCommodities'));
      return;
    }

    const html =
      '<div class="commodities-grid">' +
      validData
        .map(
          (c) => `
        <div class="commodity-item">
          <div class="commodity-name">${escapeHtml(c.display)}</div>
          ${miniSparkline(c.sparkline, c.change, 60, 18)}
          <div class="commodity-price">${formatPrice(c.price!)}</div>
          <div class="commodity-change ${getChangeClass(c.change!)}">${formatChange(c.change!)}</div>
        </div>
      `
        )
        .join('') +
      '</div>';

    this.setContent(html);
  }
}

export class CryptoPanel extends Panel {
  constructor() {
    super({ id: 'crypto', title: t('panels.crypto') });
  }

  public renderCrypto(data: CryptoData[]): void {
    if (data.length === 0) {
      this.showRetrying(t('common.failedCryptoData'));
      return;
    }

    const html = data
      .map(
        (coin) => `
      <div class="market-item">
        <div class="market-info">
          <span class="market-name">${escapeHtml(coin.name)}</span>
          <span class="market-symbol">${escapeHtml(coin.symbol)}</span>
        </div>
        <div class="market-data">
          ${miniSparkline(coin.sparkline, coin.change)}
          <span class="market-price">$${coin.price.toLocaleString()}</span>
          <span class="market-change ${getChangeClass(coin.change)}">${formatChange(coin.change)}</span>
        </div>
      </div>
    `
      )
      .join('');

    this.setContent(html);
  }
}
