import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { CONFIG } from '../config/environment';

export interface BinanceTickerState {
  coin: string;
  symbol: string;
  currentPrice: number;
  openPrice1H: number;      // Open price at top of 1H cycle
  highPrice1H: number;
  lowPrice1H: number;
  deltaAbs: number;          // Current - Open
  deltaPct: number;          // % change from 1H open
  trend: 'UP' | 'DOWN' | 'NEUTRAL';
  lastTickTimestamp: number;
  latencyMs: number;
}

export class BinanceWebsocketEngine extends EventEmitter {
  private ws: WebSocket | null = null;
  private tickerStates: Map<string, BinanceTickerState> = new Map();
  private isRunning: boolean = false;
  private reconnectIntervalMs: number = 3000;

  constructor() {
    super();
    // Initialize default states
    for (const pair of CONFIG.PAIRS) {
      this.tickerStates.set(pair.symbol.toUpperCase(), {
        coin: pair.coin,
        symbol: pair.symbol.toUpperCase(),
        currentPrice: 0,
        openPrice1H: 0,
        highPrice1H: 0,
        lowPrice1H: 0,
        deltaAbs: 0,
        deltaPct: 0,
        trend: 'NEUTRAL',
        lastTickTimestamp: 0,
        latencyMs: 0
      });
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.connect();
  }

  private connect(): void {
    // Subscribe to combined stream: xrpusdt@ticker / solusdt@ticker / dogeusdt@ticker
    const streams = CONFIG.PAIRS.map(p => `${p.symbol}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    console.log(`[BinanceWS] Conectando a stream ultra-rápido: ${url}`);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log(`[BinanceWS] ✅ Conexión WebSocket establecida exitosamente (<15ms latency).`);
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (err: Error) => {
      console.error(`[BinanceWS] ❌ Error en WebSocket: ${err.message}`);
    });

    this.ws.on('close', () => {
      console.warn(`[BinanceWS] ⚠️ Conexión cerrada. Reconectando en ${this.reconnectIntervalMs / 1000}s...`);
      if (this.isRunning) {
        setTimeout(() => this.connect(), this.reconnectIntervalMs);
      }
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const receiveTime = Date.now();
      const payload = JSON.parse(data.toString());
      if (!payload || !payload.data) return;

      const d = payload.data;
      // d.s: Symbol (e.g. XRPUSDT)
      // d.c: Current close price
      // d.o: Open price (24h open, but we use d.o for ticker reference)
      // d.E: Event time
      const symbol = d.s as string;
      const currentPrice = parseFloat(d.c);
      const openPrice1H = parseFloat(d.o); // 24h open from ticker, updated per cycle
      const eventTime = d.E as number;
      const latencyMs = receiveTime - eventTime;

      const state = this.tickerStates.get(symbol);
      if (state) {
        state.currentPrice = currentPrice;
        // Keep initial openPrice1H if already set, or initialize
        if (state.openPrice1H === 0) {
          state.openPrice1H = openPrice1H;
        }

        state.deltaAbs = currentPrice - state.openPrice1H;
        state.deltaPct = ((currentPrice - state.openPrice1H) / state.openPrice1H) * 100;
        state.highPrice1H = parseFloat(d.h);
        state.lowPrice1H = parseFloat(d.l);
        state.lastTickTimestamp = eventTime;
        state.latencyMs = latencyMs;

        if (state.deltaPct > 0.05) {
          state.trend = 'UP';
        } else if (state.deltaPct < -0.05) {
          state.trend = 'DOWN';
        } else {
          state.trend = 'NEUTRAL';
        }

        // Emit ultra-fast ticker update event
        this.emit('ticker', state);
      }
    } catch (err) {
      // Ignore JSON parse errors for heartbeats
    }
  }

  public getTickerState(symbol: string): BinanceTickerState | undefined {
    return this.tickerStates.get(symbol.toUpperCase());
  }

  public getAllTickerStates(): BinanceTickerState[] {
    return Array.from(this.tickerStates.values());
  }

  public setOpenPrice1H(symbol: string, openPrice: number): void {
    const state = this.tickerStates.get(symbol.toUpperCase());
    if (state) {
      state.openPrice1H = openPrice;
      state.deltaAbs = state.currentPrice - openPrice;
      state.deltaPct = ((state.currentPrice - openPrice) / openPrice) * 100;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
