/**
 * VisitorCounter — pulsating eye with live viewer count.
 *
 * Features:
 * - Trending arrow (▲/▼) that fades out after a few seconds on each tick
 * - Peak today tracking shown in the tooltip
 * - Activity spike detection (≥8% jump) — flashes eye bright red + tooltip notice
 *
 * To connect to a real backend, replace startSimulation() with a live
 * subscription and call this.setCount(total) whenever the count updates.
 */
export class VisitorCounter {
  private el: HTMLElement;
  private eyeEl: HTMLElement;
  private countEl: HTMLElement;
  private trendEl: HTMLElement;
  private tooltipEl: HTMLElement;
  private tooltipTotalEl: HTMLElement;
  private tooltipPeakEl: HTMLElement;
  private tooltipSpikeEl: HTMLElement;

  private total = 0;
  private peakToday = 0;
  private trendClearTimeout: number | null = null;
  private spikeClearTimeout: number | null = null;
  private tickTimeout: number | null = null;
  private tooltipTimeout: number | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'visitor-counter';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-label', 'Live viewer count');

    // Eye icon with pulse ring
    this.eyeEl = document.createElement('span');
    this.eyeEl.className = 'vc-eye';
    this.eyeEl.setAttribute('aria-hidden', 'true');

    const pulseRing = document.createElement('span');
    pulseRing.className = 'vc-pulse-ring';
    this.eyeEl.appendChild(pulseRing);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const eyePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    eyePath.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
    svg.appendChild(eyePath);

    const pupil = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pupil.setAttribute('cx', '12');
    pupil.setAttribute('cy', '12');
    pupil.setAttribute('r', '3');
    svg.appendChild(pupil);
    this.eyeEl.appendChild(svg);

    // Count + trend arrow
    const countWrap = document.createElement('span');
    countWrap.className = 'vc-count-wrap';

    this.countEl = document.createElement('span');
    this.countEl.className = 'vc-count';

    this.trendEl = document.createElement('span');
    this.trendEl.className = 'vc-trend';

    countWrap.appendChild(this.countEl);
    countWrap.appendChild(this.trendEl);

    // Tooltip
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'vc-tooltip';
    this.tooltipEl.setAttribute('role', 'tooltip');

    const tooltipTitle = document.createElement('span');
    tooltipTitle.className = 'vc-tooltip-title';
    tooltipTitle.textContent = 'Monitoring the situation';

    this.tooltipTotalEl = document.createElement('span');
    this.tooltipTotalEl.className = 'vc-tooltip-total';

    this.tooltipPeakEl = document.createElement('span');
    this.tooltipPeakEl.className = 'vc-tooltip-peak';

    this.tooltipSpikeEl = document.createElement('span');
    this.tooltipSpikeEl.className = 'vc-tooltip-spike';

    this.tooltipEl.appendChild(tooltipTitle);
    this.tooltipEl.appendChild(this.tooltipTotalEl);
    this.tooltipEl.appendChild(this.tooltipPeakEl);
    this.tooltipEl.appendChild(this.tooltipSpikeEl);

    this.el.appendChild(this.eyeEl);
    this.el.appendChild(countWrap);
    this.el.appendChild(this.tooltipEl);

    this.el.addEventListener('mouseenter', () => this.showTooltip());
    this.el.addEventListener('mouseleave', () => this.hideTooltip());

    this.startSimulation();
  }

  // ── Simulation ────────────────────────────────────────────────────────────

  private seedCount(): number {
    const hour = Math.floor(Date.now() / 3_600_000);
    const seed = ((hour * 1_103_515_245 + 12_345) >>> 0) % 0x7fffffff;
    return 160 + (seed % 280); // 160–440 range
  }

  private startSimulation(): void {
    this.total = this.seedCount();
    this.peakToday = this.total;
    this.render(0);

    const tick = () => {
      const prev = this.total;
      const delta = Math.round((Math.random() - 0.38) * 12);
      this.total = Math.max(40, Math.min(700, this.total + delta));
      this.render(this.total - prev);
      this.tickTimeout = window.setTimeout(tick, 25_000 + Math.random() * 20_000);
    };
    this.tickTimeout = window.setTimeout(tick, 25_000 + Math.random() * 20_000);
  }

  /** Call this to feed real counts from an external source. */
  setCount(total: number): void {
    const delta = total - this.total;
    this.total = total;
    this.render(delta);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private render(delta: number): void {
    this.countEl.textContent = this.formatCount(this.total);

    // Update peak
    if (this.total > this.peakToday) this.peakToday = this.total;

    // Tooltip rows
    this.tooltipTotalEl.textContent = this.formatCount(this.total) + ' watching now';
    this.tooltipPeakEl.textContent = 'Peak today: ' + this.formatCount(this.peakToday);

    // Trending arrow — only show on ticks (delta !== 0)
    if (delta !== 0) {
      this.showTrend(delta);
    }

    // Activity spike: ≥8% jump upward
    if (delta > 0 && this.total > 0 && delta / this.total >= 0.08) {
      this.triggerSpike();
    }
  }

  private showTrend(delta: number): void {
    if (this.trendClearTimeout !== null) clearTimeout(this.trendClearTimeout);
    this.trendEl.textContent = delta > 0 ? '▲' : '▼';
    this.trendEl.className = 'vc-trend vc-trend--visible ' + (delta > 0 ? 'vc-trend--up' : 'vc-trend--down');
    this.trendClearTimeout = window.setTimeout(() => {
      this.trendEl.classList.remove('vc-trend--visible');
    }, 3_500);
  }

  private triggerSpike(): void {
    if (this.spikeClearTimeout !== null) clearTimeout(this.spikeClearTimeout);
    this.eyeEl.classList.add('vc-eye--spike');
    this.tooltipSpikeEl.textContent = '⚡ Activity spike';
    this.tooltipSpikeEl.classList.add('vc-tooltip-spike--visible');
    this.spikeClearTimeout = window.setTimeout(() => {
      this.eyeEl.classList.remove('vc-eye--spike');
      this.tooltipSpikeEl.classList.remove('vc-tooltip-spike--visible');
    }, 8_000);
  }

  private formatCount(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────

  private showTooltip(): void {
    if (this.tooltipTimeout !== null) clearTimeout(this.tooltipTimeout);
    this.tooltipEl.classList.add('vc-tooltip--visible');
  }

  private hideTooltip(): void {
    this.tooltipTimeout = window.setTimeout(() => {
      this.tooltipEl.classList.remove('vc-tooltip--visible');
    }, 120);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  getElement(): HTMLElement {
    return this.el;
  }

  destroy(): void {
    if (this.tickTimeout !== null) clearTimeout(this.tickTimeout);
    if (this.tooltipTimeout !== null) clearTimeout(this.tooltipTimeout);
    if (this.trendClearTimeout !== null) clearTimeout(this.trendClearTimeout);
    if (this.spikeClearTimeout !== null) clearTimeout(this.spikeClearTimeout);
  }
}
