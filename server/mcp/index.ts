/**
 * MCP (Model Context Protocol) server for WorldMonitor data APIs.
 *
 * Exposes all data endpoints as MCP tools so AI agents can query real-time
 * data programmatically.  Runs as a standalone process (stdio transport) or
 * as an HTTP server for remote MCP clients.
 *
 * Usage:
 *   MCP server: bun run server/mcp/index.ts          (stdio mode)
 *   HTTP server: MCP_TRANSPORT=streamable-http bun run server/mcp/index.ts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ApiKeyInfo, API_KEY_LIMITS, getApiKeyInfo, incrementKeyUsage } from './keys';

// --- Tool registry ---------------------------------------------------

/** All MCP tools, mapped from WorldMonitor RPC endpoints. */
const TOOL_REGISTRY: Array<{
  tool: Tool;
  handler: (args: Record<string, unknown>, apiKey: string) => Promise<unknown>;
}> = [];

function registerTool(name: string, description: string, inputSchema: Tool['inputSchema'],
  handler: (args: Record<string, unknown>, apiKey: string) => Promise<unknown>) {
  TOOL_REGISTRY.push({
    tool: { name, description, inputSchema },
    handler,
  });
}

// --- Helper: build MCP tool for any endpoint ----------------------

type EndpointFn = (args: Record<string, unknown>) => Promise<unknown>;

function endpointTool(
  name: string,
  description: string,
  properties: Record<string, { type: string; description: string; required?: boolean }>,
  baseUrl: string,
  transformResponse?: (raw: unknown) => unknown,
) {
  const required = Object.entries(properties)
    .filter(([, v]) => v.required)
    .map(([k]) => k);

  registerTool(
    name,
    description,
    {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(properties).map(([k, v]) => [k, { type: v.type, description: v.description, required: v.required }]),
      ),
      required,
    },
    async (args: Record<string, unknown>, _apiKey: string) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) {
        if (v != null && v !== '') params.set(k, String(v));
      }
      const url = `${baseUrl}?${params.toString()}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) throw new Error(`API error: ${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      return transformResponse ? transformResponse(data) : data;
    },
  );
}

// --- Register all tools -----------------------------------------------

const BASE = process.env.WORLDMONITOR_API_URL ?? 'https://worldmonitor.app/api';

// Marketplace
endpointTool(
  'list_datasets', 'Browse available datasets in the data marketplace.',
  {},
  `${BASE}/marketplace`,
);
endpointTool(
  'get_dataset', 'Get a specific dataset (tier-gated; returns preview if access denied).',
  {
    slug: { type: 'string', description: 'Dataset slug (e.g., "naval-incidents-2024").', required: true },
  },
  `${BASE}/marketplace`,
);
endpointTool(
  'get_custom_dataset', 'Get a custom dataset by slug (agent API).',
  {
    slug: { type: 'string', description: 'Dataset slug.', required: true },
    uid: { type: 'string', description: 'Your Firebase user ID.' },
    tier: { type: 'string', description: 'Your tier (free/pro/business/enterprise).' },
  },
  `${BASE}/marketplace`,
);

// Seismology
endpointTool(
  'list_earthquakes', 'List recent earthquakes globally from USGS.',
  {
    page_size: { type: 'number', description: 'Number of results (default 500).' },
    min_magnitude: { type: 'number', description: 'Minimum magnitude threshold.' },
  },
  `${BASE}/seismology/v1/list-earthquakes`,
);

// Market
endpointTool(
  'list_market_quotes', 'Get real-time stock/index quotes.',
  { symbols: { type: 'string', description: 'Comma-separated list of symbols.' } },
  `${BASE}/market/v1/list-market-quotes`,
);
endpointTool(
  'list_crypto_quotes', 'Get real-time cryptocurrency prices.',
  { symbols: { type: 'string', description: 'Comma-separated crypto symbols.' } },
  `${BASE}/market/v1/list-crypto-quotes`,
);
endpointTool(
  'list_commodity_quotes', 'Get commodity market prices.',
  { symbols: { type: 'string', description: 'Comma-separated commodity symbols.' } },
  `${BASE}/market/v1/list-commodity-quotes`,
);

// Cyber
endpointTool(
  'list_cyber_threats', 'List recent cyber security threats and incidents.',
  {},
  `${BASE}/cyber/v1/list-cyber-threats`,
);

// Conflict
endpointTool(
  'list_acled_events', 'List ACLED armed conflict and location data.',
  {},
  `${BASE}/conflict/v1/list-acled-events`,
);

// Military
endpointTool(
  'get_theater_posture', 'Get current military theater posture summary.',
  {},
  `${BASE}/military/v1/get-theater-posture`,
);
endpointTool(
  'get_usni_fleet_report', 'Get US Naval Institute fleet report.',
  {},
  `${BASE}/military/v1/get-usni-fleet-report`,
);

// Aviation
endpointTool(
  'list_airport_delays', 'List current airport delays (FAA data).',
  {},
  `${BASE}/aviation/v1/list-airport-delays`,
);

// Marine/Maritime
endpointTool(
  'get_vessel_snapshot', 'Get vessel tracking snapshot.',
  { mmsi: { type: 'string', description: 'Maritime Mobile Service Identity number.' } },
  `${BASE}/maritime/v1/get-vessel-snapshot`,
);

// Climate
endpointTool(
  'list_climate_anomalies', 'List climate anomalies and weather events.',
  {},
  `${BASE}/climate/v1/list-climate-anomalies`,
);

// Infrastructure
endpointTool(
  'list_internet_outages', 'List global internet outages.',
  {},
  `${BASE}/infrastructure/v1/list-internet-outages`,
);

// Economy
endpointTool(
  'get_macro_signals', 'Get macroeconomic indicator signals.',
  {},
  `${BASE}/economic/v1/get-macro-signals`,
);
endpointTool(
  'get_energy_prices', 'Get current energy prices.',
  {},
  `${BASE}/economic/v1/get-energy-prices`,
);

// Research
endpointTool(
  'list_arxiv_papers', 'List recent arXiv research papers.',
  { category: { type: 'string', description: 'arXiv category filter (e.g., cs.AI).' } },
  `${BASE}/research/v1/list-arxiv-papers`,
);
endpointTool(
  'list_trending_repos', 'List trending GitHub repositories.',
  {},
  `${BASE}/research/v1/list-trending-repos`,
);

// Positive events
endpointTool(
  'list_positive_geo_events', 'List positive geopolitical events.',
  {},
  `${BASE}/positive-events/v1/list-positive-geo-events`,
);

// Wildfire
endpointTool(
  'list_fire_detections', 'List recent wildfire detections from VIIRS/MODIS.',
  {},
  `${BASE}/wildfire/v1/list-fire-detections`,
);

// Trade
endpointTool(
  'get_tariff_trends', 'Get recent tariff and trade policy trends.',
  {},
  `${BASE}/trade/v1/get-tariff-trends`,
);

// Supply chain
endpointTool(
  'get_chokepoint_status', 'Get global supply chain chokepoint status.',
  {},
  `${BASE}/supply-chain/v1/get-chokepoint-status`,
);
endpointTool(
  'get_critical_minerals', 'Get critical mineral supply and pricing data.',
  {},
  `${BASE}/supply-chain/v1/get-critical-minerals`,
);

// News
endpointTool(
  'list_feed_digest', 'Get curated news digest across categories.',
  { variant: { type: 'string', description: 'Site variant (full/tech/finance).' } },
  `${BASE}/news/v1/list-feed-digest`,
);

// Intelligence
endpointTool(
  'get_country_intel_brief', 'AI-generated country intelligence brief.',
  {
    country_code: { type: 'string', description: 'ISO 3166-1 alpha-2 country code (e.g., US, CN, RU).', required: true },
  },
  `${BASE}/intelligence/v1/get-country-intel-brief`,
);
endpointTool(
  'get_risk_scores', 'Get risk scores for countries or entities.',
  {},
  `${BASE}/intelligence/v1/get-risk-scores`,
);

// Displacement
endpointTool(
  'get_displacement_summary', 'Get summary of global displacement/refugee data.',
  {},
  `${BASE}/displacement/v1/get-displacement-summary`,
);

// Giving
endpointTool(
  'get_giving_summary', 'Get global humanitarian giving/aid data.',
  {},
  `${BASE}/giving/v1/get-giving-summary`,
);

// Prediction
endpointTool(
  'list_prediction_markets', 'Get prediction market odds for geopolitical events.',
  {},
  `${BASE}/prediction/v1/list-prediction-markets`,
);

// --- MCP Server ------------------------------------------------------

const server = new Server(
  { name: 'worldmonitor', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_REGISTRY.map((entry) => entry.tool),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // API key from meta (client sends via meta.auth_token or meta.api_key)
  const apiKey = (request.params as any).apiKey || (request.params as any)._meta?.apiKey;
  if (!apiKey) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Missing API key. Provide your WorldMonitor API key.' }) }],
      isError: true,
    };
  }

  // Validate key + check quota
  const keyInfo = await getApiKeyInfo(apiKey);
  if (!keyInfo || keyInfo.status !== 'active') {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid or inactive API key.' }) }],
      isError: true,
    };
  }

  const tool = TOOL_REGISTRY.find((t) => t.tool.name === name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true,
    };
  }

  // Check tier limits
  const usage = await incrementKeyUsage(apiKey);
  if (usage?.exceeded) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Monthly API quota exceeded.',
          tier: keyInfo.tier,
          callsUsed: usage.count,
          callsLimit: usage.limit,
        }),
      }],
      isError: true,
    };
  }

  // Execute tool
  try {
    const result = await tool.handler(args ?? {}, apiKey);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
});

// --- Startup ---------------------------------------------------------

async function main() {
  const transportMode = process.env.MCP_TRANSPORT ?? 'stdio';

  if (transportMode === 'streamable-http') {
    // HTTP mode — for remote MCP clients
    const httpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(httpTransport);
    console.log('[MCP] Listening on stdin (HTTP mode)');
  } else {
    // Stdio mode — for Claude Desktop, Cursor, etc.
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error('[MCP] WorldMonitor server started (stdio mode)');
  }
}

main().catch((err: unknown) => {
  console.error('[MCP] Fatal error:', err);
  process.exit(1);
});
