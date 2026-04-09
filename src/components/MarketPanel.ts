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
import { marketWebSocket } from '@/services/market/realtime';

function formatCryptoPrice(price: number): string {
  if (!Number.isFinite(price)) return '—';
  const abs = Math.abs(price);
  const maximumFractionDigits = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  const minimumFractionDigits = maximumFractionDigits === 0 ? 0 : Math.min(maximumFractionDigits, abs >= 1 ? 2 : maximumFractionDigits);
  return `$${price.toLocaleString(undefined, { minimumFractionDigits, maximumFractionDigits })}`;
}


export class MarketPanel extends Panel {
  private settingsBtn: HTMLButtonElement | null = null;
  private overlay: HTMLElement | null = null;
  private priceElements: Map<string, HTMLSpanElement> = new Map();
  private changeElements: Map<string, HTMLSpanElement> = new Map();
  private unsubscribeMap: Map<string, () => void> = new Map();

  constructor() {
    super({ id: 'markets', title: 'Watchlist' });
    this.createSettingsButton();
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    // Connect to real-time WebSocket and subscribe to watchlist symbols
    marketWebSocket.connect();
    marketWebSocket.subscribeToWatchlist();
  }

  public destroy(): void {
    // Clean up WebSocket subscriptions
    this.unsubscribeMap.forEach((unsub) => unsub());
    this.unsubscribeMap.clear();
    super.destroy?.();
  }

  private createSettingsButton(): void {
    this.settingsBtn = document.createElement('button');
    this.settingsBtn.className = 'live-news-settings-btn';
    this.settingsBtn.title = 'Edit watchlist';
    this.settingsBtn.textContent = 'Edit';
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
          <button type="button" class="panels-reset-layout" id="wmMarketResetBtn">Reset to defaults</button>
          <div style="flex:1"></div>
          <button type="button" class="panels-reset-layout" id="wmMarketDoneBtn" style="border-color:var(--text-dim);color:var(--text)">Done</button>
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
        chipsEl.innerHTML = `<div style="color:var(--text-faint);font-size:12px;padding:8px 0;text-align:center">
          Your watchlist is empty. Search and add tickers above.
        </div>`;
        return;
      }
      for (const entry of entries) {
        const chip = document.createElement('div');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.08);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;color:var(--text);transition:all 0.15s;cursor:default';
        chip.innerHTML = `
          <span style="font-weight:600">${escapeHtml(entry.display || entry.symbol)}</span>
          ${entry.name ? `<span style="color:var(--text-dim);font-size:11px">${escapeHtml(entry.name)}</span>` : ''}
          <button class="wl-remove-btn" aria-label="Remove ${escapeHtml(entry.symbol)}" title="Remove from watchlist" style="background:rgba(255,255,255,0.1);border:none;border-radius:3px;color:var(--text-faint);cursor:pointer;padding:2px 6px;margin-left:4px;font-size:13px;line-height:1;transition:all 0.15s;display:flex;align-items:center;justify-content:center;min-width:20px;height:20px">×</button>
        `;
        
        const removeBtn = chip.querySelector<HTMLElement>('.wl-remove-btn');
        if (removeBtn) {
          removeBtn.addEventListener('mouseenter', () => {
            removeBtn.style.background = 'rgba(248,113,113,0.3)';
            removeBtn.style.color = '#f87171';
          });
          removeBtn.addEventListener('mouseleave', () => {
            removeBtn.style.background = 'rgba(255,255,255,0.1)';
            removeBtn.style.color = 'var(--text-faint)';
          });
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chip.style.opacity = '0';
            chip.style.transform = 'scale(0.9)';
            setTimeout(() => {
              entries = entries.filter(e => e.symbol !== entry.symbol);
              persist();
              renderChips();
            }, 150);
          });
        }
        
        chipsEl.appendChild(chip);
      }
    };

    // Prevent blur on input when clicking inside dropdown
    dropdown.addEventListener('mousedown', (e) => e.preventDefault());

    const persist = () => {
      if (entries.length === 0) resetMarketWatchlist();
      else setMarketWatchlistEntries(entries);
    };

    const addEntry = (match: { symbol: string; name: string; display?: string }) => {
      if (entries.some(e => e.symbol === match.symbol)) return;
      entries.push({ symbol: match.symbol, name: match.name, ...(match.display ? { display: match.display } : {}) });
      persist();
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

    modal.querySelector<HTMLButtonElement>('#wmMarketDoneBtn')?.addEventListener('click', () => this.closeWatchlistModal());
    modal.querySelector<HTMLButtonElement>('#wmMarketResetBtn')?.addEventListener('click', () => {
      entries = [];
      resetMarketWatchlist();
      renderChips();
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

    // Clean up old subscriptions
    this.unsubscribeMap.forEach((unsub) => unsub());
    this.unsubscribeMap.clear();
    this.priceElements.clear();
    this.changeElements.clear();

    const container = document.createElement('div');
    container.className = 'market-list';

    data.forEach((stock) => {
      const item = document.createElement('div');
      item.className = 'market-item ticker-link';
      item.dataset.symbol = stock.symbol;
      item.dataset.ticker = stock.symbol;
      item.dataset.name = stock.name;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.style.cursor = 'pointer';

      const priceSpan = document.createElement('span');
      priceSpan.className = 'market-price';
      priceSpan.textContent = stock.price != null ? formatPrice(stock.price) : '—';

      const changeSpan = document.createElement('span');
      changeSpan.className = `market-change ${stock.change != null ? getChangeClass(stock.change) : ''}`;
      changeSpan.textContent = stock.change != null ? formatChange(stock.change) : '—';

      // Store references for real-time updates
      this.priceElements.set(stock.symbol, priceSpan);
      this.changeElements.set(stock.symbol, changeSpan);

      // Subscribe to WebSocket updates
      const unsub = marketWebSocket.onPriceUpdate(stock.symbol, (update) => {
        if (update.price != null) {
          // Add flicker effect
          priceSpan.classList.add('price-flicker');
          priceSpan.textContent = formatPrice(update.price);
          
          // Calculate percentage change if we have previous data
          if (stock.price != null && update.price !== stock.price) {
            const pctChange = ((update.price - stock.price) / stock.price) * 100;
            changeSpan.className = `market-change ${getChangeClass(pctChange)} price-flicker`;
            changeSpan.textContent = formatChange(pctChange);
          }

          // Remove flicker after animation
          setTimeout(() => {
            priceSpan.classList.remove('price-flicker');
            changeSpan.classList.remove('price-flicker');
          }, 300);
        }
      });
      this.unsubscribeMap.set(stock.symbol, unsub);

      item.innerHTML = `
        <div class="market-info">
          <span class="market-name">${escapeHtml(stock.name)}</span>
          <span class="market-symbol">${escapeHtml(stock.display)}</span>
        </div>
        <div class="market-data">
          ${miniSparkline(stock.sparkline, stock.change)}
        </div>
      `;

      // Append price and change elements
      const marketData = item.querySelector('.market-data')!;
      marketData.appendChild(priceSpan);
      marketData.appendChild(changeSpan);

      container.appendChild(item);
    });

    this.setContent(container.innerHTML);
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
  private cryptoData: CryptoData[] = [];
  private onCoinClick?: (coin: CryptoData) => void;

  constructor() {
    super({ id: 'crypto', title: t('panels.crypto') });
  }

  public setOnCoinClick(cb: (coin: CryptoData) => void): void {
    this.onCoinClick = cb;
  }

  private bindCryptoInteractions(): void {
    this.content.querySelectorAll<HTMLButtonElement>('[data-crypto-symbol]').forEach((button) => {
      button.addEventListener('click', () => {
        const symbol = button.dataset.cryptoSymbol;
        if (!symbol) return;
        const coin = this.cryptoData.find(c => c.symbol === symbol);
        if (!coin) return;
        this.onCoinClick?.(coin);
      });
    });
  }

  public renderCrypto(data: CryptoData[]): void {
    if (data.length === 0) {
      this.showRetrying(t('common.failedCryptoData'));
      return;
    }

    this.cryptoData = data;

    const rows = data.map((coin) => `
      <button
        type="button"
        class="market-item crypto-market-item"
        data-crypto-symbol="${escapeHtml(coin.symbol)}"
        aria-label="Open ${escapeHtml(coin.name)} details"
      >
        <div class="market-info">
          <span class="market-name">${escapeHtml(coin.name)}</span>
          <span class="market-symbol">${escapeHtml(coin.symbol)}</span>
        </div>
        <div class="market-data">
          ${miniSparkline(coin.sparkline, coin.change)}
          <span class="market-price">${formatCryptoPrice(coin.price)}</span>
          <span class="market-change ${getChangeClass(coin.change)}">${formatChange(coin.change)}</span>
        </div>
      </button>
    `).join('');

    this.setContentNow(`<div class="crypto-market-list">${rows}</div>`);
    this.bindCryptoInteractions();
  }
}
