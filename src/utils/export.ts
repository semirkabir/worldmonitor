import type { NewsItem, ClusteredEvent, MarketData } from '@/types';
import type { PredictionMarket } from '@/services/prediction';
import { showShellNotification } from '@/app/shell-notifications';

interface ExportData {
  news?: NewsItem[] | ClusteredEvent[];
  markets?: MarketData[];
  predictions?: PredictionMarket[];
  signals?: unknown[];
  timestamp: number;
}

export function exportToJSON(data: ExportData, filename = 'worldmonitor-export'): void {
  const jsonStr = JSON.stringify(data, null, 2);
  downloadFile(jsonStr, `${filename}.json`, 'application/json');
}

export function exportToCSV(data: ExportData, filename = 'worldmonitor-export'): void {
  const lines: string[] = [];

  if (data.news && data.news.length > 0) {
    lines.push('=== NEWS ===');
    lines.push('Title,Source,Link,Published,IsAlert');
    data.news.forEach(item => {
      if ('primaryTitle' in item) {
        const cluster = item as ClusteredEvent;
        lines.push(csvRow([
          cluster.primaryTitle,
          cluster.primarySource,
          cluster.primaryLink,
          cluster.lastUpdated.toISOString(),
          String(cluster.isAlert),
        ]));
      } else {
        const news = item as NewsItem;
        lines.push(csvRow([
          news.title,
          news.source,
          news.link,
          news.pubDate?.toISOString() || '',
          String(news.isAlert),
        ]));
      }
    });
    lines.push('');
  }

  if (data.markets && data.markets.length > 0) {
    lines.push('=== MARKETS ===');
    lines.push('Symbol,Name,Price,Change');
    data.markets.forEach(m => {
      lines.push(csvRow([m.symbol, m.name, String(m.price ?? ''), String(m.change ?? '')]));
    });
    lines.push('');
  }

  if (data.predictions && data.predictions.length > 0) {
    lines.push('=== PREDICTIONS ===');
    lines.push('Title,Yes Price,Volume');
    data.predictions.forEach(p => {
      lines.push(csvRow([p.title, String(p.yesPrice), String(p.volume ?? '')]));
    });
    lines.push('');
  }

  downloadFile(lines.join('\n'), `${filename}.csv`, 'text/csv');
}

export interface CountryBriefExport {
  country: string;
  code: string;
  score?: number;
  level?: string;
  trend?: string;
  components?: { unrest: number; conflict: number; security: number; information: number };
  signals?: Record<string, number | string | null>;
  brief?: string;
  headlines?: Array<{ title: string; source: string; link: string; pubDate?: string }>;
  generatedAt: string;
}

export function exportCountryBriefJSON(data: CountryBriefExport): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadFile(JSON.stringify(data, null, 2), `country-brief-${data.code}-${timestamp}.json`, 'application/json');
}

export function exportCountryBriefCSV(data: CountryBriefExport): void {
  const lines: string[] = [];
  lines.push(`Country Brief: ${data.country} (${data.code})`);
  lines.push(`Generated: ${data.generatedAt}`);
  lines.push('');
  if (data.score != null) {
    lines.push(`Score,${data.score}`);
    lines.push(`Level,${data.level || ''}`);
    lines.push(`Trend,${data.trend || ''}`);
  }
  if (data.components) {
    lines.push('');
    lines.push('Component,Value');
    lines.push(`Unrest,${data.components.unrest}`);
    lines.push(`Conflict,${data.components.conflict}`);
    lines.push(`Security,${data.components.security}`);
    lines.push(`Information,${data.components.information}`);
  }
  if (data.signals) {
    lines.push('');
    lines.push('Signal,Count');
    for (const [k, v] of Object.entries(data.signals)) {
      lines.push(csvRow([k, String(v)]));
    }
  }
  if (data.headlines && data.headlines.length > 0) {
    lines.push('');
    lines.push('Title,Source,Link,Published');
    data.headlines.forEach(h => lines.push(csvRow([h.title, h.source, h.link, h.pubDate || ''])));
  }
  if (data.brief) {
    lines.push('');
    lines.push('Intelligence Brief');
    lines.push(`"${data.brief.replace(/"/g, '""')}"`);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadFile(lines.join('\n'), `country-brief-${data.code}-${timestamp}.csv`, 'text/csv');
}

function csvRow(values: string[]): string {
  return values.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',');
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export class ExportPanel {
  private element: HTMLElement;
  private menu: HTMLElement;
  private isOpen = false;
  private boundClose = (e: MouseEvent) => {
    if (!this.element.contains(e.target as Node)) this.closeMenu();
  };

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'export-panel-container';
    this.element.innerHTML = `
      <button class="export-btn" title="Screenshot" aria-haspopup="true" aria-expanded="false">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </button>
      <div class="snap-menu hidden" role="menu">
        <div class="snap-menu-label">SNAPSHOT</div>
        <button class="snap-menu-item" data-action="download" role="menuitem">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Download image</span>
        </button>
        <button class="snap-menu-item" data-action="copy" role="menuitem">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>Copy image</span>
        </button>
        <button class="snap-menu-item" data-action="newtab" role="menuitem">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          <span>Open in new tab</span>
        </button>
        <button class="snap-menu-item snap-menu-item--x" data-action="tweetx" role="menuitem">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.629 5.905-5.629Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          <span>Share on X</span>
        </button>
      </div>
    `;

    this.menu = this.element.querySelector('.snap-menu')!;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const btn = this.element.querySelector('.export-btn')!;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isOpen ? this.closeMenu() : this.openMenu();
    });

    this.menu.addEventListener('click', async (e) => {
      const item = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!item) return;
      this.closeMenu();
      const canvas = await this.buildCanvas();
      if (!canvas) return;
      switch (item.dataset.action) {
        case 'download': this.download(canvas); break;
        case 'copy':     await this.copyToClipboard(canvas); break;
        case 'newtab':   this.openInNewTab(canvas); break;
        case 'tweetx':   await this.shareToX(canvas); break;
      }
    });
  }

  private openMenu(): void {
    this.isOpen = true;
    this.menu.classList.remove('hidden');
    this.element.querySelector('.export-btn')!.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', this.boundClose), 0);
  }

  private closeMenu(): void {
    this.isOpen = false;
    this.menu.classList.add('hidden');
    this.element.querySelector('.export-btn')!.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', this.boundClose);
  }

  private async buildCanvas(): Promise<HTMLCanvasElement | null> {
    try {
      const mapEl = document.querySelector('#map-container') as HTMLElement;
      const panelsEl = document.querySelector('#panelsGrid') as HTMLElement;
      const headerEl = document.querySelector('.shell-header') as HTMLElement;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const canvas = document.createElement('canvas');
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      if (headerEl) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, width, headerEl.offsetHeight);
      }

      if (mapEl) {
        const img = await this.html2canvasWrapper(mapEl);
        if (img) {
          const rect = mapEl.getBoundingClientRect();
          ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height);
        }
      }

      if (panelsEl) {
        const img = await this.html2canvasWrapper(panelsEl);
        if (img) {
          const rect = panelsEl.getBoundingClientRect();
          ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height);
        }
      }

      return canvas;
    } catch (error) {
      console.warn('Screenshot failed:', error);
      showShellNotification('Screenshot failed', 'error');
      return null;
    }
  }

  private download(canvas: HTMLCanvasElement): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.download = `worldmonitor-${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showShellNotification('Screenshot downloaded', 'success');
  }

  private async copyToClipboard(canvas: HTMLCanvasElement): Promise<void> {
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showShellNotification('Screenshot copied to clipboard', 'success');
      } catch {
        showShellNotification('Could not copy to clipboard', 'error');
      }
    }, 'image/png');
  }

  private openInNewTab(canvas: HTMLCanvasElement): void {
    const dataUrl = canvas.toDataURL('image/png');
    const win = window.open();
    if (win) {
      win.document.write(`<img src="${dataUrl}" style="max-width:100%;display:block">`);
      win.document.title = 'WorldMonitor Snapshot';
    }
  }

  private async shareToX(canvas: HTMLCanvasElement): Promise<void> {
    // Try Web Share API first (supports image files on mobile/some desktop browsers)
    if (navigator.canShare) {
      try {
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (blob) {
          const file = new File([blob], 'worldmonitor-snapshot.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text: 'WorldMonitor Snapshot' });
            return;
          }
        }
      } catch (err) {
        if ((err as DOMException).name !== 'AbortError') {
          // fall through to Twitter intent
        } else {
          return; // user cancelled
        }
      }
    }
    // Fallback: copy image then open Twitter intent so user can paste
    canvas.toBlob(async (blob) => {
      if (blob) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showShellNotification('Image copied — paste it into your tweet', 'info', 4000);
        } catch { /* clipboard not available */ }
      }
      const text = encodeURIComponent('WorldMonitor — Real-time global intelligence');
      window.open(`https://x.com/intent/tweet?text=${text}`, '_blank', 'noopener,width=600,height=450');
    }, 'image/png');
  }

  private html2canvasWrapper(el: HTMLElement): Promise<HTMLCanvasElement | null> {
    return new Promise((resolve) => {
      if (typeof (window as unknown as { html2canvas?: (el: HTMLElement) => Promise<HTMLCanvasElement> }).html2canvas === 'function') {
        (window as unknown as { html2canvas: (el: HTMLElement) => Promise<HTMLCanvasElement> }).html2canvas(el).then(resolve).catch(() => resolve(null));
      } else {
        resolve(null);
      }
    });
  }

  public getElement(): HTMLElement {
    return this.element;
  }
}
