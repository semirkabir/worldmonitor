import { Panel } from './Panel';
import { getCSSColor } from '@/utils';
import { calculateCII, type CountryScore } from '@/services/country-instability';
import { t } from '../services/i18n';
import { h, replaceChildren, rawHtml } from '@/utils/dom-utils';
import type { CachedRiskScores } from '@/services/cached-risk-scores';
import { toCountryScore } from '@/services/cached-risk-scores';

export class CIIPanel extends Panel {
  private scores: CountryScore[] = [];
  private focalPointsReady = false;
  private hasCachedRender = false;
  private onShareStory?: (code: string, name: string) => void;
  private onCountryClick?: (code: string) => void;
  private compareTarget: CountryScore | null = null;
  private compareModal: HTMLElement | null = null;

  constructor() {
    super({
      id: 'cii',
      title: t('panels.cii'),
      infoTooltip: t('components.cii.infoTooltip'),
    });
    this.showLoading(t('common.loading'));
  }

  public setShareStoryHandler(handler: (code: string, name: string) => void): void {
    this.onShareStory = handler;
  }

  public setCountryClickHandler(handler: (code: string) => void): void {
    this.onCountryClick = handler;
  }

  private getLevelColor(level: CountryScore['level']): string {
    switch (level) {
      case 'critical': return getCSSColor('--semantic-critical');
      case 'high': return getCSSColor('--semantic-high');
      case 'elevated': return getCSSColor('--semantic-elevated');
      case 'normal': return getCSSColor('--semantic-normal');
      case 'low': return getCSSColor('--semantic-low');
    }
  }

  private getLevelEmoji(level: CountryScore['level']): string {
    switch (level) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'elevated': return '🟡';
      case 'normal': return '🟢';
      case 'low': return '⚪';
    }
  }

  private static readonly SHARE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';

  private buildTrendArrow(trend: CountryScore['trend'], change: number): HTMLElement {
    if (trend === 'rising') return h('span', { className: 'trend-up' }, `↑${change > 0 ? change : ''}`);
    if (trend === 'falling') return h('span', { className: 'trend-down' }, `↓${Math.abs(change)}`);
    return h('span', { className: 'trend-stable' }, '→');
  }

  private buildCountry(country: CountryScore): HTMLElement {
    const color = this.getLevelColor(country.level);
    const emoji = this.getLevelEmoji(country.level);

    const shareBtn = h('button', {
      className: 'cii-share-btn',
      dataset: { code: country.code, name: country.name },
      title: t('common.shareStory'),
    });
    shareBtn.appendChild(rawHtml(CIIPanel.SHARE_SVG));

    const vsBtn = h('button', {
      className: 'cii-vs-btn',
      dataset: { code: country.code },
      title: 'Compare with another country',
    }, 'vs');

    return h('div', { className: 'cii-country', dataset: { code: country.code } },
      h('div', { className: 'cii-header' },
        h('span', { className: 'cii-emoji' }, emoji),
        h('span', { className: 'cii-name' }, country.name),
        h('span', { className: 'cii-score' }, String(country.score)),
        this.buildTrendArrow(country.trend, country.change24h),
        vsBtn,
        shareBtn,
      ),
      h('div', { className: 'cii-bar-container' },
        h('div', { className: 'cii-bar', style: `width: ${country.score}%; background: ${color};` }),
      ),
      h('div', { className: 'cii-components' },
        h('span', { title: t('common.unrest') }, `U:${country.components.unrest}`),
        h('span', { title: t('common.conflict') }, `C:${country.components.conflict}`),
        h('span', { title: t('common.security') }, `S:${country.components.security}`),
        h('span', { title: t('common.information') }, `I:${country.components.information}`),
      ),
    );
  }

  // ─── Country quick-compare ────────────────────────────────────────────────

  private buildCompareModal(a: CountryScore, b: CountryScore): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'cii-compare-overlay';

    const modal = document.createElement('div');
    modal.className = 'cii-compare-modal';

    // Header
    const header = h('div', { className: 'cii-compare-header' },
      h('span', {}, 'COUNTRY COMPARE'),
      h('button', { className: 'cii-compare-close', title: 'Close' }, '\u00d7'),
    );
    modal.appendChild(header);

    // Two-column comparison
    const grid = h('div', { className: 'cii-compare-grid' },
      this.buildCompareCard(a, b),
      h('div', { className: 'cii-compare-divider' }),
      this.buildCompareCard(b, a),
    );
    modal.appendChild(grid);

    // Score diff summary
    const diff = a.score - b.score;
    const diffLabel = diff === 0 ? 'EQUAL RISK' : `${a.name} ${diff > 0 ? 'MORE' : 'LESS'} UNSTABLE BY ${Math.abs(diff)} pts`;
    modal.appendChild(h('div', { className: 'cii-compare-diff' }, diffLabel));

    overlay.appendChild(modal);

    // Close handlers
    const close = () => { overlay.remove(); this.compareModal = null; this.compareTarget = null; };
    header.querySelector('.cii-compare-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });

    return overlay;
  }

  private buildCompareCard(country: CountryScore, other: CountryScore): HTMLElement {
    const color = this.getLevelColor(country.level);
    const emoji = this.getLevelEmoji(country.level);
    const isWinner = country.score < other.score; // lower = more stable

    const card = h('div', { className: `cii-compare-card${isWinner ? ' cii-compare-winner' : ''}` },
      h('div', { className: 'cii-compare-name' },
        h('span', {}, emoji),
        h('strong', {}, country.name),
        isWinner ? h('span', { className: 'cii-compare-tag' }, 'MORE STABLE') : h('span', {}),
      ),
      h('div', { className: 'cii-compare-score', style: `color:${color}` }, String(country.score)),
      h('div', { className: 'cii-compare-level' }, country.level.toUpperCase()),
      this.buildTrendArrow(country.trend, country.change24h),
    );

    // Component bars
    const components: [string, keyof CountryScore['components']][] = [
      ['Unrest', 'unrest'], ['Conflict', 'conflict'], ['Security', 'security'], ['Intel', 'information'],
    ];
    const barsEl = h('div', { className: 'cii-compare-bars' });
    components.forEach(([label, key]) => {
      const val = country.components[key];
      const otherVal = other.components[key];
      const barColor = val > otherVal ? 'var(--semantic-elevated, #ffaa00)' : 'var(--semantic-normal, #44ff88)';
      barsEl.appendChild(h('div', { className: 'cii-compare-bar-row' },
        h('span', { className: 'cii-compare-bar-label' }, label),
        h('div', { className: 'cii-compare-bar-track' },
          h('div', { className: 'cii-compare-bar-fill', style: `width:${val}%;background:${barColor}` }),
        ),
        h('span', { className: 'cii-compare-bar-val' }, String(val)),
      ));
    });
    card.appendChild(barsEl);
    return card;
  }

  private bindVsButtons(): void {
    this.content.querySelectorAll<HTMLElement>('.cii-vs-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = btn.dataset.code;
        const country = this.scores.find(s => s.code === code);
        if (!country) return;

        if (!this.compareTarget) {
          // First selection — highlight and wait for second
          this.compareTarget = country;
          this.content.querySelectorAll('.cii-vs-btn').forEach(b => b.classList.remove('cii-vs-selected'));
          btn.classList.add('cii-vs-selected');
          btn.textContent = 'vs \u2713';
        } else if (this.compareTarget.code === country.code) {
          // Deselect
          this.compareTarget = null;
          btn.classList.remove('cii-vs-selected');
          btn.textContent = 'vs';
        } else {
          // Second selection — show modal
          const modal = this.buildCompareModal(this.compareTarget, country);
          this.compareModal?.remove();
          this.compareModal = modal;
          document.body.appendChild(modal);
          // Reset vs button state
          this.content.querySelectorAll('.cii-vs-btn').forEach(b => {
            b.classList.remove('cii-vs-selected');
            b.textContent = 'vs';
          });
          this.compareTarget = null;
        }
      });
    });
  }

  private bindShareButtons(): void {
    if (!this.onShareStory && !this.onCountryClick) return;

    this.content.querySelectorAll('.cii-country').forEach(el => {
      el.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const code = target.dataset.code;
        if (code && this.onCountryClick) {
          this.onCountryClick(code);
        }
      });
    });

    this.content.querySelectorAll('.cii-share-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        const code = el.dataset.code || '';
        const name = el.dataset.name || '';
        if (code && name && this.onShareStory) this.onShareStory(code, name);
      });
    });
  }

  public async refresh(forceLocal = false): Promise<void> {
    if (!this.focalPointsReady && !forceLocal) {
      return;
    }

    if (forceLocal) {
      this.focalPointsReady = true;
      console.log('[CIIPanel] Focal points ready, calculating scores...');
    }

    if (!this.hasCachedRender) this.showLoading();

    try {
      const localScores = calculateCII();
      const localWithData = localScores.filter(s => s.score > 0).length;
      this.scores = localScores;
      console.log(`[CIIPanel] Calculated ${localWithData} countries with focal point intelligence`);

      const withData = this.scores.filter(s => s.score > 0);
      this.setCount(withData.length);

      if (withData.length === 0) {
        this.setErrorState(false);
        replaceChildren(this.content, h('div', { className: 'empty-state' }, t('components.cii.noSignals')));
        return;
      }

      this.setErrorState(false);
      const listEl = h('div', { className: 'cii-list' }, ...withData.map(s => this.buildCountry(s)));
      replaceChildren(this.content, listEl);
      this.bindShareButtons();
      this.bindVsButtons();
    } catch (error) {
      console.error('[CIIPanel] Refresh error:', error);
      this.showError(t('common.failedCII'), () => void this.refresh());
    }
  }

  public renderFromCached(cached: CachedRiskScores): void {
    const scores = cached.cii.map(toCountryScore).filter(s => s.score > 0);
    if (scores.length === 0) return;
    this.scores = scores;
    this.hasCachedRender = true;
    this.setCount(scores.length);
    this.setErrorState(false);
    const listEl = h('div', { className: 'cii-list' }, ...scores.map(s => this.buildCountry(s)));
    replaceChildren(this.content, listEl);
    this.bindShareButtons();
    this.bindVsButtons();
    console.log(`[CIIPanel] Rendered ${scores.length} countries from cached/bootstrap data`);
  }

  public getScores(): CountryScore[] {
    return this.scores;
  }
}
