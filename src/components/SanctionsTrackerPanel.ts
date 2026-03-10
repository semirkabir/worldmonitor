import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

export interface SanctionEntity {
  id: string;
  name: string;
  type: 'person' | 'company' | 'vessel' | 'aircraft' | 'other';
  countries: string[];
  programs: string[];
  dateAdded: string;
  source: string;
}

// Sample data to simulate OpenSanctions/OFAC feed
function getRecentSanctions(): SanctionEntity[] {
  const now = new Date();
  const days = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  return [
    { id: '1', name: 'Sovcomflot Vessel NS Century', type: 'vessel', countries: ['RU'], programs: ['OFAC Specially Designated Nationals (SDN)'], dateAdded: days(1), source: 'OFAC' },
    { id: '2', name: 'Arctic LNG 2 LLC', type: 'company', countries: ['RU'], programs: ['EU Sanctions Map', 'OFAC'], dateAdded: days(2), source: 'EU/OFAC' },
    { id: '3', name: 'Kim Jong Un', type: 'person', countries: ['KP'], programs: ['UN Security Council', 'OFAC'], dateAdded: days(5), source: 'UN' },
    { id: '4', name: 'Iran Air', type: 'company', countries: ['IR'], programs: ['EU Sanctions Map', 'OFAC'], dateAdded: days(8), source: 'EU' },
    { id: '5', name: 'Mahan Air Flight QFZ995', type: 'aircraft', countries: ['IR'], programs: ['OFAC'], dateAdded: days(10), source: 'OFAC' },
    { id: '6', name: 'Huawei Technologies Co., Ltd.', type: 'company', countries: ['CN'], programs: ['Entity List'], dateAdded: days(15), source: 'BIS' },
    { id: '7', name: 'PDVSA', type: 'company', countries: ['VE'], programs: ['OFAC SDN'], dateAdded: days(20), source: 'OFAC' },
    { id: '8', name: 'Al-Shabaab Financial Network', type: 'company', countries: ['SO'], programs: ['UN Security Council'], dateAdded: days(22), source: 'UN' },
    { id: '9', name: 'Myanmar Economic Holdings Public Company Limited', type: 'company', countries: ['MM'], programs: ['UK Sanctions List', 'OFAC'], dateAdded: days(25), source: 'UK/OFAC' },
    { id: '10', name: 'Tornado Cash', type: 'other', countries: ['UNKNOWN'], programs: ['OFAC SDN'], dateAdded: days(30), source: 'OFAC' },
  ];
}

const TYPE_ICONS: Record<SanctionEntity['type'], string> = {
  person: '👤',
  company: '🏢',
  vessel: '🚢',
  aircraft: '✈️',
  other: '⚠️',
};

const COUNTRY_FLAGS: Record<string, string> = {
  RU: '🇷🇺', KP: '🇰🇵', IR: '🇮🇷', CN: '🇨🇳', VE: '🇻🇪',
  SY: '🇸🇾', BY: '🇧🇾', CU: '🇨🇺', MM: '🇲🇲', SO: '🇸🇴',
  UNKNOWN: '🌐'
};

export class SanctionsTrackerPanel extends Panel {
  private entities: SanctionEntity[] = [];
  private searchQuery = '';
  private loading = true;

  constructor() {
    super({ id: 'sanctions-tracker', title: '🚫 Sanctions Tracker' });
    this.content.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.classList.contains('sanctions-search-input')) {
        this.searchQuery = target.value.toLowerCase();
        this.renderList();
      }
    });
    void this.fetchData();
  }

  public async fetchData(): Promise<void> {
    // In a real implementation this would fetch from an OpenSanctions proxy or direct API
    // For now we simulate the data load
    await new Promise(r => setTimeout(r, 600));
    this.entities = getRecentSanctions();
    this.loading = false;
    this.renderPanel();
  }

  private renderPanel(): void {
    if (this.loading) {
      this.showLoading('Loading sanctions data...');
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
        e.countries.some(c => c.toLowerCase().includes(q) || (COUNTRY_FLAGS[c] || '').includes(q)) ||
        e.programs.some(p => p.toLowerCase().includes(q)) ||
        e.source.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="sanctions-empty">No entities found matching search.</div>';
      return;
    }

    container.innerHTML = filtered.map(e => {
      const icon = TYPE_ICONS[e.type];
      const flags = e.countries.map(c => COUNTRY_FLAGS[c] || c).join(' ');
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
