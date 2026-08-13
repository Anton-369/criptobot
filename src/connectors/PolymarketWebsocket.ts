import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface WssBestOdds {
  upBestAsk: number;
  downBestAsk: number;
  upBestBid: number;
  downBestBid: number;
  upAskDepth: number;
  downAskDepth: number;
  lastUpdated: number;
}

interface BookSnapshot {
  asset_id: string;
  hash: string;
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
}

export class PolymarketWebsocketConnector extends EventEmitter {
  private ws: WebSocket | null = null;
  private wssUrl: string = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
  private subscribedTokens: Set<string> = new Set();
  private bookCache: Map<string, { bestAsk: number; bestBid: number; askDepth: number; updated: number }> = new Map();
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log(`[PolyWSS] 🔌 Connecting to Polymarket CLOB WebSocket: ${this.wssUrl}...`);

    try {
      this.ws = new WebSocket(this.wssUrl);

      this.ws.on('open', () => {
        console.log(`[PolyWSS] ⚡ Connected to Polymarket CLOB WSS Feed.`);
        this.isConnected = true;
        this.resubscribe();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', () => {
        console.warn(`[PolyWSS] ⚠️ WebSocket disconnected. Scheduling reconnect in 3s...`);
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: Error) => {
        console.error(`[PolyWSS] ❌ WSS Error:`, err.message);
      });

    } catch (err: any) {
      console.error(`[PolyWSS] ❌ Connection failure:`, err.message);
      this.scheduleReconnect();
    }
  }

  public subscribeTokens(tokenIds: string[]): void {
    for (const id of tokenIds) {
      if (id) this.subscribedTokens.add(id);
    }
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscription(tokenIds);
    }
  }

  private sendSubscription(tokenIds: string[]): void {
    const validIds = tokenIds.filter(id => !!id);
    if (validIds.length === 0) return;

    const payload = {
      type: 'market',
      assets_ids: validIds
    };

    console.log(`[PolyWSS] 📡 Subscribing to ${validIds.length} Polymarket asset tokens...`);
    this.ws?.send(JSON.stringify(payload));
  }

  private resubscribe(): void {
    if (this.subscribedTokens.size > 0) {
      this.sendSubscription(Array.from(this.subscribedTokens));
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const msg = JSON.parse(data.toString());
      
      // Handle array of snapshots or single update
      const events = Array.isArray(msg) ? msg : [msg];

      for (const ev of events) {
        if (ev.asset_id && (ev.asks || ev.bids)) {
          this.updateBookCache(ev);
        }
      }
    } catch (err) {
      // Ignore heartbeat/ping frames
    }
  }

  private updateBookCache(ev: BookSnapshot): void {
    const tokenId = ev.asset_id;
    let bestAsk = 0;
    let bestBid = 0;
    let askDepth = 0;

    if (ev.asks && ev.asks.length > 0) {
      const sortedAsks = [...ev.asks].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
      bestAsk = parseFloat(sortedAsks[0].price);
      askDepth = parseFloat(sortedAsks[0].size) * bestAsk; // Depth in USD
    }

    if (ev.bids && ev.bids.length > 0) {
      const sortedBids = [...ev.bids].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
      bestBid = parseFloat(sortedBids[0].price);
    }

    this.bookCache.set(tokenId, {
      bestAsk,
      bestBid,
      askDepth,
      updated: Date.now()
    });
  }

  public getCachedOdds(upTokenId: string, downTokenId: string): WssBestOdds | null {
    const upBook = this.bookCache.get(upTokenId);
    const downBook = this.bookCache.get(downTokenId);

    if (!upBook || !downBook) return null;

    // Reject stale cache (> 5 seconds old)
    const now = Date.now();
    if (now - upBook.updated > 5000 || now - downBook.updated > 5000) {
      return null;
    }

    return {
      upBestAsk: upBook.bestAsk,
      downBestAsk: downBook.bestAsk,
      upBestBid: upBook.bestBid,
      downBestBid: downBook.bestBid,
      upAskDepth: upBook.askDepth,
      downAskDepth: downBook.askDepth,
      lastUpdated: Math.max(upBook.updated, downBook.updated)
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
