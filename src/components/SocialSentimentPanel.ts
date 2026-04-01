import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { fetchSocialSentiment, fetchRecommendationTrends } from '@/services/market/finnhub-extra';

export class SocialSentimentPanel extends Panel {
  private currentSymbol = 'AAPL';

  constructor() {
    super({
      id: 'social-sentiment',
      title: t('panels.socialSentiment'),
    });
  }

  public async render(symbol?: string): Promise<void> {
    if (symbol) this.currentSymbol = symbol;

    this.showLoading();

    try {
      const [sentiment, recommendations] = await Promise.all([
        fetchSocialSentiment(this.currentSymbol),
        fetchRecommendationTrends(this.currentSymbol),
      ]);

      if ((!sentiment || sentiment.length === 0) && (!recommendations || recommendations.length === 0)) {
        this.showError(`No sentiment data for ${this.currentSymbol}`);
        return;
      }

      let sentimentHtml = '';
      if (sentiment && sentiment.length > 0) {
        const latest = sentiment.slice(-7);
        const maxReddit = Math.max(...latest.map(s => s.redditMentions || 0), 1);
        const maxTwitter = Math.max(...latest.map(s => s.twitterMentions || 0), 1);

        sentimentHtml = `
          <div class="ss-section">
            <h4>Social Mentions (7 Days)</h4>
            <div class="ss-bars">
              ${latest.map(s => `
                <div class="ss-bar-item">
                  <div class="ss-bar-date">${s.date?.slice(5) || ''}</div>
                  <div class="ss-bar-row">
                    <div class="ss-bar-label">Reddit</div>
                    <div class="ss-bar-track">
                      <div class="ss-bar-fill ss-reddit" style="width:${((s.redditMentions || 0) / maxReddit) * 100}%"></div>
                    </div>
                    <div class="ss-bar-value">${s.redditMentions?.toLocaleString() ?? 0}</div>
                  </div>
                  <div class="ss-bar-row">
                    <div class="ss-bar-label">Twitter</div>
                    <div class="ss-bar-track">
                      <div class="ss-bar-fill ss-twitter" style="width:${((s.twitterMentions || 0) / maxTwitter) * 100}%"></div>
                    </div>
                    <div class="ss-bar-value">${s.twitterMentions?.toLocaleString() ?? 0}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      let recHtml = '';
      if (recommendations && recommendations.length > 0) {
        const latest = recommendations.slice(0, 4);
        recHtml = `
          <div class="ss-section">
            <h4>Analyst Recommendations</h4>
            <div class="ss-rec-table">
              <div class="ss-rec-header">
                <span>Period</span><span>Strong Buy</span><span>Buy</span><span>Hold</span><span>Sell</span><span>Strong Sell</span>
              </div>
              ${latest.map(r => `
                <div class="ss-rec-row">
                  <span>${escapeHtml(r.period)}</span>
                  <span class="ss-rec-strong-buy">${r.strongBuy}</span>
                  <span class="ss-rec-buy">${r.buy}</span>
                  <span>${r.hold}</span>
                  <span class="ss-rec-sell">${r.sell}</span>
                  <span class="ss-rec-strong-sell">${r.strongSell}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      this.setContent(`
        <div class="ss-controls">
          <input type="text" class="ss-symbol-input" id="ss-symbol" placeholder="Symbol..." value="${escapeHtml(this.currentSymbol)}" />
        </div>
        <div class="ss-content">
          ${sentimentHtml}
          ${recHtml}
        </div>
      `);

      const symbolInput = document.getElementById('ss-symbol') as HTMLInputElement | null;
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
      this.showError(`Failed to load sentiment: ${err}`);
    }
  }
}
