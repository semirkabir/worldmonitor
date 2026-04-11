import { getSnapshotTimestamps, getSnapshotAt, type DashboardSnapshot } from '@/services/storage';
import { t } from '@/services/i18n';
import { checkFeatureAccess } from '@/services/auth-modal';

const PLAYBACK_PANEL_CLOSE_DELAY_MS = 320;
const PLAYBACK_PANEL_OFFSET_PX = 4;

export class PlaybackControl {
  private element: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private panel: HTMLElement;
  private isPlaybackMode = false;
  private isPanelOpen = false;
  private timestamps: number[] = [];
  private currentIndex = 0;
  private onSnapshotChange: ((snapshot: DashboardSnapshot | null) => void) | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'playback-control';
    this.element.innerHTML = `
      <button class="playback-toggle" title="${t('components.playback.toggleMode')}" aria-label="${t('components.playback.toggleMode')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="playback-icon"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
      </button>
      <div class="playback-panel hidden">
        <div class="playback-header">
          <span>${t('components.playback.historicalPlayback')}</span>
          <button class="playback-close" aria-label="${t('components.playback.close')}">×</button>
        </div>
        <div class="playback-slider-container">
          <input type="range" class="playback-slider" min="0" max="100" value="100">
          <div class="playback-time">${t('components.playback.live')}</div>
        </div>
        <div class="playback-controls">
          <button class="playback-btn" data-action="start" aria-label="${t('components.playback.skipToStart')}">⏮</button>
          <button class="playback-btn" data-action="prev" aria-label="${t('components.playback.previous')}">◀</button>
          <button class="playback-btn playback-live" data-action="live">${t('components.playback.live')}</button>
          <button class="playback-btn" data-action="next" aria-label="${t('components.playback.next')}">▶</button>
          <button class="playback-btn" data-action="end" aria-label="${t('components.playback.skipToEnd')}">⏭</button>
        </div>
      </div>
    `;

    this.toggleButton = this.element.querySelector('.playback-toggle') as HTMLButtonElement;
    this.panel = this.element.querySelector('.playback-panel') as HTMLElement;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const closeBtn = this.element.querySelector('.playback-close')!;
    const slider = this.element.querySelector('.playback-slider') as HTMLInputElement;

    this.toggleButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!checkFeatureAccess('historical-playback')) return;
      if (this.isPanelOpen) {
        this.closePanel();
        return;
      }
      await this.openPanel();
    });

    this.element.addEventListener('mouseenter', () => {
      void this.openPanel();
    });
    this.element.addEventListener('mouseleave', () => {
      this.scheduleClose();
    });
    this.element.addEventListener('focusin', () => {
      void this.openPanel();
    });
    this.element.addEventListener('focusout', (event) => {
      const related = event.relatedTarget as Node | null;
      if (related && (this.element.contains(related) || this.panel.contains(related))) return;
      this.scheduleClose();
    });

    this.panel.addEventListener('mouseenter', () => this.cancelClose());
    this.panel.addEventListener('mouseleave', () => this.scheduleClose());
    this.panel.addEventListener('focusin', () => this.cancelClose());
    this.panel.addEventListener('focusout', (event) => {
      const related = event.relatedTarget as Node | null;
      if (related && (this.element.contains(related) || this.panel.contains(related))) return;
      this.scheduleClose();
    });

    document.addEventListener('click', (event) => {
      const target = event.target as Node | null;
      if (target && (this.element.contains(target) || this.panel.contains(target))) return;
      this.closePanel();
    });
    window.addEventListener('resize', () => this.positionPanel());
    window.addEventListener('scroll', () => this.positionPanel(), true);

    closeBtn.addEventListener('click', () => {
      this.closePanel();
      this.goLive();
    });

    slider.addEventListener('input', () => {
      const idx = parseInt(slider.value);
      this.currentIndex = idx;
      this.loadSnapshot(idx);
    });

    this.element.querySelectorAll('.playback-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        this.handleAction(action!);
      });
    });
  }

  private cancelClose(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private scheduleClose(): void {
    this.cancelClose();
    this.closeTimer = setTimeout(() => this.closePanel(), PLAYBACK_PANEL_CLOSE_DELAY_MS);
  }

  private async openPanel(): Promise<void> {
    this.cancelClose();
    if (!this.panel.isConnected || this.panel.parentElement !== document.body) {
      document.body.appendChild(this.panel);
    }
    this.panel.classList.remove('hidden');
    this.toggleButton.setAttribute('aria-expanded', 'true');
    this.isPanelOpen = true;
    this.positionPanel();
    await this.loadTimestamps();
  }

  private closePanel(): void {
    this.cancelClose();
    if (!this.isPanelOpen) return;
    this.panel.classList.add('hidden');
    this.toggleButton.setAttribute('aria-expanded', 'false');
    this.isPanelOpen = false;
  }

  private positionPanel(): void {
    if (!this.isPanelOpen) return;
    const rect = this.toggleButton.getBoundingClientRect();
    const panelWidth = this.panel.offsetWidth || 280;
    const panelHeight = this.panel.offsetHeight || 220;
    const viewportPadding = 8;
    let left = rect.right - panelWidth;
    left = Math.min(left, window.innerWidth - panelWidth - viewportPadding);
    left = Math.max(viewportPadding, left);
    let top = rect.bottom + PLAYBACK_PANEL_OFFSET_PX;
    if (top + panelHeight > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, rect.top - panelHeight - PLAYBACK_PANEL_OFFSET_PX);
    }
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
  }

  private async loadTimestamps(): Promise<void> {
    this.timestamps = await getSnapshotTimestamps();
    if (!this.element?.isConnected) return;
    this.timestamps.sort((a, b) => a - b);

    const slider = this.element.querySelector('.playback-slider') as HTMLInputElement;
    slider.max = String(Math.max(0, this.timestamps.length - 1));
    slider.value = slider.max;
    this.currentIndex = this.timestamps.length - 1;

    this.updateTimeDisplay();
  }

  private async loadSnapshot(index: number): Promise<void> {
    if (index < 0 || index >= this.timestamps.length) {
      this.goLive();
      return;
    }

    const timestamp = this.timestamps[index];
    if (!timestamp) {
      this.goLive();
      return;
    }

    this.isPlaybackMode = true;
    this.updateTimeDisplay();

    const snapshot = await getSnapshotAt(timestamp);
    if (!this.element?.isConnected) return;
    this.onSnapshotChange?.(snapshot);

    document.body.classList.add('playback-mode');
    this.element.querySelector('.playback-live')?.classList.remove('active');
  }

  private goLive(): void {
    this.isPlaybackMode = false;
    this.currentIndex = this.timestamps.length - 1;

    const slider = this.element.querySelector('.playback-slider') as HTMLInputElement;
    slider.value = slider.max;

    this.updateTimeDisplay();
    this.onSnapshotChange?.(null);

    document.body.classList.remove('playback-mode');
    this.element.querySelector('.playback-live')?.classList.add('active');
  }

  private handleAction(action: string): void {
    switch (action) {
      case 'start':
        this.currentIndex = 0;
        break;
      case 'prev':
        this.currentIndex = Math.max(0, this.currentIndex - 1);
        break;
      case 'next':
        this.currentIndex = Math.min(this.timestamps.length - 1, this.currentIndex + 1);
        break;
      case 'end':
        this.currentIndex = this.timestamps.length - 1;
        break;
      case 'live':
        this.goLive();
        return;
    }

    const slider = this.element.querySelector('.playback-slider') as HTMLInputElement;
    slider.value = String(this.currentIndex);
    this.loadSnapshot(this.currentIndex);
  }

  private updateTimeDisplay(): void {
    const display = this.element.querySelector('.playback-time')!;

    if (!this.isPlaybackMode || this.timestamps.length === 0) {
      display.textContent = t('components.playback.live');
      display.classList.remove('historical');
      return;
    }

    const timestamp = this.timestamps[this.currentIndex];
    if (timestamp) {
      const date = new Date(timestamp);
      display.textContent = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      display.classList.add('historical');
    }
  }

  public onSnapshot(callback: (snapshot: DashboardSnapshot | null) => void): void {
    this.onSnapshotChange = callback;
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public isInPlaybackMode(): boolean {
    return this.isPlaybackMode;
  }
}
