/**
 * Real-time market data via WebSocket using Finnhub (free tier)
 * Updates prices instantly with flickering animations
 */

import type { MarketData } from '@/types';
import { getMarketWatchlistEntries } from '@/services/market-watchlist';

// Finnhub WebSocket URL (free tier: 60 calls/minute, US stocks only)
const FINNHUB_WS_URL = 'wss://ws.finnhub.io?token=';

interface WebSocketMessage {
  type: string;
  data?: TradeData;
}

interface TradeData {
  s: string;  // symbol
  p: number;  // price
  t: number;  // timestamp
  v: number;  // volume
  c: string[]; // conditions
}

class MarketWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private listeners: Map<string, ((data: Partial<MarketData>) => void)[]> = new Map();
  private isConnected = false;
  private currentPrices: Map<string, number> = new Map();
  private lastUpdate: Map<string, number> = new Map();
  private heartbeatInterval: number | null = null;

  // Connect to WebSocket
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    // Support both VITE_FINNHUB_API_KEY (client) and FINNHUB_API_KEY (server)
    const apiKey = import.meta.env.VITE_FINNHUB_API_KEY || import.meta.env.FINNHUB_API_KEY || '';
    
    // Debug logging
    console.log('[MarketWS] Checking API key:', {
      viteKey: import.meta.env.VITE_FINNHUB_API_KEY ? 'present' : 'missing',
      serverKey: import.meta.env.FINNHUB_API_KEY ? 'present' : 'missing',
      finalKey: apiKey ? `present (${apiKey.length} chars)` : 'missing'
    });
    
    if (!apiKey) {
      console.warn('[MarketWS] No Finnhub API key available, WebSocket disabled');
      return;
    }

    try {
      console.log('[MarketWS] Connecting to Finnhub WebSocket...');
      this.ws = new WebSocket(`${FINNHUB_WS_URL}${apiKey}`);

      this.ws.onopen = () => {
        console.log('[MarketWS] Connected to Finnhub WebSocket');
        this.isConnected = true;
        this.resubscribeAll();
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WebSocketMessage = JSON.parse(event.data);
          console.log('[MarketWS] Received message:', msg.type, msg);
          this.handleMessage(msg);
        } catch (e) {
          console.error('[MarketWS] Failed to parse message:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[MarketWS] Disconnected:', event.code, event.reason);
        this.isConnected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[MarketWS] Error:', error);
        this.ws?.close();
      };
    } catch (e) {
      console.error('[MarketWS] Failed to create WebSocket:', e);
    }
  }

  // Disconnect
  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
    this.subscribedSymbols.clear();
  }

  // Subscribe to symbols from watchlist
  subscribeToWatchlist(): void {
    const entries = getMarketWatchlistEntries();
    const symbols = entries.map(e => e.symbol);
    this.subscribe(symbols);
  }

  // Subscribe to symbols
  subscribe(symbols: string[]): void {
    if (!this.isConnected || !this.ws) return;

    for (const symbol of symbols) {
      if (!this.subscribedSymbols.has(symbol)) {
        this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
        this.subscribedSymbols.add(symbol);
      }
    }
  }

  // Unsubscribe from symbols
  unsubscribe(symbols: string[]): void {
    if (!this.isConnected || !this.ws) return;

    for (const symbol of symbols) {
      if (this.subscribedSymbols.has(symbol)) {
        this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
        this.subscribedSymbols.delete(symbol);
      }
    }
  }

  // Add price update listener
  onPriceUpdate(symbol: string, callback: (data: Partial<MarketData>) => void): () => void {
    if (!this.listeners.has(symbol)) {
      this.listeners.set(symbol, []);
    }
    this.listeners.get(symbol)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(symbol);
      if (callbacks) {
        const idx = callbacks.indexOf(callback);
        if (idx > -1) callbacks.splice(idx, 1);
      }
    };
  }

  // Check if connected
  getIsConnected(): boolean {
    return this.isConnected;
  }

  private handleMessage(msg: WebSocketMessage): void {
    if (msg.type === 'trade' && msg.data) {
      const trade = msg.data;
      const symbol = trade.s;
      const price = trade.p;
      const timestamp = trade.t;

      // Skip if duplicate or older than last update
      const lastTime = this.lastUpdate.get(symbol) || 0;
      if (timestamp <= lastTime) return;

      this.lastUpdate.set(symbol, timestamp);

      // Calculate change if we have previous price
      const previousPrice = this.currentPrices.get(symbol);
      let change: number | null = null;

      if (previousPrice && previousPrice !== 0) {
        change = price - previousPrice;
      }

      this.currentPrices.set(symbol, price);

      // Notify listeners
      const callbacks = this.listeners.get(symbol);
      if (callbacks) {
        const update: Partial<MarketData> = {
          symbol,
          price,
          change,
        };
        callbacks.forEach(cb => cb(update));
      }
    }
  }

  private resubscribeAll(): void {
    const symbols = Array.from(this.subscribedSymbols);
    this.subscribedSymbols.clear();
    this.subscribe(symbols);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// Export singleton instance
export const marketWebSocket = new MarketWebSocketService();
