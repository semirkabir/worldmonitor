import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import type { PredictionMarket } from '@/services/prediction';

export interface PredictionDetailData {
  description?: string;
  resolutionSource?: string;
  liquidity?: number;
  [key: string]: unknown;
}

export class PredictionBriefPage {
  private overlay: HTMLElement;
  private onCloseCallback?: () => void;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'prediction-brief-overlay country-brief-overlay'; // Reusing country-brief styles
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (target.classList.contains('country-brief-overlay')) {
        this.hide();
        return;
      }

      if (target.closest('.cb-close')) {
        this.hide();
        return;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('active')) this.hide();
    });
  }

  public showLoading(): void {
    this.overlay.innerHTML = `
      <div class="country-brief-page">
        <div class="cb-header">
          <div class="cb-header-left">
            <span class="cb-flag">📊</span>
            <span class="cb-country-name">${t('modals.predictionBrief.loading')}</span>
          </div>
          <div class="cb-header-right">
            <button class="cb-close" aria-label="${t('components.newsPanel.close')}">×</button>
          </div>
        </div>
        <div class="cb-body">
          <div class="cb-loading-state">
            <div class="intel-skeleton"></div>
             <div class="intel-skeleton short"></div>
             <span class="intel-loading-text">${t('modals.predictionBrief.fetching')}</span>
          </div>
        </div>
      </div>`;
    this.overlay.classList.add('active');
  }

  public show(market: PredictionMarket, details?: PredictionDetailData): void {
    
    const yesPercent = Math.round(market.yesPrice);
    const noPercent = 100 - yesPercent;
    
    let expiryHtml = '';
    if (market.endDate) {
      const d = new Date(market.endDate);
      if (Number.isFinite(d.getTime())) {
        const formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        expiryHtml = `<div class="pb-meta-item"><strong>${t('components.predictions.closes')}:</strong> ${formatted}</div>`;
      }
    }

    let volumeHtml = '';
    if (market.volume) {
      const v = market.volume;
      const fmt = v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v.toFixed(0)}`;
      volumeHtml = `<div class="pb-meta-item"><strong>${t('components.predictions.vol')}:</strong> ${fmt}</div>`;
    }

    let liquidityHtml = '';
    if (details?.liquidity) {
      const liq = details.liquidity;
      const fmt = liq >= 1000000 ? `$${(liq/1000000).toFixed(1)}M` : liq >= 1000 ? `$${(liq/1000).toFixed(0)}K` : `$${liq.toFixed(0)}`;
      liquidityHtml = `<div class="pb-meta-item"><strong>Liquidity:</strong> ${fmt}</div>`;
    }

    const safeUrl = sanitizeUrl(market.url || '');
    const titleHtml = safeUrl
        ? `<a href="${safeUrl}" target="_blank" rel="noopener" class="pb-title-link">${escapeHtml(market.title)} ↗</a>`
        : `<span>${escapeHtml(market.title)}</span>`;

    this.overlay.innerHTML = `
      <div class="country-brief-page prediction-brief-page">
        <div class="cb-header">
          <div class="cb-header-left">
            <span class="cb-flag">📊</span>
            <span class="cb-country-name">Prediction Market</span>
          </div>
          <div class="cb-header-right">
             ${safeUrl ? `<a href="${safeUrl}" target="_blank" rel="noopener" class="cb-share-btn" title="Open on Polymarket" style="color: inherit; text-decoration: none; display: flex; align-items: center; justify-content: center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
            <button class="cb-close" aria-label="${t('components.newsPanel.close')}">×</button>
          </div>
        </div>
        <div class="cb-body">
          
          <h2 class="pb-title">${titleHtml}</h2>

          <div class="prediction-bar pb-large-bar">
            <div class="prediction-yes" style="width: ${yesPercent}%">
              <span class="prediction-label">Yes ${yesPercent}%</span>
            </div>
            <div class="prediction-no" style="width: ${noPercent}%">
              <span class="prediction-label">No ${noPercent}%</span>
            </div>
          </div>

          <div class="pb-meta-grid">
            ${volumeHtml}
            ${liquidityHtml}
            ${expiryHtml}
          </div>

          ${details?.description ? `
            <section class="cb-section">
              <h3 class="cb-section-title">Rules</h3>
              <div class="cb-brief-text pb-rules-text">
                ${escapeHtml(details.description).replace(/\n/g, '<br>')}
              </div>
            </section>
          ` : ''}

          ${details?.resolutionSource ? `
             <section class="cb-section">
              <h3 class="cb-section-title">Resolution Source</h3>
              <div class="cb-brief-text">
                 ${sanitizeUrl(details.resolutionSource) ? `<a href="${sanitizeUrl(details.resolutionSource)}" target="_blank" rel="noopener">${escapeHtml(details.resolutionSource)}</a>` : escapeHtml(details.resolutionSource)}
              </div>
            </section>
          ` : ''}
          
        </div>
      </div>`;
    
    this.overlay.classList.add('active');
  }

  public hide(): void {
    this.overlay.classList.remove('active');
    this.onCloseCallback?.();
  }

  public onClose(cb: () => void): void {
    this.onCloseCallback = cb;
  }

  public isVisible(): boolean {
    return this.overlay.classList.contains('active');
  }
}
