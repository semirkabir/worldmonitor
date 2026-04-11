import { row } from '../types';
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

interface GammaMarketDetail {
  question?: string;
  outcomes?: string;
  outcomePrices?: string;
  volume?: number | string;
  volumeNum?: number;
  slug?: string;
  endDate?: string;
  closed?: boolean;
  clobTokenIds?: string[] | string;
  conditionId?: string;
  condition_id?: string;
  id?: number;
  eventSlug?: string;
  event_slug?: string;
  description?: string;
  resolution_source?: string;
  liquidityNum?: number;
  liquidity?: number;
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

    if (markets.length === 0 && slug && signal && !signal.aborted) {
      try {
        const resp = await fetch(`${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}`, {
          signal,
          headers: { 'Accept': 'application/json' },
        });
        if (resp.ok) {
          const marketRows = await resp.json();
          if (Array.isArray(marketRows) && marketRows.length > 0) {
            const mk = marketRows[0] as GammaMarketDetail;
            const prices = parseOutcomePrices(mk.outcomePrices);
            const yesPrice = prices[0] != null ? Math.round(prices[0] * 100) : 50;
            const marketSlug = mk.slug || slug;
            const eventSlug = mk.eventSlug || mk.event_slug || '';
            totalVolume = readVolume(mk.volumeNum, mk.volume, totalVolume);
            liquidity = typeof mk.liquidityNum === 'number'
              ? mk.liquidityNum
              : typeof mk.liquidity === 'number'
                ? mk.liquidity
                : liquidity;
            description = mk.description || description;
            resolutionSource = mk.resolution_source || resolutionSource;
            markets.push({
              question: mk.question || input.title || 'Prediction Market',
              yesPrice,
              noPrice: 100 - yesPrice,
              volume: totalVolume,
              slug: marketSlug,
              url: eventSlug
                ? `https://polymarket.com/event/${eventSlug}/${marketSlug}`
                : input.url || `https://polymarket.com/market/${marketSlug}`,
              closed: mk.closed || false,
              endDate: mk.endDate || input.endDate,
              clobTokenIds: normalizeTokenIds(mk.clobTokenIds),
              conditionId: mk.conditionId || mk.condition_id,
              marketId: mk.id,
            });
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

    const leadMarket = [...data.markets].sort((a, b) => (b.volume || 0) - (a.volume || 0))[0] ?? null;

    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', data.title));
    if (data.category) header.append(ctx.el('div', 'edp-subtitle', data.category));
    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge('Polymarket', 'edp-badge'));
    if (data.closed) badgeRow.append(ctx.badge('Closed', 'edp-badge edp-badge-dim'));
    header.append(badgeRow);
    container.append(header);

    if (data.description && data.description !== data.title && data.description.length > 20) {
      const callout = ctx.el('div', 'edp-callout edp-prediction-summary');
      callout.append(ctx.el('p', 'edp-callout-text', data.description));
      container.append(callout);
    }

    const [overviewCard, overviewBody] = ctx.sectionCard('Overview');
    if (leadMarket) {
      overviewBody.append(buildPredictionHero(ctx, data, leadMarket));
    }
    const factGrid = ctx.el('div', 'edp-fact-grid edp-prediction-overview-grid');
    factGrid.append(
      makeFactCard(ctx, 'Total Volume', formatVolume(data.totalVolume)),
      makeFactCard(ctx, 'Liquidity', formatVolume(data.liquidity || 0)),
      makeFactCard(ctx, 'Resolution', formatDate(leadMarket?.endDate || data.endDate || '')),
    );
    overviewBody.append(factGrid);
    if (data.resolutionSource) overviewBody.append(row(ctx, 'Resolution Source', data.resolutionSource));
    container.append(overviewCard);

    const secondaryMarkets = leadMarket
      ? data.markets.filter((market) => market.slug !== leadMarket.slug)
      : data.markets;

    if (secondaryMarkets.length > 0) {
      const [marketsCard, marketsBody] = ctx.sectionCard(`${secondaryMarkets.length} Related Market${secondaryMarkets.length !== 1 ? 's' : ''}`);
      for (const market of secondaryMarkets) {
        marketsBody.append(buildMarketCard(
          ctx,
          market,
          data.priceHistory?.[market.slug] || [],
          data.holders?.[market.slug] || [],
          data.comments?.[market.slug] || [],
        ));
      }
      container.append(marketsCard);
    }

    const tradeBtn = ctx.el('a', 'edp-trade-btn edp-prediction-trade-btn') as HTMLAnchorElement;
    tradeBtn.href = data.polymarketUrl;
    tradeBtn.target = '_blank';
    tradeBtn.rel = 'noopener noreferrer';
    tradeBtn.textContent = 'Trade on Polymarket →';
    container.append(tradeBtn);
  }
}

function buildPredictionHero(ctx: EntityRenderContext, data: PredictionMarketPanelData, leadMarket: PredictionMarketSubMarket): HTMLElement {
  const hero = ctx.el('section', 'edp-prediction-hero');
  hero.append(ctx.el('div', 'edp-prediction-market-title', leadMarket.question));
  const top = ctx.el('div', 'edp-prediction-hero-top');
  const score = ctx.el('div', 'edp-prediction-hero-score');
  score.append(
    ctx.el('span', 'edp-prediction-hero-score-label', leadMarket.closed ? 'Final Yes' : 'Current Yes'),
    ctx.el('span', 'edp-prediction-hero-score-value', `${leadMarket.yesPrice}%`),
  );
  const meta = ctx.el('div', 'edp-prediction-hero-meta');
  meta.append(
    makeInlineStat(ctx, 'No', `${leadMarket.noPrice}%`),
    makeInlineStat(ctx, 'Markets', String(data.markets.length)),
    makeInlineStat(ctx, 'Volume', formatVolume(leadMarket.volume || data.totalVolume)),
  );
  top.append(score, meta);
  hero.append(top);

  const bar = buildProbabilityBar(ctx, leadMarket.yesPrice, leadMarket.noPrice);
  hero.append(bar);

  const stats = ctx.el('div', 'edp-fact-grid edp-prediction-market-grid');
  stats.append(
    makeFactCard(ctx, 'Yes', `${leadMarket.yesPrice}%`),
    makeFactCard(ctx, 'No', `${leadMarket.noPrice}%`),
    makeFactCard(ctx, 'Volume', formatVolume(leadMarket.volume || data.totalVolume)),
  );
  hero.append(stats);

  if (leadMarket.endDate) hero.append(row(ctx, 'Resolves', formatDate(leadMarket.endDate)));
  const history = data.priceHistory?.[leadMarket.slug] || [];
  if (history.length > 1) {
    const chartWrap = ctx.el('div', 'edp-prediction-chart-wrap');
    chartWrap.append(createPriceChart(history, leadMarket.yesPrice));
    hero.append(chartWrap);
  }

  const holders = data.holders?.[leadMarket.slug] || [];
  const comments = data.comments?.[leadMarket.slug] || [];
  const foot = ctx.el('div', 'edp-prediction-market-foot');
  foot.append(
    makeMetaChip(ctx, `${holders.length} holder${holders.length === 1 ? '' : 's'}`),
    makeMetaChip(ctx, `${comments.length} comment${comments.length === 1 ? '' : 's'}`),
  );
  if (!leadMarket.closed) {
    const tradeLink = ctx.el('a', 'edp-prediction-market-link') as HTMLAnchorElement;
    tradeLink.href = leadMarket.url;
    tradeLink.target = '_blank';
    tradeLink.rel = 'noopener noreferrer';
    tradeLink.textContent = 'Open Market';
    foot.append(tradeLink);
  }
  hero.append(foot);
  return hero;
}

function buildMarketCard(
  ctx: EntityRenderContext,
  market: PredictionMarketSubMarket,
  history: PricePoint[],
  holders: MarketHolder[],
  comments: MarketComment[],
): HTMLElement {
  const card = ctx.el('article', 'edp-prediction-market-card');
  const header = ctx.el('div', 'edp-prediction-market-head');
  header.append(ctx.el('h4', 'edp-prediction-market-title', market.question));
  const status = ctx.el('div', 'edp-prediction-market-badges');
  status.append(ctx.el('span', `edp-prediction-pill ${market.closed ? 'is-closed' : 'is-live'}`, market.closed ? 'Closed' : 'Live'));
  header.append(status);
  card.append(header);

  card.append(buildProbabilityBar(ctx, market.yesPrice, market.noPrice));

  const stats = ctx.el('div', 'edp-fact-grid edp-prediction-market-grid');
  stats.append(
    makeFactCard(ctx, 'Yes', `${market.yesPrice}%`),
    makeFactCard(ctx, 'No', `${market.noPrice}%`),
    makeFactCard(ctx, 'Volume', formatVolume(market.volume)),
  );
  card.append(stats);

  if (market.endDate) card.append(row(ctx, 'Resolves', formatDate(market.endDate)));
  if (history.length > 1) {
    const chartWrap = ctx.el('div', 'edp-prediction-chart-wrap');
    chartWrap.append(createPriceChart(history, market.yesPrice));
    card.append(chartWrap);
  }

  const foot = ctx.el('div', 'edp-prediction-market-foot');
  foot.append(
    makeMetaChip(ctx, `${holders.length} holder${holders.length === 1 ? '' : 's'}`),
    makeMetaChip(ctx, `${comments.length} comment${comments.length === 1 ? '' : 's'}`),
  );

  if (!market.closed) {
    const tradeLink = ctx.el('a', 'edp-prediction-market-link') as HTMLAnchorElement;
    tradeLink.href = market.url;
    tradeLink.target = '_blank';
    tradeLink.rel = 'noopener noreferrer';
    tradeLink.textContent = 'Open Market';
    foot.append(tradeLink);
  }

  card.append(foot);
  return card;
}

function buildProbabilityBar(ctx: EntityRenderContext, yesPrice: number, noPrice: number): HTMLElement {
  const section = ctx.el('div', 'edp-prediction-bar-block');
  const track = ctx.el('div', 'edp-prediction-bar-track');
  const yes = ctx.el('div', 'edp-prediction-bar-fill is-yes');
  yes.style.width = `${yesPrice}%`;
  const no = ctx.el('div', 'edp-prediction-bar-fill is-no');
  no.style.width = `${noPrice}%`;
  track.append(yes, no);

  const labels = ctx.el('div', 'edp-prediction-bar-labels');
  labels.append(
    ctx.el('span', 'edp-prediction-bar-label is-yes', `Yes ${yesPrice}%`),
    ctx.el('span', 'edp-prediction-bar-label is-no', `No ${noPrice}%`),
  );
  section.append(track, labels);
  return section;
}

function makeFactCard(ctx: EntityRenderContext, label: string, value: string): HTMLElement {
  const fact = ctx.el('div', 'edp-fact-card');
  fact.append(ctx.el('div', 'edp-fact-label', label));
  fact.append(ctx.el('div', 'edp-fact-value', value));
  return fact;
}

function makeInlineStat(ctx: EntityRenderContext, label: string, value: string): HTMLElement {
  const stat = ctx.el('div', 'edp-hotspot-inline-stat');
  stat.append(ctx.el('span', 'edp-hotspot-inline-label', label));
  stat.append(ctx.el('span', 'edp-hotspot-inline-value', value));
  return stat;
}

function makeMetaChip(ctx: EntityRenderContext, text: string): HTMLElement {
  return ctx.el('span', 'edp-prediction-meta-chip', text);
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

function formatVolume(v: number): string {
  if (!v || v === 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(d: string): string {
  if (!d) return 'Open-ended';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; }
}

function parseOutcomePrices(raw?: string): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];
  } catch {
    return [];
  }
}

function normalizeTokenIds(raw?: string[] | string): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function readVolume(primary?: number, fallback?: number | string, defaultValue = 0): number {
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback;
  if (typeof fallback === 'string') {
    const parsed = Number(fallback);
    if (Number.isFinite(parsed)) return parsed;
  }
  return defaultValue;
}
