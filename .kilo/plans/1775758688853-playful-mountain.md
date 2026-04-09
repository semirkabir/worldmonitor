# OpenBB Integration Plan

## Objective

Integrate OpenBB data and provider coverage into World Monitor so it works cleanly across:

- search
- finance panels
- country/map overlays where geography exists or can be derived
- bootstrap/cache flows for fast first paint

The goal is not to bolt on a separate terminal, but to make OpenBB feel native inside the existing World Monitor product surfaces.

## What I found

### World Monitor architecture

- Search is client-driven and indexes in-memory app state plus curated registries in `src/app/search-manager.ts:553`.
- Finance panels are already centralized and extensible in `src/app/panel-layout.ts:1058`.
- Market data flows through typed RPC clients in `src/services/market/index.ts:1` backed by edge handlers such as `api/market/v1/[rpc].ts:1` and `server/worldmonitor/market/v1/handler.ts:1`.
- Economic data already uses the same typed RPC pattern in `src/services/economic/index.ts:1` and `server/worldmonitor/economic/v1/handler.ts:1`.
- Country brief / country overlays are assembled in `src/app/country-intel.ts:155`.
- Bootstrap hydration is Redis-first via `api/bootstrap.js:7` and `src/services/bootstrap.ts:1`.
- News is partly server-ingested/classified in `server/worldmonitor/news/v1/list-feed-digest.ts:1`.
- There is already an external sidecar/relay deployment pattern in `scripts/ais-relay.cjs:1`.

### Current finance features already present

- Market quotes, commodities, crypto, sectors, ETF flows, stablecoins, Gulf economies.
- Economic calendar, earnings calendar, IPO calendar, insider trading, options chain, social sentiment.
- Country stock index and macro cards.
- Search sources for companies, exchanges, financial centers, central banks, commodity hubs, news, predictions, and market rows.

### Current gaps relevant to OpenBB

- No existing `openbb` integration or env config in `.env.example:32`.
- Several finance endpoints are approximated or provider-specific today, especially `api/market-data.js:1` and current ETF flow / SEC plumbing.
- Search is local/in-memory, so large OpenBB universes will need async remote search instead of trying to preload everything.
- The app runs edge TS handlers on Vercel; OpenBB is Python-first, so it does not naturally fit inside the existing edge runtime.

### OpenBB capabilities most relevant here

From OpenBB docs and repo:

- Search/universe: equity, ETF, index, currency, crypto search.
- Equity: profile, market snapshots, screener, calendars, fundamentals, estimates, ownership, filings, shorts.
- ETFs: holdings, country weights, sector weights, exposure, info, historical.
- Economy: country profile, indicators, rates, CPI, unemployment, export destinations, direction of trade, shipping, calendars.
- Derivatives: options chains/snapshots/surface/unusual, futures curve/instruments.
- News: world news and company news across multiple providers.
- Regulators: SEC symbol map, CIK map, filing headers, institutions search.
- Fixed income / currency / commodity / congress datasets that can support additional panels.

## Recommended architecture

### Recommended default

Run OpenBB as a separate Python service and keep World Monitor's existing UI and typed RPC layer as the public contract.

Why:

- `api/market/v1/[rpc].ts:1` is edge runtime only.
- OpenBB is Python-native and intended to expose REST/MCP/Python surfaces from a separate process.
- World Monitor already tolerates sidecar/relay style infrastructure.
- This preserves the existing frontend contracts and avoids a full frontend rewrite.

### Topology

1. Deploy an OpenBB backend service separately.
   - Likely Railway, Render, Fly, or a container host.
   - Run `openbb-api` there.
2. Add a thin World Monitor adapter layer in the existing TS backend.
   - TS handlers call the OpenBB service over HTTP.
   - Handlers normalize responses into current World Monitor proto/service shapes.
3. Keep frontend consumers stable.
   - Existing panels keep calling `MarketServiceClient` / `EconomicServiceClient`.
4. Seed/bootstrap high-value data into Redis for instant first paint.
   - Quotes, macro snapshots, ETF summaries, country-level overlays.
5. Use on-demand fetches for heavy datasets.
   - Options chains, screeners, filings, deep fundamentals, large news sets.

### New config expected

- `OPENBB_API_URL`
- `OPENBB_API_KEY` only if the deployed service is privately gated
- provider keys inside the OpenBB service environment for whichever paid sources are enabled

## What should be implemented, grouped by surface

### 1) Search

Best fits:

- symbol/company search via OpenBB equity search
- ETF search
- index search
- currency / crypto pair search
- SEC/CIK symbol lookup
- company news search and world news search

How to implement:

- Keep existing local search sources in `src/app/search-manager.ts:553`.
- Add async remote sources for OpenBB-backed results instead of preloading huge universes.
- Return compact normalized search rows: `id`, `title`, `subtitle`, `data`, optional `kind`.
- Prioritize remote search only after 2-3 chars or with finance variant enabled.

Why this needs a different implementation:

- OpenBB search universes are too large for the current local-only indexing model.
- Search must stay low-latency and cancelable, so remote async sources are the correct fit.

Highest-value search additions:

- stocks / ETFs / indices / crypto / FX pairs
- company profile quick card
- filings and insider lookups
- company/world news hits

### 2) Existing finance panels to upgrade or replace

Strong direct replacements or upgrades:

- `earnings-calendar` -> OpenBB earnings calendar
- `ipo-calendar` -> OpenBB IPO calendar
- `insider-trading` -> OpenBB insider trading
- `options-chain` -> OpenBB options chains/snapshots
- `economic-calendar` -> OpenBB economy calendar
- ETF/country/sector data -> OpenBB ETF countries, sectors, holdings
- SEC / filing support -> OpenBB filings + SEC symbol/cik mapping

Good candidates for better data quality:

- ETF flows panel should likely evolve away from the current proxy logic and either:
  - switch to a real OpenBB-supported substitute if available from enabled providers, or
  - be reframed into ETF exposure/holdings/sector/country panels if real flow data is not available from your OpenBB provider mix
- Gulf economies panel can become less proxy-based by using OpenBB country profile, rates, FX, equities, and index data.

Panels that are additive rather than replacements:

- equity screener panel
- company profile / fundamentals panel
- revenue by geography panel
- ETF holdings / country exposure panel
- fixed income / yield curve panel
- trade flows panel powered by IMF/econdb-backed OpenBB economy endpoints
- filings monitor panel

Panels that should probably remain on current providers unless specifically reworked:

- social sentiment
- conflict / cyber / aviation / predictions / webcams / outbreaks

Why these need different implementations:

- quote-style widgets can be bootstrapped
- deep panel views should stay on-demand
- large option chains should never be part of bootstrap
- filing/news panels need pagination and filters, not one-shot preload

### 3) Map and country overlays

Best fits for map integration:

- country profile metrics from OpenBB economy country profile
- policy rates, CPI, unemployment, GDP growth, debt/GDP, 10Y yield
- export destinations and direction-of-trade links
- ETF country exposure choropleths
- company revenue-per-geography choropleths or ranked lists
- commodity / shipping datasets where a clear country or route mapping exists

How to implement:

- Only map datasets that can be normalized to ISO country codes or explicit coordinates.
- Build country-level transformers in the backend or shared services.
- Feed derived country maps into the same path that currently powers country/map layers and `CountryIntelManager`.

Why this needs a different implementation:

- OpenBB mostly returns tabular finance/economy data, not ready-made geospatial layers.
- Map integration is a transformation problem, not a direct provider passthrough.

Recommended first map overlays:

- macro choropleths for CPI / policy rate / unemployment / 10Y yield / debt-GDP
- trade partner arcs for selected country
- ETF country exposure map for selected ETF
- country market snapshot in the country brief

### 4) Country brief and company enrichment

Best fits:

- expand `src/app/country-intel.ts:155` with OpenBB country profile fields
- improve country stock index, rates, inflation, trade and export context
- add company profile / metrics / management / filings / revenue geography to enrichment APIs

This is one of the cleanest user-facing wins because the country brief already joins markets, macro, and stories in one place.

### 5) News

Good OpenBB usage:

- company news search and watchlists
- world news for finance-tagged sources
- enrichment of finance stories with linked symbols / companies / publishers

What not to do initially:

- do not replace the whole World Monitor news ingestion pipeline in phase 1
- do not force finance news into every map/news surface without classification and dedupe rules

Recommended pattern:

- keep current digest/classification pipeline
- add OpenBB-backed finance/company news as a parallel source for finance search and finance panels
- optionally merge selected OpenBB stories into the digest after dedupe rules are proven

## Implementation differences by feature type

### Bootstrap-worthy

- top quotes
- macro snapshot cards
- ETF sector/country summaries for a curated watchlist
- country profile snapshot for major countries

### On-demand only

- options chains
- screeners
- long filing lists
- revenue geography history
- detailed fundamentals / estimates / ownership tables
- large news result sets

### Derived/transform required

- anything map-based
- trade arcs
- ETF exposure heatmaps
- revenue geography visual overlays

### Probably keep current provider for now

- social sentiment
- real-time geopolitical feeds not covered by OpenBB
- aviation/conflict/defcon/outbreak surfaces

## Recommended execution phases

### Phase 0 - foundation

- Stand up the external OpenBB service.
- Decide which OpenBB providers are enabled and which require paid keys.
- Add env/config and a TS OpenBB client adapter.
- Add healthcheck + timeout + fallback behavior.

### Phase 1 - lowest-risk integration

- Replace `api/market-data.js:1` legacy endpoints with typed RPCs backed by OpenBB where possible.
- Add remote finance search for equities / ETFs / indices / crypto / FX.
- Upgrade earnings, IPO, insider, SEC mapping, and options chain.

### Phase 2 - finance panel upgrade

- Expand company profile/fundamentals support.
- Add ETF holdings / country / sector exposure.
- Improve Gulf / macro / country finance panels using OpenBB economy + equity data.
- Seed high-value bootstrap keys in Redis.

### Phase 3 - map + country intelligence

- Add macro choropleths.
- Add trade-flow arcs.
- Add ETF country exposure and revenue geography overlays.
- Extend country brief cards and company drilldowns.

### Phase 4 - optional expansion

- screener panel
- fixed income panel
- congress/regulatory panels
- OpenBB-backed finance news enrichment in digest/search

## Concrete repo touchpoints for implementation

Primary files to extend:

- `src/app/search-manager.ts:553`
- `src/app/panel-layout.ts:1058`
- `src/services/market/index.ts:1`
- `src/services/economic/index.ts:1`
- `server/worldmonitor/market/v1/handler.ts:1`
- `server/worldmonitor/economic/v1/handler.ts:1`
- `src/app/country-intel.ts:155`
- `api/bootstrap.js:7`
- `.env.example:32`

Likely new pieces:

- OpenBB adapter module in server code
- new market/economic RPC handlers where current shapes do not exist yet
- optional new `search` RPC surface if async remote search should move server-side cleanly
- seed/bootstrap scripts for OpenBB-backed snapshots

Likely deprecations or migrations:

- `api/market-data.js:1`
- current ETF-flow proxy logic
- static SEC symbol mapping if OpenBB SEC symbol/cik maps are good enough

## Risks and constraints

- OpenBB is AGPLv3; license/compliance review is required before shipping a modified/private deployment pattern.
- Many high-value OpenBB providers require separate commercial API keys or entitlements.
- Vercel edge cannot host OpenBB directly.
- Search needs throttling/cancellation or it will feel slower than current local search.
- Some OpenBB outputs are huge and need server pagination plus UI constraints.
- Map data is only viable when country/region normalization is reliable.
- News dedupe will matter if OpenBB finance news is blended with current feeds.

## Recommended defaults

- Use an external hosted OpenBB REST backend.
- Keep World Monitor's typed RPC layer as the stable app contract.
- Start with search plus finance panels, not map overlays first.
- Use bootstrap only for curated top-level summaries.
- Gate paid-provider-backed panels/features behind config or entitlement flags.

## Deployment recommendation

For both user speed and total cost, the best default is a dedicated hosted OpenBB backend service used by the existing Vercel edge handlers.

Why this is the better tradeoff:

- fastest path to one shared cache for all web users instead of each user paying cold-start/setup cost locally
- cheaper operationally than duplicating OpenBB/provider setup per desktop user
- keeps the current web product and desktop product on one data contract
- fits the existing Redis/bootstrap model already used by World Monitor
- avoids building two separate integrations later

Desktop-sidecar-first is only cheaper if the goal is a desktop-only feature with no near-term web rollout. For the app you described, it is the less optimal long-term path.
