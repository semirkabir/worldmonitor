import { Panel } from './Panel';
import type { PredictionMarket } from '@/services/prediction';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';

export class PredictionPanel extends Panel {
  private onMarketClick?: (market: PredictionMarket) => void;

  private getTheme(title: string): string {
    const lower = title.toLowerCase();
    if (/taiwan|china|beijing/.test(lower)) return 'China / Taiwan';
    if (/iran|israel|gaza|hamas|middle east|houthi/.test(lower)) return 'Middle East';
    if (/russia|ukraine|putin/.test(lower)) return 'Russia / Ukraine';
    if (/election|senate|president|congress|trump|biden/.test(lower)) return 'Elections';
    if (/oil|opec|inflation|fed|recession|tariff/.test(lower)) return 'Macro';
    return 'Other';
  }

  constructor() {
    super({
      id: 'polymarket',
      title: t('panels.polymarket'),
      infoTooltip: t('components.prediction.infoTooltip'),
    });
  }

  public setOnMarketClick(cb: (market: PredictionMarket) => void): void {
    this.onMarketClick = cb;
  }

  private formatVolume(volume?: number): string {
    if (!volume) return '';
    if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
    if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}K`;
    return `$${volume.toFixed(0)}`;
  }

  public renderPredictions(data: PredictionMarket[]): void {
    if (data.length === 0) {
      this.showError(t('common.failedPredictions'));
      return;
    }

    const orderedMarkets = [...data].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    const grouped = new Map<string, PredictionMarket[]>();
    for (const market of orderedMarkets) {
      const theme = this.getTheme(market.title);
      const bucket = grouped.get(theme) ?? [];
      bucket.push(market);
      grouped.set(theme, bucket);
    }

    const html = [...grouped.entries()]
      .map(([theme, markets]) => {
        const items = markets.map((p) => {
        const yesPercent = Math.round(p.yesPrice);
        const noPercent = 100 - yesPercent;
        const volumeStr = this.formatVolume(p.volume);

        const titleHtml = `<div class="prediction-question">${escapeHtml(p.title)}</div>`;

        let expiryHtml = '';
        if (p.endDate) {
          const d = new Date(p.endDate);
          if (Number.isFinite(d.getTime())) {
            const formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            expiryHtml = `<span class="prediction-expiry">${t('components.predictions.closes')}: ${formatted}</span>`;
          }
        }

        const metaHtml = (volumeStr || expiryHtml)
          ? `<div class="prediction-meta">${volumeStr ? `<span class="prediction-volume">${t('components.predictions.vol')}: ${volumeStr}</span>` : ''}${expiryHtml}</div>`
          : '';

        return `
      <div class="prediction-item" data-slug="${p.slug || ''}" style="cursor: pointer;">
        <div class="prediction-theme-pill">${escapeHtml(theme)}</div>
        ${titleHtml}
        ${metaHtml}
        <div class="prediction-bar">
          <div class="prediction-yes" style="width: ${yesPercent}%">
            <span class="prediction-label">${t('components.predictions.yes')} ${yesPercent}%</span>
          </div>
          <div class="prediction-no" style="width: ${noPercent}%">
            <span class="prediction-label">${t('components.predictions.no')} ${noPercent}%</span>
          </div>
        </div>
      </div>
    `;
      }).join('');

        return `<div class="prediction-group"><div class="prediction-group-title">${escapeHtml(theme)}</div>${items}</div>`;
      })
      .join('');

    this.setContent(html);

    // Attach click listeners
    const items = this.element.querySelectorAll('.prediction-item');
    items.forEach((item: Element, index: number) => {
      item.addEventListener('click', () => {
        const market = orderedMarkets[index];
        if (market && this.onMarketClick) {
          this.onMarketClick(market);
        }
      });
    });
  }
}
