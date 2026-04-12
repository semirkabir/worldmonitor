import {
    fetchAirportOpsSummary,
    fetchAirportFlights,
    fetchCarrierOps,
    fetchAircraftPositions,
    fetchFlightPrices,
    fetchAviationNews,
    fetchFlightStatus,
    isPriceExpired,
    type AirportOpsSummary,
    type FlightInstance,
    type CarrierOps,
    type PositionSample,
    type PriceQuote,
    type AviationNewsItem,
    type FlightDelaySeverity,
} from '@/services/aviation';
import { aviationWatchlist } from '@/services/aviation/watchlist';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { Panel } from './Panel';
import { buildArticleLinkAttributes } from '@/services/article-open';

// ---- Helpers ----

const SEVERITY_COLOR: Record<FlightDelaySeverity, string> = {
    normal: 'var(--color-success, #22c55e)',
    minor: '#f59e0b',
    moderate: '#f97316',
    major: '#ef4444',
    severe: '#dc2626',
};

const STATUS_BADGE: Record<string, string> = {
    scheduled: '#6b7280', boarding: '#3b82f6', departed: '#8b5cf6',
    airborne: '#22c55e', landed: '#14b8a6', arrived: '#0ea5e9',
    cancelled: '#ef4444', diverted: '#f59e0b', unknown: '#6b7280',
};

function fmt(n: number | null | undefined): string { return n == null ? '—' : String(Math.round(n)); }
function fmtTime(dt: Date | null | undefined): string {
    if (!dt) return '—';
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtMin(m: number): string {
    if (!m) return '—';
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function expCountdown(exp: Date | null, now: number): string {
    if (!exp) return '';
    const ms = exp.getTime() - now;
    if (ms <= 0) return '<span style="color:#ef4444;font-size:10px">EXPIRED</span>';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const color = h < 1 ? '#f97316' : '#6b7280';
    return `<span style="font-size:10px;color:${color}">exp ${h > 0 ? `${h}h ` : ''}${m}m</span>`;
}

const TABS = ['ops', 'flights', 'airlines', 'tracking', 'news', 'prices', 'search'] as const;
type Tab = typeof TABS[number];
const AVIATION_ICON = '🛩️';

const TAB_LABELS: Record<Tab, string> = {
    ops: `${AVIATION_ICON} Ops`, flights: `${AVIATION_ICON} Flights`, airlines: '🏢 Airlines',
    tracking: '📡 Track', news: '📰 News', prices: '💸 Prices', search: '🔍 Search',
};

// ---- Panel class ----

export class AirlineIntelPanel extends Panel {
    private activeTab: Tab = 'ops';
    private airports: string[];
    private opsData: AirportOpsSummary[] = [];
    private flightsData: FlightInstance[] = [];
    private carriersData: CarrierOps[] = [];
    private trackingData: PositionSample[] = [];
    private newsData: AviationNewsItem[] = [];
    private pricesData: PriceQuote[] = [];
    private pricesProvider = 'demo';
    private pricesOrigin = 'IST';
    private pricesDest = 'LHR';
    private pricesDep = '';
    private pricesCurrency = 'usd';
    private searchQuery = '';
    private searchResults: FlightInstance[] = [];
    private searchLoading = false;
    private searchError = '';
    private loading = false;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private liveIndicator!: HTMLElement;
    private tabBar!: HTMLElement;

    constructor() {
        super({ id: 'airline-intel', title: `${AVIATION_ICON} Airline Intelligence`, trackActivity: true });

        const wl = aviationWatchlist.get();
        this.airports = wl.airports.slice(0, 8);

        // Add refresh button to header
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'icon-btn';
        refreshBtn.title = 'Refresh';
        refreshBtn.textContent = '↻';
        refreshBtn.addEventListener('click', () => this.refresh());
        this.header.appendChild(refreshBtn);

        // Add LIVE indicator badge to the title
        this.liveIndicator = document.createElement('span');
        this.liveIndicator.className = 'live-badge';
        this.liveIndicator.textContent = '\u25CF LIVE';
        this.liveIndicator.style.cssText = 'display:none;color:#22c55e;font-size:10px;font-weight:700;margin-left:8px;letter-spacing:0.5px;';
        this.header.querySelector('.panel-title')?.appendChild(this.liveIndicator);

        // Insert tab bar between header and content
        this.tabBar = document.createElement('div');
        this.tabBar.className = 'panel-tabs';
        TABS.forEach(tab => {
            const btn = document.createElement('button');
            btn.className = `panel-tab${tab === this.activeTab ? ' active' : ''}`;
            btn.textContent = TAB_LABELS[tab];
            btn.dataset.tab = tab;
            btn.addEventListener('click', () => this.switchTab(tab as Tab));
            this.tabBar.appendChild(btn);
        });
        this.element.insertBefore(this.tabBar, this.content);

        // Add styling class to inherited content div
        this.content.classList.add('airline-intel-content');

        // Event delegation on stable content element (survives innerHTML replacements)
        this.content.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.id === 'priceSearchBtn' || target.closest('#priceSearchBtn')) {
                this.pricesOrigin = ((this.content.querySelector('#priceFromInput') as HTMLInputElement)?.value || 'IST').toUpperCase();
                this.pricesDest = ((this.content.querySelector('#priceToInput') as HTMLInputElement)?.value || 'LHR').toUpperCase();
                this.pricesDep = (this.content.querySelector('#priceDepInput') as HTMLInputElement)?.value || '';
                this.pricesCurrency = (this.content.querySelector('#priceCurrencySelect') as HTMLSelectElement)?.value || 'usd';
                void this.loadTab('prices');
            }
            if (target.id === 'flightSearchBtn' || target.closest('#flightSearchBtn')) {
                void this.doFlightSearch();
            }
            if (target.id === 'flightSearchClearBtn' || target.closest('#flightSearchClearBtn')) {
                this.searchQuery = '';
                this.searchResults = [];
                this.searchError = '';
                this.renderTab();
            }
        });

        this.content.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.target instanceof HTMLInputElement) && e.target.id === 'flightSearchInput') {
                e.preventDefault();
                void this.doFlightSearch();
            }
        });

        void this.refresh();

        // Auto-refresh every 5 min — refresh() loads ops + active tab
        this.refreshTimer = setInterval(() => void this.refresh(), 5 * 60_000);
    }

    toggle(visible: boolean): void {
        this.element.style.display = visible ? '' : 'none';
    }

    destroy(): void {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        super.destroy();
    }

    /** Called by the map when new aircraft positions arrive. */
    updateLivePositions(positions: PositionSample[]): void {
        this.trackingData = positions;
        if (this.activeTab === 'tracking') this.renderTab();
    }

    /** Toggle the LIVE indicator badge. */
    setLiveMode(active: boolean): void {
        this.liveIndicator.style.display = active ? '' : 'none';
    }

    private switchTab(tab: Tab): void {
        this.activeTab = tab;
        this.tabBar.querySelectorAll('.panel-tab').forEach(b => {
            b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab);
        });
        this.renderTab();
        if ((tab === 'ops' && !this.opsData.length) ||
            (tab === 'flights' && !this.flightsData.length) ||
            (tab === 'airlines' && !this.carriersData.length) ||
            (tab === 'tracking' && !this.trackingData.length) ||
            (tab === 'news' && !this.newsData.length) ||
            (tab === 'prices' && !this.pricesData.length)) {
            void this.loadTab(tab);
        }
    }

    private async refresh(): Promise<void> {
        void this.loadOps();
        void this.loadTab(this.activeTab);
    }

    private async loadOps(): Promise<void> {
        this.opsData = await fetchAirportOpsSummary(this.airports);
        if (this.activeTab === 'ops') this.renderTab();
    }

    private async loadTab(tab: Tab): Promise<void> {
        this.loading = true;
        this.renderTab();
        try {
            switch (tab) {
                case 'ops':
                    this.opsData = await fetchAirportOpsSummary(this.airports);
                    break;
                case 'flights':
                    this.flightsData = await fetchAirportFlights(this.airports[0] ?? 'IST', 'both', 30);
                    break;
                case 'airlines':
                    this.carriersData = await fetchCarrierOps(this.airports);
                    break;
                case 'tracking':
                    this.trackingData = await fetchAircraftPositions({});
                    break;
                case 'news': {
                    const entities = [...this.airports, ...aviationWatchlist.get().airlines];
                    this.newsData = await fetchAviationNews(entities, 24, 20);
                    break;
                }
                case 'prices': {
                    const dep = this.pricesDep || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                    const result = await fetchFlightPrices({
                        origin: this.pricesOrigin, destination: this.pricesDest,
                        departureDate: dep, currency: this.pricesCurrency,
                    });
                    this.pricesData = result.quotes;
                    this.pricesProvider = result.provider;
                    break;
                }
            }
        } catch { /* silent */ }
        this.loading = false;
        this.renderTab();
    }

    private renderLoading(): void {
        this.content.innerHTML = '<div class="panel-loading">Loading…</div>';
    }

    private renderTab(): void {
        if (this.loading) { this.renderLoading(); return; }
        switch (this.activeTab) {
            case 'ops': this.renderOps(); break;
            case 'flights': this.renderFlights(); break;
            case 'airlines': this.renderAirlines(); break;
            case 'tracking': this.renderTracking(); break;
            case 'news': this.renderNews(); break;
            case 'prices': this.renderPrices(); break;
            case 'search': this.renderSearch(); break;
        }
    }

    // ---- Search tab ----
    private async doFlightSearch(): Promise<void> {
        const input = this.content.querySelector('#flightSearchInput') as HTMLInputElement;
        const query = input?.value?.trim() || '';
        if (!query) return;
        this.searchQuery = query;
        this.searchLoading = true;
        this.searchError = '';
        this.renderTab();
        try {
            const cleaned = query.replace(/\s/g, '').toUpperCase();
            const results = await fetchFlightStatus(cleaned);
            this.searchResults = results;
            if (!results.length) {
                this.searchError = `No results found for "${query}"`;
            }
        } catch {
            this.searchError = 'Failed to fetch flight status';
            this.searchResults = [];
        }
        this.searchLoading = false;
        this.renderTab();
    }

    private renderSearch(): void {
        const searchForm = `
      <div class="flight-search-form" style="display:flex;gap:8px;padding:12px 4px;align-items:center">
        <input id="flightSearchInput" class="flight-search-input" placeholder="Flight number (e.g. TK1, AA100, EK201)" value="${escapeHtml(this.searchQuery)}" style="flex:1;padding:8px 12px;background:var(--bg-secondary,#1a1a1a);border:1px solid var(--border,#333);border-radius:6px;color:var(--text,#e0e0e0);font-size:14px;outline:none" />
        <button id="flightSearchBtn" class="flight-search-btn" style="padding:8px 16px;background:var(--accent,#3b82f6);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap">Search</button>
        ${this.searchResults.length ? '<button id="flightSearchClearBtn" style="padding:8px 12px;background:transparent;color:var(--text-dim,#888);border:1px solid var(--border,#333);border-radius:6px;cursor:pointer;font-size:13px">Clear</button>' : ''}
      </div>`;

        if (this.searchLoading) {
            this.content.innerHTML = `${searchForm}<div class="panel-loading" style="padding:20px">Searching for "${escapeHtml(this.searchQuery)}"...</div>`;
            return;
        }

        if (this.searchError) {
            this.content.innerHTML = `${searchForm}<div class="search-error" style="padding:16px 4px;color:#ef4444;font-size:13px;text-align:center">${escapeHtml(this.searchError)}</div>`;
            return;
        }

        if (!this.searchResults.length) {
            this.content.innerHTML = `${searchForm}<div class="search-placeholder" style="padding:20px 4px;text-align:center;color:var(--text-dim,#888);font-size:13px">Enter a flight number to track its status, route, and schedule</div>`;
            return;
        }

        const results = this.searchResults.map(f => {
            const color = STATUS_BADGE[f.status] ?? '#6b7280';
            const schedDep = f.scheduledDeparture ? f.scheduledDeparture.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            const schedArr = f.scheduledArrival ? f.scheduledArrival.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            return `
        <div class="search-result-card" style="padding:12px;margin:4px 4px 8px;background:var(--bg-secondary,#1a1a1a);border:1px solid var(--border,#333);border-radius:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span class="search-flight-num" style="font-size:16px;font-weight:700;color:var(--accent,#60a5fa)">${escapeHtml(f.flightNumber)}</span>
            <span class="search-status" style="font-size:11px;font-weight:600;color:${color};text-transform:uppercase;padding:2px 8px;background:${color}22;border-radius:4px">${f.status}</span>
          </div>
          <div class="search-route" style="font-size:14px;margin-bottom:6px">${escapeHtml(f.origin.iata || f.origin.name)} → ${escapeHtml(f.destination.iata || f.destination.name)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;color:var(--text-dim,#888)">
            <div>Departure: ${schedDep}</div>
            <div>Arrival: ${schedArr}</div>
            ${f.delayMinutes > 0 ? `<div style="color:#f97316">Delay: +${f.delayMinutes}m</div>` : ''}
            ${f.gate ? `<div>Gate: ${escapeHtml(f.gate)}</div>` : ''}
            ${f.terminal ? `<div>Terminal: ${escapeHtml(f.terminal)}</div>` : ''}
            ${f.aircraftType ? `<div>Aircraft: ${escapeHtml(f.aircraftType)}</div>` : ''}
          </div>
          ${f.cancelled ? '<div style="margin-top:6px;color:#ef4444;font-weight:600;font-size:12px">⚠️ CANCELLED</div>' : ''}
          ${f.diverted ? '<div style="margin-top:6px;color:#f59e0b;font-weight:600;font-size:12px">⚠️ DIVERTED</div>' : ''}
        </div>`;
        }).join('');

        this.content.innerHTML = `${searchForm}<div class="search-results">${results}</div>`;
    }

    // ---- Ops tab ----
    private renderOps(): void {
        if (!this.opsData.length) {
            this.content.innerHTML = '<div class="no-data">No ops data — loading…</div>';
            return;
        }
        const rows = this.opsData.map(s => `
      <div class="ops-row">
        <div class="ops-iata">${escapeHtml(s.iata)}</div>
        <div class="ops-name">${escapeHtml(s.name || s.iata)}</div>
        <div class="ops-severity" style="color:${SEVERITY_COLOR[s.severity] ?? '#aaa'}">${s.severity.toUpperCase()}</div>
        <div class="ops-delay">${s.avgDelayMinutes > 0 ? `+${s.avgDelayMinutes}m` : '—'}</div>
        <div class="ops-cancel">${s.cancellationRate > 0 ? `${s.cancellationRate.toFixed(1)}% cxl` : ''}</div>
        ${s.closureStatus ? '<div class="ops-closed">CLOSED</div>' : ''}
        ${s.notamFlags.length ? `<div class="ops-notam">⚠️ NOTAM</div>` : ''}
      </div>`).join('');
        this.content.innerHTML = `<div class="ops-grid">${rows}</div>`;
    }

    // ---- Flights tab ----
    private renderFlights(): void {
        if (!this.flightsData.length) {
            this.content.innerHTML = `<div class="no-data">No flights — select airport in settings.</div>`;
            return;
        }
        const rows = this.flightsData.map(f => {
            const color = STATUS_BADGE[f.status] ?? '#6b7280';
            return `
        <div class="flight-row">
          <div class="flight-num">${escapeHtml(f.flightNumber)}</div>
          <div class="flight-route">${escapeHtml(f.origin.iata)} → ${escapeHtml(f.destination.iata)}</div>
          <div class="flight-time">${fmtTime(f.scheduledDeparture)}</div>
          <div class="flight-delay" style="color:${f.delayMinutes > 0 ? '#f97316' : '#aaa'}">${f.delayMinutes > 0 ? `+${f.delayMinutes}m` : ''}</div>
          <div class="flight-status" style="color:${color}">${f.status}</div>
        </div>`;
        }).join('');
        this.content.innerHTML = `<div class="flights-list">${rows}</div>`;
    }

    // ---- Airlines tab ----
    private renderAirlines(): void {
        if (!this.carriersData.length) {
            this.content.innerHTML = '<div class="no-data">No carrier data yet.</div>';
            return;
        }
        const rows = this.carriersData.slice(0, 15).map(c => `
      <div class="carrier-row">
        <div class="carrier-name">${escapeHtml(c.carrierName || c.carrierIata)}</div>
        <div class="carrier-flights">${c.totalFlights} flt</div>
        <div class="carrier-delay" style="color:${c.delayPct > 30 ? '#ef4444' : '#aaa'}">${c.delayPct.toFixed(1)}% delayed</div>
        <div class="carrier-cancel">${c.cancellationRate.toFixed(1)}% cxl</div>
      </div>`).join('');
        this.content.innerHTML = `<div class="carriers-list">${rows}</div>`;
    }

    // ---- Tracking tab ----
    private renderTracking(): void {
        if (!this.trackingData.length) {
            this.content.innerHTML = '<div class="no-data">No aircraft tracking data.</div>';
            return;
        }
        const rows = this.trackingData.slice(0, 20).map(p => `
      <div class="track-row">
        <div class="track-cs">${escapeHtml(p.callsign || p.icao24)}</div>
        <div class="track-alt">${fmt(p.altitudeFt)} ft</div>
        <div class="track-spd">${fmt(p.groundSpeedKts)} kts</div>
        <div class="track-pos">${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}</div>
      </div>`).join('');
        this.content.innerHTML = `<div class="tracking-list">${rows}</div>`;
    }

    // ---- News tab ----
    private renderNews(): void {
        if (!this.newsData.length) {
            this.content.innerHTML = '<div class="no-data">No aviation news.</div>';
            return;
        }
        const items = this.newsData.map(n => {
      const articleAttrs = buildArticleLinkAttributes({ url: n.url, title: n.title, source: n.sourceName, publishedAt: n.publishedAt });
      return `
      <div class="news-item" style="padding:8px 0;border-bottom:1px solid var(--border,#2a2a2a)">
        <a href="${sanitizeUrl(n.url)}" target="_blank" rel="noopener" class="news-link" ${articleAttrs}>${escapeHtml(n.title)}</a>
        <div class="news-meta" style="font-size:11px;color:var(--text-dim,#888);margin-top:2px">${escapeHtml(n.sourceName)} · ${n.publishedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>`;
    }).join('');
        this.content.innerHTML = `<div class="news-list" style="padding:0 4px">${items}</div>`;
    }

    // ---- Prices tab ----
    private renderPrices(): void {
        const provider = this.pricesProvider;
        const providerBadge = provider === 'travelpayouts_data'
            ? '<span class="tp-badge">Cached insight \u00b7 Travelpayouts</span>'
            : '<span class="demo-badge">DEMO MODE</span>';

        const searchForm = `
      <div class="price-controls" style="display:flex;gap:6px;flex-wrap:wrap;padding:8px 0;align-items:center">
        <input id="priceFromInput" class="price-input" placeholder="From" maxlength="3" value="${escapeHtml(this.pricesOrigin)}" style="width:54px">
        <span style="color:#6b7280">\u2192</span>
        <input id="priceToInput" class="price-input" placeholder="To" maxlength="3" value="${escapeHtml(this.pricesDest)}" style="width:54px">
        <input id="priceDepInput" class="price-input" type="date" value="${escapeHtml(this.pricesDep)}" style="width:128px">
        <select id="priceCurrencySelect" class="price-input" style="width:58px">
          <option value="usd"${this.pricesCurrency === 'usd' ? ' selected' : ''}>USD</option>
          <option value="eur"${this.pricesCurrency === 'eur' ? ' selected' : ''}>EUR</option>
          <option value="try"${this.pricesCurrency === 'try' ? ' selected' : ''}>TRY</option>
          <option value="gbp"${this.pricesCurrency === 'gbp' ? ' selected' : ''}>GBP</option>
        </select>
        <button id="priceSearchBtn" class="icon-btn" style="padding:4px 10px">Search</button>
      </div>
      <div style="margin-bottom:6px">${providerBadge}<span style="font-size:10px;color:#6b7280;margin-left:6px">All prices indicative</span></div>`;

        if (!this.pricesData.length) {
            this.content.innerHTML = `${searchForm}<div class="no-data">Enter route and search for prices.</div>`;
        } else {
            const now = Date.now();
            const active = this.pricesData.filter(q => !isPriceExpired(q));
            const expired = this.pricesData.filter(q => isPriceExpired(q));
            const sorted = [...active, ...expired];

            const rows = sorted.map(q => {
                const exp = isPriceExpired(q);
                const currency = q.currency || this.pricesCurrency.toUpperCase();
                return `
          <div class="price-row" style="${exp ? 'opacity:0.4;' : ''}">
            <div class="price-carrier">${escapeHtml(q.carrierName || q.carrierIata || '\u2014')}</div>
            <div class="price-route" style="flex:1">${escapeHtml(q.origin)} \u2192 ${escapeHtml(q.destination)}</div>
            <div class="price-amount" style="font-weight:700;color:${exp ? '#6b7280' : 'var(--accent,#60a5fa)'}">${currency} ${Math.round(q.priceAmount)}</div>
            <div class="price-dur">${fmtMin(q.durationMinutes)}</div>
            <div class="price-stops">${q.stops === 0 ? 'nonstop' : `${q.stops} stop`}</div>
            ${expCountdown(q.expiresAt, now)}
          </div>`;
            }).join('');
            this.content.innerHTML = `${searchForm}<div class="prices-list">${rows}</div>`;
        }

    }

    /* Styles moved to panels.css (PERF-012) */
}
