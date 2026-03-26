import type { NewsItem, ClusteredEvent, MarketData } from '@/types';
import type { PredictionMarket } from '@/services/prediction';

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

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'export-panel-container';
    this.element.innerHTML = `
      <button class="export-btn" title="Take Screenshot">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </button>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const btn = this.element.querySelector('.export-btn')!;

    btn.addEventListener('click', () => {
      this.takeScreenshot();
    });
  }

  private async takeScreenshot(): Promise<void> {
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
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const link = document.createElement('a');
      link.download = `worldmonitor-${timestamp}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
    } catch (error) {
      console.warn('Screenshot failed:', error);
    }
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
