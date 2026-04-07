import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { getCountryFlag } from '@/utils/country-flags';
import type { SanctionEntity } from '@/services/sanctions';

const TYPE_ICONS: Record<SanctionEntity['type'], string> = {
  person: '👤',
  company: '🏢',
  vessel: '🚢',
  aircraft: '✈️',
  other: '⚠️',
};

export class SanctionsTrackerPanel extends Panel {
  private entities: SanctionEntity[] = [];
  private searchQuery = '';
  private loaded = false;

  constructor() {
    super({ id: 'sanctions-tracker', title: '🚫 Sanctions Tracker' });
    this.content.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.classList.contains('sanctions-search-input')) {
        this.searchQuery = target.value.toLowerCase();
        this.renderList();
      }
    });
    this.showLoading('Loading sanctions data...');
  }

  public setEntities(entities: SanctionEntity[]): void {
    this.entities = entities;
    this.loaded = true;
    this.setCount(entities.length);
    this.renderPanel();
  }

  public setSearchQuery(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.renderPanel();
  }

  private renderPanel(): void {
    if (!this.loaded) {
      this.showLoading('Loading sanctions data...');
      return;
    }

    if (this.entities.length === 0) {
      this.showEmptyState('No sanctions data available');
      return;
    }

    const html = `
      <div class="sanctions-container">
        <div class="sanctions-header">
          <input type="text" class="sanctions-search-input" placeholder="Search entities, countries, programs..." value="${escapeHtml(this.searchQuery)}">
          <div class="sanctions-stats">
            Monitoring ${this.entities.length} recent designations across OFAC, EU, UN, and UK.
          </div>
        </div>
        <div class="sanctions-list-container">
          <!-- List rendered dynamically -->
        </div>
      </div>
    `;

    this.setContent(html);
    this.renderList();
  }

  private renderList(): void {
    const container = this.element?.querySelector('.sanctions-list-container');
    if (!container) return;

    const filtered = this.entities.filter(e => {
      if (!this.searchQuery) return true;
      const q = this.searchQuery;
      return e.name.toLowerCase().includes(q) ||
        e.countries.some(c => c.toLowerCase().includes(q) || getCountryFlag(c).includes(q)) ||
        e.programs.some(p => p.toLowerCase().includes(q)) ||
        e.source.toLowerCase().includes(q) ||
        e.aliases?.some(alias => alias.toLowerCase().includes(q)) ||
        e.type.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="sanctions-empty">No entities found matching search.</div>';
      return;
    }

    container.innerHTML = filtered.map(e => {
      const icon = TYPE_ICONS[e.type];
      const flags = e.countries.map(c => getCountryFlag(c)).join(' ');
      const date = new Date(e.dateAdded).toLocaleDateString();
      const programs = e.programs.map(p => `<span class="sanction-program">${escapeHtml(p)}</span>`).join('');
      
      return `
        <div class="sanction-card">
          <div class="sanction-card-icon">${icon}</div>
          <div class="sanction-card-main">
            <div class="sanction-card-header">
              <span class="sanction-name">${escapeHtml(e.name)}</span>
              <span class="sanction-flags">${flags}</span>
            </div>
            <div class="sanction-card-meta">
              <span class="sanction-source-badge">${escapeHtml(e.source)}</span>
              <span class="sanction-date">Added: ${date}</span>
            </div>
            <div class="sanction-card-programs">
              ${programs}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}
