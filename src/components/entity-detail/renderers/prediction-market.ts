import { getPredictionMarketDetail } from '@/services/prediction';
import { row } from '../types';
import type { EntityRenderer, EntityRenderContext } from '../types';

export interface PredictionMarketSubMarket {
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  slug: string;
  url: string;
  closed: boolean;
  endDate?: string;
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

export interface MarketTrade {
  price: number;
  size: number;
  side: string;
  timestamp: number;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface OrderLevel {
  price: number;
  size: number;
}

type PredictionTimeframe = '1h' | '6h' | '24h' | '48h' | '7d' | 'all';

const TIMEFRAME_STORAGE_KEY = 'wm:time-range';
const TIMEFRAME_EVENT = 'wm:time-range-changed';
const TIMEFRAME_MS: Record<Exclude<PredictionTimeframe, 'all'>, number> = {
  '1h': 1 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

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
  recentTrades?: MarketTrade[];
  orderBook?: {
    bids: OrderLevel[];
    asks: OrderLevel[];
    tickSize?: string;
    minOrderSize?: string;
    hash?: string;
    updatedAt?: number;
  };
  lastTradeSide?: string;
  midpoint?: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
}

export class PredictionMarketRenderer implements EntityRenderer {
  static lastActiveTabId = 'comments';

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
    detailBody.append(ctx.makeLoading('Loading live odds, order flow, holders, and comments…'));
    container.append(detailCard);
    return container;
  }

  async enrich(data: unknown, signal: AbortSignal): Promise<PredictionMarketPanelData> {
    const input = data as { id?: string; title?: string; slug?: string; category?: string; url?: string; volume?: number; endDate?: string; closed?: boolean };
    const slug = input.slug || '';
    const detail = slug
      ? await getPredictionMarketDetail(slug, { signal, bookDepth: 10, tradeLimit: 20 })
      : null;

    if (!detail?.market || !detail.pricing) {
      const yesPrice = 50;
      return {
        id: input.id || '',
        title: input.title || 'Prediction Market',
        slug,
        category: input.category || '',
        totalVolume: input.volume || 0,
        liquidity: 0,
        endDate: input.endDate,
        closed: input.closed || false,
        description: input.title || 'Prediction Market',
        markets: [{
          question: input.title || 'Prediction Market',
          yesPrice,
          noPrice: 100 - yesPrice,
          volume: input.volume || 0,
          slug,
          url: input.url || `https://polymarket.com/market/${slug}`,
          closed: input.closed || false,
          endDate: input.endDate,
        }],
        polymarketUrl: input.url || `https://polymarket.com/market/${slug}`,
        priceHistory: { [slug]: [] },
        holders: { [slug]: [] },
        comments: { [slug]: [] },
        recentTrades: [],
        orderBook: { bids: [], asks: [] },
      };
    }

    const closesAt = detail.market.closesAt ? new Date(detail.market.closesAt).toISOString() : input.endDate;
    const yesPrice = Math.round(detail.pricing.yesPrice * 100);
    const mappedSlug = detail.market.slug || slug;

    return {
      id: detail.market.eventId || detail.market.marketId || input.id || '',
      title: detail.market.title || input.title || 'Prediction Market',
      slug: mappedSlug,
      category: detail.market.category || input.category || '',
      totalVolume: detail.market.volume || input.volume || 0,
      liquidity: detail.market.liquidity || 0,
      endDate: closesAt,
      closed: detail.market.closed || input.closed || false,
      description: detail.market.description || input.title || 'Prediction Market',
      resolutionSource: detail.market.resolutionSource || undefined,
      markets: [{
        question: detail.market.title || input.title || 'Prediction Market',
        yesPrice,
        noPrice: 100 - yesPrice,
        volume: detail.market.volume || input.volume || 0,
        slug: mappedSlug,
        url: detail.market.url || input.url || `https://polymarket.com/market/${mappedSlug}`,
        closed: detail.market.closed || false,
        endDate: closesAt,
      }],
      polymarketUrl: detail.market.url || input.url || `https://polymarket.com/market/${mappedSlug}`,
      priceHistory: {
        [mappedSlug]: (detail.history || []).map((point) => ({
          timestamp: point.timestamp,
          price: Math.round(point.price * 100),
        })),
      },
      holders: {
        [mappedSlug]: (detail.holders || []).map((holder) => ({
          address: holder.address,
          shares: Math.round(holder.shares),
          value: holder.value,
          side: holder.side === 'no' ? 'no' : 'yes',
          label: holder.label,
          profileImage: holder.profileImage || undefined,
        })),
      },
      comments: {
        [mappedSlug]: (detail.comments || []).map((comment) => ({
          author: comment.author,
          text: comment.text,
          timestamp: comment.createdAt ? new Date(comment.createdAt).toISOString() : '',
          likes: comment.likes,
          profileImage: comment.profileImage || undefined,
          userAddress: comment.userAddress || undefined,
        })),
      },
      recentTrades: (detail.recentTrades || []).map((trade) => ({
        price: trade.price,
        size: trade.size,
        side: trade.side,
        timestamp: trade.timestamp,
      })),
      orderBook: {
        bids: detail.orderBook?.bids || [],
        asks: detail.orderBook?.asks || [],
        tickSize: detail.orderBook?.tickSize,
        minOrderSize: detail.orderBook?.minOrderSize,
        hash: detail.orderBook?.hash,
        updatedAt: detail.orderBook?.updatedAt,
      },
      lastTradeSide: detail.pricing.lastTradeSide || undefined,
      midpoint: detail.pricing.midpoint,
      bestBid: detail.pricing.bestBid,
      bestAsk: detail.pricing.bestAsk,
      spread: detail.pricing.spread,
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

    const [overviewCard, overviewBody] = ctx.sectionCard('Overview');
    if (leadMarket) overviewBody.append(buildPredictionHero(ctx, data, leadMarket));

    const factGrid = ctx.el('div', 'edp-fact-grid edp-prediction-overview-grid');
    factGrid.append(
      makeFactCard(ctx, 'Total Volume', formatVolume(data.totalVolume)),
      makeFactCard(ctx, 'Liquidity', formatVolume(data.liquidity || 0)),
      makeFactCard(ctx, 'Spread', formatPricePct(data.spread)),
    );
    overviewBody.append(factGrid);

    if (data.resolutionSource) overviewBody.append(row(ctx, 'Resolution Source', data.resolutionSource));
    container.append(overviewCard);

    const leadSlug = leadMarket?.slug || data.slug;
    const holders = data.holders?.[leadSlug] || [];
    const comments = data.comments?.[leadSlug] || [];
    const tabsCard = buildTradingTabs(ctx, data, holders, comments);
    if (tabsCard) container.append(tabsCard);

    if (data.description && data.description !== data.title && data.description.length > 20) {
      const [descriptionCard, descriptionBody] = ctx.sectionCard('Description');
      descriptionBody.classList.add('edp-prediction-description');
      descriptionBody.append(ctx.el('p', 'edp-callout-text', data.description));
      container.append(descriptionCard);
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
  );
  top.append(score, meta);
  hero.append(top);

  hero.append(buildProbabilityBar(ctx, leadMarket.yesPrice, leadMarket.noPrice));
  const history = data.priceHistory?.[leadMarket.slug] || [];
  if (history.length > 1) {
    const chartWrap = ctx.el('div', 'edp-prediction-chart-wrap');
    chartWrap.append(createInteractivePriceChart(history, leadMarket.yesPrice));
    hero.append(chartWrap);
  }

  const foot = ctx.el('div', 'edp-prediction-market-foot');
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

function buildTradingTabs(
  ctx: EntityRenderContext,
  data: PredictionMarketPanelData,
  holders: MarketHolder[],
  comments: MarketComment[],
): HTMLElement | null {
  const tabs: Array<{ id: string; label: string; content: HTMLElement; count?: number }> = [];

  if ((data.orderBook?.bids.length || 0) > 0 || (data.orderBook?.asks.length || 0) > 0) {
    tabs.push({ id: 'book', label: 'Book', content: buildOrderBook(ctx, data.orderBook) });
  }
  if ((data.recentTrades?.length || 0) > 0) {
    tabs.push({ id: 'flow', label: 'Flow', content: buildOrderFlow(ctx, data.recentTrades || [], data.orderBook) });
    tabs.push({ id: 'trades', label: 'Trades', content: buildRecentTrades(ctx, data.recentTrades || []), count: data.recentTrades?.length || 0 });
  }
  if (holders.length > 0) {
    tabs.push({ id: 'holders', label: 'Holders', content: buildHolders(ctx, holders), count: holders.length });
  }
  if (comments.length > 0) {
    tabs.push({ id: 'comments', label: 'Comments', content: buildComments(ctx, comments), count: comments.length });
  }

  if (tabs.length === 0) return null;

  const [card, body] = ctx.sectionCard('Market Detail');
  body.classList.add('edp-prediction-tabs-shell');

  const tabBar = ctx.el('div', 'edp-prediction-tabs');
  const panelHost = ctx.el('div', 'edp-prediction-tab-panels');
  let activeIndex = tabs.findIndex((tab) => tab.id === PredictionMarketRenderer.lastActiveTabId);
  if (activeIndex < 0) {
    activeIndex = tabs.findIndex((tab) => tab.id === getPreferredTabId(data, comments));
  }
  if (activeIndex < 0) activeIndex = 0;

  const renderActive = (): void => {
    panelHost.replaceChildren();
    panelHost.append(tabs[activeIndex]!.content);
    [...tabBar.children].forEach((child, index) => {
      child.classList.toggle('is-active', index === activeIndex);
    });
  };

  tabs.forEach((tab, index) => {
    const button = ctx.el('button', 'edp-prediction-tab') as HTMLButtonElement;
    button.type = 'button';
    button.textContent = tab.label;
    if (typeof tab.count === 'number') {
      const count = ctx.el('span', 'edp-prediction-tab-count', String(tab.count));
      button.append(' ');
      button.append(count);
    }
    button.addEventListener('click', () => {
      activeIndex = index;
      PredictionMarketRenderer.lastActiveTabId = tabs[index]!.id;
      renderActive();
    });
    tabBar.append(button);
  });

  body.append(tabBar, panelHost);
  renderActive();
  return card;
}

function getPreferredTabId(data: PredictionMarketPanelData, comments: MarketComment[]): string {
  const updatedAt = data.orderBook?.updatedAt ?? 0;
  const bookIsFresh = updatedAt > 0 && Date.now() - updatedAt < 2 * 60 * 1000;
  if (bookIsFresh && ((data.orderBook?.bids.length || 0) > 0 || (data.orderBook?.asks.length || 0) > 0)) {
    return 'book';
  }
  if ((data.recentTrades?.length || 0) > 0) return 'trades';
  if (comments.length > 0) return 'comments';
  if ((data.orderBook?.bids.length || 0) > 0 || (data.orderBook?.asks.length || 0) > 0) return 'book';
  if ((data.holders?.[data.slug]?.length || 0) > 0) return 'holders';
  return 'comments';
}

function buildOrderBook(ctx: EntityRenderContext, orderBook: PredictionMarketPanelData['orderBook']): HTMLElement {
  const wrap = ctx.el('div', 'edp-prediction-book');
  if (!orderBook) return wrap;
  const meta = ctx.el('div', 'edp-prediction-detail-meta');
  meta.append(
    makeMetricPill(ctx, 'Tick', orderBook.tickSize || '—'),
    makeMetricPill(ctx, 'Min', orderBook.minOrderSize || '—'),
    makeMetricPill(ctx, 'Updated', orderBook.updatedAt ? formatTime(orderBook.updatedAt) : '—'),
  );
  wrap.append(meta);

  const ladder = ctx.el('div', 'edp-prediction-book-stack');
  const asks = ctx.el('div', 'edp-prediction-book-side is-asks');
  const spread = ctx.el('div', 'edp-prediction-book-spread');
  const bids = ctx.el('div', 'edp-prediction-book-side is-bids');
  asks.append(buildBookHeader(ctx, 'Asks'));
  for (const ask of [...orderBook.asks].sort((a, b) => b.price - a.price)) asks.append(buildBookRow(ctx, ask, 'SELL'));
  spread.append(
    makeFactCard(ctx, 'Best Bid', formatPricePct(orderBook.bids[0]?.price)),
    makeFactCard(ctx, 'Best Ask', formatPricePct(orderBook.asks[0]?.price)),
    makeFactCard(
      ctx,
      'Spread',
      orderBook.bids[0] && orderBook.asks[0] ? formatPricePct(orderBook.asks[0].price - orderBook.bids[0].price) : '—',
    ),
  );
  bids.append(buildBookHeader(ctx, 'Bids'));
  for (const bid of orderBook.bids) bids.append(buildBookRow(ctx, bid, 'BUY'));
  ladder.append(asks, spread, bids);
  wrap.append(ladder);
  return wrap;
}

function buildBookHeader(ctx: EntityRenderContext, label: string): HTMLElement {
  const rowEl = ctx.el('div', 'edp-prediction-book-header');
  rowEl.append(
    ctx.el('span', 'edp-prediction-book-col', label),
    ctx.el('span', 'edp-prediction-book-col', 'Price'),
    ctx.el('span', 'edp-prediction-book-col', 'Size'),
    ctx.el('span', 'edp-prediction-book-col', 'Total'),
  );
  return rowEl;
}

function buildBookRow(ctx: EntityRenderContext, level: OrderLevel, side: string): HTMLElement {
  const rowEl = ctx.el('div', `edp-prediction-book-row ${side === 'BUY' ? 'is-bid' : 'is-ask'}`);
  const total = level.price * level.size;
  const sideClass = side === 'BUY' ? 'is-buy' : 'is-sell';
  rowEl.append(
    ctx.el('span', `edp-prediction-book-col edp-prediction-book-side-label ${sideClass}`.trim(), side === 'BUY' ? 'Bid' : 'Ask'),
    ctx.el('span', `edp-prediction-book-col edp-prediction-book-price ${sideClass}`.trim(), formatPricePct(level.price)),
    ctx.el('span', 'edp-prediction-book-col', formatShares(level.size)),
    ctx.el('span', 'edp-prediction-book-col', formatVolume(total)),
  );
  return rowEl;
}

function buildOrderFlow(
  ctx: EntityRenderContext,
  trades: MarketTrade[],
  orderBook?: PredictionMarketPanelData['orderBook'],
): HTMLElement {
  const wrap = ctx.el('div', 'edp-prediction-detail-panel');
  const buyTrades = trades.filter((trade) => trade.side.toLowerCase().includes('buy'));
  const sellTrades = trades.filter((trade) => trade.side.toLowerCase().includes('sell'));
  const buyNotional = buyTrades.reduce((sum, trade) => sum + (trade.price * trade.size), 0);
  const sellNotional = sellTrades.reduce((sum, trade) => sum + (trade.price * trade.size), 0);
  const total = buyNotional + sellNotional;
  const buyPct = total > 0 ? Math.round((buyNotional / total) * 100) : 50;
  const sellPct = 100 - buyPct;
  const avgTradeSize = trades.length > 0 ? trades.reduce((sum, trade) => sum + trade.size, 0) / trades.length : 0;
  const lastTrade = trades[0];

  const stats = ctx.el('div', 'edp-prediction-flow-grid');
  stats.append(
    makeMetricPill(ctx, 'Buy Notional', formatVolume(buyNotional), 'is-buy'),
    makeMetricPill(ctx, 'Sell Notional', formatVolume(sellNotional), 'is-sell'),
    makeMetricPill(ctx, 'Imbalance', `${buyPct - sellPct > 0 ? '+' : ''}${buyPct - sellPct}%`),
    makeMetricPill(ctx, 'Avg Size', formatShares(avgTradeSize)),
    makeMetricPill(ctx, 'Latest', formatPricePct(lastTrade?.price)),
  );
  wrap.append(stats);
  wrap.append(buildFlowBar(ctx, buyPct, sellPct));

  if (orderBook) {
    const topBid = orderBook.bids[0];
    const topAsk = orderBook.asks[0];
    const micro = ctx.el('div', 'edp-prediction-detail-meta');
    micro.append(
      makeMetricPill(ctx, 'Top Bid', formatPricePct(topBid?.price), 'is-buy'),
      makeMetricPill(ctx, 'Top Ask', formatPricePct(topAsk?.price), 'is-sell'),
      makeMetricPill(ctx, 'Spread', topBid && topAsk ? formatPricePct(topAsk.price - topBid.price) : '—'),
    );
    wrap.append(micro);
  }

  return wrap;
}

function buildRecentTrades(ctx: EntityRenderContext, trades: MarketTrade[]): HTMLElement {
  const wrap = ctx.el('div', 'edp-prediction-table');
  wrap.append(buildTableHeader(ctx, ['Side', 'Price', 'Size', 'Time']));
  for (const trade of trades) {
    const tone = trade.side.toLowerCase().includes('buy') ? 'is-buy' : trade.side.toLowerCase().includes('sell') ? 'is-sell' : undefined;
    wrap.append(buildTableRow(ctx, [
      trade.side || 'Trade',
      formatPricePct(trade.price),
      formatShares(trade.size),
      formatTime(trade.timestamp),
    ], tone));
  }
  return wrap;
}

function buildHolders(ctx: EntityRenderContext, holders: MarketHolder[]): HTMLElement {
  const wrap = ctx.el('div', 'edp-prediction-holders');

  const yesHolders = holders.filter(h => h.side === 'yes').slice(0, 5);
  const noHolders = holders.filter(h => h.side === 'no').slice(0, 5);

  if (yesHolders.length > 0) {
    const yesSection = ctx.el('div', 'edp-prediction-holders-content');
    yesSection.append(ctx.el('div', 'edp-prediction-holders-header is-yes', `YES Holders (${yesHolders.length})`));
    for (const holder of yesHolders) yesSection.append(buildHolderRow(ctx, holder));
    wrap.append(yesSection);
  }

  if (noHolders.length > 0) {
    const noSection = ctx.el('div', 'edp-prediction-holders-content');
    noSection.append(ctx.el('div', 'edp-prediction-holders-header is-no', `NO Holders (${noHolders.length})`));
    for (const holder of noHolders) noSection.append(buildHolderRow(ctx, holder));
    wrap.append(noSection);
  }

  if (yesHolders.length === 0 && noHolders.length === 0) {
    wrap.append(ctx.el('div', 'edp-description', 'No holder data available'));
  }

  return wrap;
}

function buildHolderRow(ctx: EntityRenderContext, holder: MarketHolder): HTMLElement {
  const rowEl = ctx.el('div', `edp-prediction-holder-row ${holder.side === 'yes' ? 'is-yes' : 'is-no'}`);
  const label = holder.label || shortenAddress(holder.address);
  const profileUrl = `https://polymarket.com/profile/${holder.address}`;
  const nameLink = ctx.el('a', 'edp-prediction-holder-name') as HTMLAnchorElement;
  nameLink.href = profileUrl;
  nameLink.target = '_blank';
  nameLink.rel = 'noopener noreferrer';
  nameLink.textContent = label;
  rowEl.append(nameLink);
  rowEl.append(ctx.el('span', 'edp-prediction-holder-shares', formatShares(holder.shares)));
  rowEl.append(ctx.el('span', 'edp-prediction-holder-value', formatVolume(holder.value)));
  return rowEl;
}

function buildComments(ctx: EntityRenderContext, comments: MarketComment[]): HTMLElement {
  const wrap = ctx.el('div', 'edp-prediction-comment-list');
  for (const comment of comments) {
    const item = ctx.el('article', 'edp-prediction-comment');
    const head = ctx.el('div', 'edp-prediction-comment-head');
    head.append(
      ctx.el('div', 'edp-prediction-comment-author', comment.author),
      ctx.el('div', 'edp-prediction-comment-meta', comment.timestamp ? formatDateTime(comment.timestamp) : '—'),
    );
    item.append(head);
    item.append(ctx.el('p', 'edp-description', comment.text));
    const meta = ctx.el('div', 'edp-prediction-comment-foot');
    meta.append(ctx.el('span', 'edp-prediction-comment-likes', `${comment.likes} like${comment.likes === 1 ? '' : 's'}`));
    if (comment.userAddress) meta.append(ctx.el('span', 'edp-prediction-comment-handle', shortenAddress(comment.userAddress)));
    item.append(meta);
    wrap.append(item);
  }
  return wrap;
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

function buildFlowBar(ctx: EntityRenderContext, buyPct: number, sellPct: number): HTMLElement {
  const section = ctx.el('div', 'edp-prediction-bar-block');
  const track = ctx.el('div', 'edp-prediction-bar-track');
  const buy = ctx.el('div', 'edp-prediction-bar-fill is-yes');
  buy.style.width = `${buyPct}%`;
  const sell = ctx.el('div', 'edp-prediction-bar-fill is-no');
  sell.style.width = `${sellPct}%`;
  track.append(buy, sell);

  const labels = ctx.el('div', 'edp-prediction-bar-labels');
  labels.append(
    ctx.el('span', 'edp-prediction-bar-label is-yes', `Buy ${buyPct}%`),
    ctx.el('span', 'edp-prediction-bar-label is-no', `Sell ${sellPct}%`),
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

function makeMetricPill(ctx: EntityRenderContext, label: string, value: string, tone?: 'is-buy' | 'is-sell'): HTMLElement {
  const pill = ctx.el('div', `edp-prediction-metric ${tone || ''}`.trim());
  pill.append(ctx.el('span', 'edp-prediction-metric-label', label));
  pill.append(ctx.el('span', 'edp-prediction-metric-value', value));
  return pill;
}

function buildTableHeader(ctx: EntityRenderContext, columns: string[]): HTMLElement {
  const row = ctx.el('div', 'edp-prediction-table-header');
  for (const column of columns) row.append(ctx.el('span', 'edp-prediction-table-cell', column));
  return row;
}

function buildTableRow(ctx: EntityRenderContext, columns: string[], tone?: 'is-buy' | 'is-sell'): HTMLElement {
  const row = ctx.el('div', `edp-prediction-table-row ${tone || ''}`.trim());
  for (const column of columns) row.append(ctx.el('span', 'edp-prediction-table-cell', column));
  return row;
}

function shortenAddress(value?: string): string {
  if (!value) return '—';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function loadStoredTimeframe(): PredictionTimeframe {
  try {
    const stored = localStorage.getItem(TIMEFRAME_STORAGE_KEY);
    if (stored === '1h' || stored === '6h' || stored === '24h' || stored === '48h' || stored === '7d' || stored === 'all') return stored;
  } catch { /* ignore */ }
  return '7d';
}

function storeTimeframe(timeframe: PredictionTimeframe): void {
  try {
    localStorage.setItem(TIMEFRAME_STORAGE_KEY, timeframe);
  } catch { /* ignore */ }
}

function filterHistoryByTimeframe(history: PricePoint[], timeframe: PredictionTimeframe): PricePoint[] {
  if (timeframe === 'all' || history.length < 2) return history;
  const cutoff = Date.now() - TIMEFRAME_MS[timeframe];
  const filtered = history.filter(point => point.timestamp >= cutoff);
  return filtered.length > 1 ? filtered : history;
}

function createInteractivePriceChart(history: PricePoint[], currentPrice: number): HTMLElement {
  const container = document.createElement('div');
  container.className = 'edp-prediction-chart-shell';

  const controls = document.createElement('div');
  controls.className = 'edp-prediction-chart-controls';

  const chartHost = document.createElement('div');
  chartHost.className = 'edp-prediction-chart-host';

  const tooltip = document.createElement('div');
  tooltip.className = 'edp-prediction-chart-tooltip';
  tooltip.hidden = true;
  chartHost.appendChild(tooltip);

  let timeframe = loadStoredTimeframe();
  const options: PredictionTimeframe[] = ['1h', '6h', '24h', '48h', '7d', 'all'];

  const render = (): void => {
    const filteredHistory = filterHistoryByTimeframe(history, timeframe);
    const svg = createPriceChart(filteredHistory, currentPrice);

    svg.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });

    svg.addEventListener('mousemove', (event) => {
      const rect = svg.getBoundingClientRect();
      const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      const index = Math.max(0, Math.min(filteredHistory.length - 1, Math.round(ratio * (filteredHistory.length - 1))));
      const point = filteredHistory[index];
      if (!point) return;
      tooltip.hidden = false;
      tooltip.textContent = `${formatPriceDisplay(point.price)} • ${formatChartTime(point.timestamp, timeframe)}`;
      tooltip.style.left = `${Math.max(8, Math.min(rect.width - 8, event.clientX - rect.left))}px`;
      tooltip.style.top = '10px';
    });

    chartHost.replaceChildren(svg, tooltip);
  };

  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `edp-prediction-chart-timeframe${option === timeframe ? ' is-active' : ''}`;
    button.textContent = option === 'all' ? 'All' : option;
    button.addEventListener('click', () => {
      timeframe = option;
      storeTimeframe(timeframe);
      window.dispatchEvent(new CustomEvent(TIMEFRAME_EVENT, { detail: { range: timeframe } }));
      [...controls.children].forEach((child) => child.classList.remove('is-active'));
      button.classList.add('is-active');
      render();
    });
    controls.appendChild(button);
  }

  window.addEventListener(TIMEFRAME_EVENT, ((event: Event) => {
    const range = (event as CustomEvent<{ range?: PredictionTimeframe }>).detail?.range;
    if (!range || range === timeframe) return;
    timeframe = range;
    [...controls.children].forEach((child) => {
      child.classList.toggle('is-active', (child as HTMLButtonElement).textContent?.toLowerCase() === (range === 'all' ? 'all' : range));
    });
    render();
  }) as EventListener);

  container.append(controls, chartHost);
  render();
  return container;
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

function formatShares(v: number): string {
  if (!v || v === 0) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function formatPricePct(v?: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function formatPriceDisplay(v?: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `${v.toFixed(1)}%`;
}

function formatDateTime(d: string): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return d; }
}

function formatTime(timestamp: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '—';
  try { return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch { return '—'; }
}

function formatChartTime(timestamp: number, timeframe: PredictionTimeframe): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '—';
  try {
    return new Date(timestamp).toLocaleString('en-US', timeframe === '24h'
      ? { hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '—';
  }
}
