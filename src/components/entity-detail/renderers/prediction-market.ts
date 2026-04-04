import type { EntityRenderer, EntityRenderContext } from '../types';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';
const DATA_API = 'https://data-api.polymarket.com';

export interface PredictionMarketSubMarket {
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  slug: string;
  url: string;
  closed: boolean;
  endDate?: string;
  clobTokenIds?: string[];
  conditionId?: string;
  marketId?: number;
}

export interface MarketHolder {
  address: string;
  shares: number;
  value: number;
  side: 'yes' | 'no';
  label?: string;
  profileImage?: string;
}

export interface MarketComment {
  author: string;
  text: string;
  timestamp: string;
  likes: number;
  profileImage?: string;
  userAddress?: string;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface PredictionMarketPanelData {
  id: string;
  title: string;
  slug: string;
  category: string;
  totalVolume: number;
  liquidity: number;
  endDate?: string;
  closed: boolean;
  description?: string;
  resolutionSource?: string;
  markets: PredictionMarketSubMarket[];
  polymarketUrl: string;
  priceHistory?: Record<string, PricePoint[]>;
  holders?: Record<string, MarketHolder[]>;
  comments?: Record<string, MarketComment[]>;
}

export class PredictionMarketRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const m = data as PredictionMarketPanelData;
    const container = ctx.el('div', 'edp-generic');
    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', m.title));
    if (m.category) header.append(ctx.el('div', 'edp-subtitle', m.category));
    header.append(ctx.badge('Polymarket', 'edp-badge'));
    container.append(header);
    container.append(ctx.el('p', 'edp-description', 'Loading market details…'));
    const [detailCard, detailBody] = ctx.sectionCard('Market Overview');
    detailBody.append(ctx.makeLoading('Loading markets…'));
    container.append(detailCard);
    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<PredictionMarketPanelData> {
    const input = data as { id?: string; title?: string; slug?: string; category?: string; url?: string; volume?: number; endDate?: string; closed?: boolean };
    const slug = input.slug || '';
    const id = input.id || '';

    let markets: PredictionMarketSubMarket[] = [];
    let description: string | undefined;
    let resolutionSource: string | undefined;
    let liquidity = 0;
    let totalVolume = input.volume || 0;
    const priceHistory: Record<string, PricePoint[]> = {};
    const holders: Record<string, MarketHolder[]> = {};
    const comments: Record<string, MarketComment[]> = {};

    if (id && signal && !signal.aborted) {
      try {
        const resp = await fetch(`${GAMMA_API}/events?id=${encodeURIComponent(id)}`, {
          signal,
          headers: { 'Accept': 'application/json' },
        });
        if (resp.ok) {
          const events = await resp.json();
          if (Array.isArray(events) && events.length > 0) {
            const event = events[0];
            totalVolume = event.volumeNum || event.volume || totalVolume;
            liquidity = event.liquidityNum || event.liquidity || liquidity;
            if (event.markets && Array.isArray(event.markets)) {
              for (const mk of event.markets) {
                const prices = mk.outcomePrices ? JSON.parse(mk.outcomePrices) : [];
                const yesPrice = prices[0] != null ? Math.round(Number(prices[0]) * 100) : 50;
                const marketSlug = mk.slug || '';
                markets.push({
                  question: mk.question || mk.outcomes?.split(',')[0] || 'Unknown',
                  yesPrice,
                  noPrice: 100 - yesPrice,
                  volume: mk.volumeNum || 0,
                  slug: marketSlug,
                  url: marketSlug ? `https://polymarket.com/event/${slug}/${marketSlug}` : input.url || '',
                  closed: mk.closed || false,
                  endDate: mk.endDate,
                  clobTokenIds: mk.clobTokenIds || [],
                });

                if (!description && marketSlug) {
                  try {
                    const descResp = await fetch(`${GAMMA_API}/markets?slug=${encodeURIComponent(marketSlug)}`, { signal });
                    if (descResp.ok) {
                      const descData = await descResp.json();
                      if (Array.isArray(descData) && descData.length > 0) {
                        const mkDesc = descData[0].description;
                        if (mkDesc && !mkDesc.startsWith(mk.question || '')) {
                          description = mkDesc;
                        }
                        resolutionSource = descData[0].resolution_source;
                      }
                    }
                  } catch { /* skip */ }
                }

                if (marketSlug && !mk.closed) {
                  try {
                    const rawTokenIds = mk.clobTokenIds;
                    let tokenIds: string[] = [];
                    if (typeof rawTokenIds === 'string') {
                      try { tokenIds = JSON.parse(rawTokenIds); } catch { tokenIds = []; }
                    } else if (Array.isArray(rawTokenIds)) {
                      tokenIds = rawTokenIds;
                    }
                    const tokenId = tokenIds.length > 0 ? tokenIds[0] : '';
                    if (tokenId) {
                      const histResp = await fetch(`${CLOB_API}/prices-history?market=${encodeURIComponent(tokenId)}&interval=1d`, { signal });
                      if (histResp.ok) {
                        const histData = await histResp.json();
                        if (histData.history && Array.isArray(histData.history) && histData.history.length > 1) {
                          priceHistory[marketSlug] = histData.history.map((p: { t: number; p: number }) => ({
                            timestamp: p.t,
                            price: Math.round(p.p * 100),
                          }));
                        }
                      }
                    }
                   } catch { /* no history */ }
                 }

                const conditionId = mk.conditionId || mk.condition_id;
                const marketId = mk.id;

                if (conditionId) {
                  try {
                    const holdersResp = await fetch(`${DATA_API}/holders?market=${encodeURIComponent(conditionId)}&limit=5`, { signal });
                    if (holdersResp.ok) {
                      const holdersData = await holdersResp.json();
                      if (Array.isArray(holdersData) && holdersData.length > 0) {
                        const entry = holdersData[0];
                        if (entry.holders && Array.isArray(entry.holders)) {
                          holders[marketSlug] = entry.holders.map((h: { proxyWallet: string; amount: number; outcomeIndex: number; name?: string; pseudonym?: string; profileImage?: string }) => ({
                            address: h.proxyWallet || '',
                            shares: Math.round(h.amount || 0),
                            value: (h.amount || 0) * (h.outcomeIndex === 0 ? yesPrice / 100 : (100 - yesPrice) / 100),
                            side: h.outcomeIndex === 0 ? 'yes' : 'no',
                            label: h.name || h.pseudonym || `${h.proxyWallet?.slice(0, 6)}…${h.proxyWallet?.slice(-4)}`,
                            profileImage: h.profileImage,
                          }));
                        }
                      }
                    }
                  } catch { /* skip */ }
                }

                if (marketId) {
                  try {
                    const commentsResp = await fetch(`${GAMMA_API}/comments?parent_entity_type=market&parent_entity_id=${marketId}&limit=10&order=createdAt&ascending=false`, { signal });
                    if (commentsResp.ok) {
                      const commentsData = await commentsResp.json();
                      if (Array.isArray(commentsData)) {
                        comments[marketSlug] = commentsData.map((c: { body: string; createdAt: string; profile?: { name?: string; pseudonym?: string; profileImage?: string }; reactionCount?: number; userAddress?: string }) => ({
                          author: c.profile?.name || c.profile?.pseudonym || 'Anonymous',
                          text: c.body || '',
                          timestamp: c.createdAt || '',
                          likes: c.reactionCount || 0,
                          profileImage: c.profile?.profileImage,
                          userAddress: c.userAddress,
                        })).filter((c: MarketComment) => c.text.length > 0);
                      }
                    }
                  } catch { /* skip */ }
                }
              }
            }
          }
        }
      } catch { /* fall through */ }
    }

    if (!description) {
      description = input.title || 'Prediction Market';
    }

    if (markets.length === 0) {
      const yesPrice = 50;
      markets.push({
        question: input.title || 'Prediction Market',
        yesPrice,
        noPrice: 100 - yesPrice,
        volume: totalVolume,
        slug,
        url: input.url || `https://polymarket.com/event/${slug}`,
        closed: input.closed || false,
        endDate: input.endDate,
      });
    }

    return {
      id, title: input.title || 'Prediction Market', slug, category: input.category || '',
      totalVolume, liquidity, endDate: input.endDate, closed: input.closed || false,
      description, resolutionSource, markets,
      polymarketUrl: input.url || `https://polymarket.com/event/${slug}`,
      priceHistory, holders, comments,
    };
  }

  renderEnriched(container: HTMLElement, enrichedData: unknown, ctx: EntityRenderContext): void {
    const data = enrichedData as PredictionMarketPanelData;
    container.replaceChildren();

    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', data.title));
    if (data.category) header.append(ctx.el('div', 'edp-subtitle', data.category));
    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge('Polymarket', 'edp-badge'));
    if (data.closed) badgeRow.append(ctx.badge('CLOSED', 'edp-badge edp-badge--closed'));
    header.append(badgeRow);
    container.append(header);

    if (data.description && data.description !== data.title && data.description.length > 20) {
      container.append(ctx.el('p', 'edp-description', data.description));
    }

    const [overviewCard, overviewBody] = ctx.sectionCard('Overview');
    overviewBody.append(makeStatRow(ctx, 'Total Volume', formatVolume(data.totalVolume)));
    overviewBody.append(makeStatRow(ctx, 'Liquidity', formatVolume(data.liquidity)));
    if (data.endDate) overviewBody.append(makeStatRow(ctx, 'Resolution', formatDate(data.endDate)));
    if (data.resolutionSource) overviewBody.append(makeStatRow(ctx, 'Source', data.resolutionSource));
    container.append(overviewCard);

    const [marketsCard, marketsBody] = ctx.sectionCard(`${data.markets.length} Market${data.markets.length !== 1 ? 's' : ''}`);
    for (const market of data.markets) {
      marketsBody.append(createMarketAccordion(ctx, market, data.priceHistory?.[market.slug] || [], data.holders?.[market.slug] || [], data.comments?.[market.slug] || []));
    }
    container.append(marketsCard);

    const tradeBtn = ctx.el('a', 'edp-trade-btn') as HTMLAnchorElement;
    tradeBtn.href = data.polymarketUrl;
    tradeBtn.target = '_blank';
    tradeBtn.rel = 'noopener noreferrer';
    tradeBtn.textContent = 'Trade on Polymarket →';
    container.append(tradeBtn);
  }
}

function createMarketAccordion(ctx: EntityRenderContext, market: PredictionMarketSubMarket, history: PricePoint[], h: MarketHolder[], c: MarketComment[]): HTMLElement {
  const wrapper = ctx.el('div', 'edp-poly-accordion');
  const header = ctx.el('button', 'edp-poly-accordion-header');
  header.append(ctx.el('span', 'edp-poly-accordion-title', market.question));
  const priceBadge = ctx.el('span', `edp-poly-price edp-poly-price--${market.closed ? 'closed' : 'active'}`);
  priceBadge.textContent = `${market.yesPrice}%`;
  header.append(priceBadge);
  header.append(ctx.el('span', 'edp-poly-chevron', '▸'));

  const body = ctx.el('div', 'edp-poly-accordion-body');
  body.style.display = 'none';
  header.addEventListener('click', () => {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    const chev = header.querySelector('.edp-poly-chevron') as HTMLElement;
    if (chev) chev.textContent = isOpen ? '▸' : '▾';
    if (!isOpen && !body.dataset.loaded) {
      body.dataset.loaded = 'true';
      renderMarketDetail(ctx, body, market, history, h, c);
    }
  });

  wrapper.append(header, body);
  return wrapper;
}

function renderMarketDetail(ctx: EntityRenderContext, body: HTMLElement, market: PredictionMarketSubMarket, history: PricePoint[], holders: MarketHolder[], comments: MarketComment[]): void {
  const chartSection = ctx.el('div', 'edp-poly-section');
  const chartHeader = ctx.el('div', 'edp-poly-section-header');
  chartHeader.append(ctx.el('span', 'edp-poly-section-title', 'Price History'));
  chartSection.append(chartHeader);
  const chartContainer = ctx.el('div', 'edp-poly-chart');
  if (history.length > 1) {
    chartContainer.append(createPriceChart(history, market.yesPrice));
  } else {
    chartContainer.append(ctx.el('div', 'edp-poly-chart-placeholder', 'Insufficient history data'));
  }
  chartSection.append(chartContainer);
  body.append(chartSection);

  const barSection = ctx.el('div', 'edp-poly-section');
  const yesBar = ctx.el('div', 'edp-poly-bar-track');
  const yesFill = ctx.el('div', 'edp-poly-bar-yes');
  yesFill.style.width = `${market.yesPrice}%`;
  const noFill = ctx.el('div', 'edp-poly-bar-no');
  noFill.style.width = `${market.noPrice}%`;
  yesBar.append(yesFill, noFill);
  const labels = ctx.el('div', 'edp-poly-bar-labels');
  labels.append(ctx.el('span', 'edp-poly-bar-label edp-poly-bar-label--yes', `Yes ${market.yesPrice}%`));
  labels.append(ctx.el('span', 'edp-poly-bar-label edp-poly-bar-label--no', `No ${market.noPrice}%`));
  barSection.append(yesBar, labels);
  body.append(barSection);

  const stats = ctx.el('div', 'edp-poly-stats');
  stats.append(makeStatRow(ctx, 'Volume', formatVolume(market.volume)));
  if (market.endDate) stats.append(makeStatRow(ctx, 'Resolves', formatDate(market.endDate)));
  body.append(stats);

  if (holders.length > 0) {
    body.append(createCollapsibleSection(ctx, `Top Holders (${holders.length})`, holders.map(h => createHolderRow(ctx, h))));
  }

  if (comments.length > 0) {
    body.append(createCollapsibleSection(ctx, `Comments (${comments.length})`, comments.map(c => createCommentRow(ctx, c))));
  }

  if (!market.closed) {
    const tradeLink = ctx.el('a', 'edp-poly-trade-link') as HTMLAnchorElement;
    tradeLink.href = market.url;
    tradeLink.target = '_blank';
    tradeLink.rel = 'noopener noreferrer';
    tradeLink.textContent = 'Trade on Polymarket →';
    body.append(tradeLink);
  } else {
    body.append(ctx.el('div', 'edp-poly-closed', 'This market is closed'));
  }
}

function createCollapsibleSection(ctx: EntityRenderContext, title: string, children: HTMLElement[]): HTMLElement {
  const section = ctx.el('div', 'edp-poly-section');
  const header = ctx.el('button', 'edp-poly-section-header edp-poly-section-toggle');
  header.append(ctx.el('span', 'edp-poly-section-title', title));
  header.append(ctx.el('span', 'edp-poly-chevron', '▸'));
  section.append(header);

  const body = ctx.el('div', 'edp-poly-section-body');
  body.style.display = 'none';
  for (const child of children) body.append(child);
  section.append(body);

  header.addEventListener('click', () => {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    const chev = header.querySelector('.edp-poly-chevron') as HTMLElement;
    if (chev) chev.textContent = isOpen ? '▸' : '▾';
  });

  return section;
}

function createPriceChart(history: PricePoint[], currentPrice: number): SVGElement {
  const width = 360, height = 100, pad = 4;
  const prices = history.map(p => p.price);
  const minP = Math.max(0, Math.min(...prices) - 5);
  const maxP = Math.min(100, Math.max(...prices) + 5);
  const range = maxP - minP || 1;
  const points = history.map((p, i) => {
    const x = pad + (i / (history.length - 1)) * (width - pad * 2);
    const y = height - pad - ((p.price - minP) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  const areaPoints = `${pad},${height - pad} ${points} ${width - pad},${height - pad}`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'edp-poly-chart-svg');
  svg.setAttribute('preserveAspectRatio', 'none');

  [25, 50, 75].forEach(pct => {
    const y = height - pad - ((pct - minP) / range) * (height - pad * 2);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(pad));
    line.setAttribute('x2', String(width - pad));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', 'var(--border-subtle)');
    line.setAttribute('stroke-width', '0.5');
    line.setAttribute('stroke-dasharray', '2,3');
    svg.appendChild(line);
  });

  const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  area.setAttribute('points', areaPoints);
  area.setAttribute('fill', currentPrice >= 50 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)');
  svg.appendChild(area);

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', currentPrice >= 50 ? '#22C55E' : '#EF4444');
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polyline);

  const lastPoint = history[history.length - 1];
  if (lastPoint) {
    const cx = width - pad;
    const cy = height - pad - ((lastPoint.price - minP) / range) * (height - pad * 2);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(cy));
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', currentPrice >= 50 ? '#22C55E' : '#EF4444');
    svg.appendChild(dot);
  }

  return svg;
}

function createHolderRow(ctx: EntityRenderContext, h: MarketHolder): HTMLElement {
  const row = ctx.el('div', 'edp-poly-holder');
  const avatar = ctx.el('div', `edp-poly-holder-avatar edp-poly-holder-avatar--${h.side}`);
  avatar.textContent = h.address.slice(0, 2).toUpperCase();
  row.append(avatar);
  const info = ctx.el('div', 'edp-poly-holder-info');
  info.append(ctx.el('div', 'edp-poly-holder-address', h.label || `${h.address.slice(0, 6)}…${h.address.slice(-4)}`));
  info.append(ctx.el('div', 'edp-poly-holder-shares', `${h.shares.toLocaleString()} shares · ${formatVolume(h.value)}`));
  row.append(info);
  row.append(ctx.el('span', `edp-poly-holder-side edp-poly-holder-side--${h.side}`, h.side.toUpperCase()));
  return row;
}

function createCommentRow(ctx: EntityRenderContext, c: MarketComment): HTMLElement {
  const row = ctx.el('div', 'edp-poly-comment');
  const avatar = ctx.el('div', 'edp-poly-comment-avatar');
  avatar.textContent = c.author.slice(0, 2).toUpperCase();
  row.append(avatar);
  const content = ctx.el('div', 'edp-poly-comment-content');
  const top = ctx.el('div', 'edp-poly-comment-top');
  top.append(ctx.el('span', 'edp-poly-comment-author', c.author));
  top.append(ctx.el('span', 'edp-poly-comment-time', formatRelativeTime(c.timestamp)));
  content.append(top);
  content.append(ctx.el('div', 'edp-poly-comment-text', c.text));
  content.append(ctx.el('div', 'edp-poly-comment-likes', `♥ ${c.likes}`));
  row.append(content);
  return row;
}

function makeStatRow(ctx: EntityRenderContext, label: string, value: string): HTMLElement {
  const row = ctx.el('div', 'edp-poly-stat');
  row.append(ctx.el('span', 'edp-poly-stat-label', label));
  row.append(ctx.el('span', 'edp-poly-stat-value', value));
  return row;
}

function formatVolume(v: number): string {
  if (!v || v === 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(d: string): string {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; }
}

function formatRelativeTime(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch { return ''; }
}
