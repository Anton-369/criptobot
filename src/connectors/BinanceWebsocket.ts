import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { CONFIG } from '../config/environment';

export interface BinanceTickerState {
  coin: string;
  symbol: string;
  currentPrice: number;
  openPrice1H: number;         // Open price at top of 1H cycle
  previousOpenPrice1H: number; // Open price of PREVIOUS completed cycle
  highPrice1H: number;
  lowPrice1H: number;
  deltaAbs: number;            // Current - Open1H
  deltaPct: number;            // % change from 1H open
  delta24HPct: number;         // % 24H macro change from Binance
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
        previousOpenPrice1H: 0,
        highPrice1H: 0,
        lowPrice1H: 0,
        deltaAbs: 0,
        deltaPct: 0,
        delta24HPct: 0,
        trend: 'NEUTRAL',
        lastTickTimestamp: 0,
        latencyMs: 0
      });
    }
  }

  public async fetch1HOpenPrices(): Promise<void> {
    for (const pair of CONFIG.PAIRS) {
      if (pair.coin === 'HYPE') {
        try {
          const nowMs = Date.now();
          const resp = await fetch('https://api.hyperliquid.xyz/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'candleSnapshot',
              req: { coin: 'HYPE', interval: '1h', startTime: nowMs - 3600000, endTime: nowMs }
            })
          });
          if (resp.ok) {
            const candles: any = await resp.json();
            if (Array.isArray(candles) && candles.length > 0) {
              const openPrice1H = parseFloat(candles[0].o);
              this.setOpenPrice1H('hypeusdt', openPrice1H);
              console.log(`[BinanceWS/HL] 📊 Precio Apertura 1H obtenido para HYPE: $${openPrice1H.toFixed(4)}`);
            }
          }
        } catch (e: any) {
          console.warn(`[BinanceWS/HL] No se pudo obtener 1H open para HYPE: ${e.message}`);
        }
        continue;
      }
      try {
        const resp = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair.symbol.toUpperCase()}&interval=1h&limit=1`);
        if (resp.ok) {
          const klines: any = await resp.json();
          if (Array.isArray(klines) && klines.length > 0) {
            const openPrice1H = parseFloat(klines[0][1]);
            this.setOpenPrice1H(pair.symbol, openPrice1H);
            console.log(`[BinanceWS] 📊 Precio Apertura 1H obtenido para ${pair.coin}: $${openPrice1H.toFixed(4)}`);
          }
        }
      } catch (e: any) {
        console.warn(`[BinanceWS] No se pudo obtener kline 1H para ${pair.symbol}: ${e.message}`);
      }
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.fetch1HOpenPrices();
    this.scheduleHourlyReset();
    this.connect();
    this.startHypePoller();
  }

  private scheduleHourlyReset(): void {
    const now = new Date();
    const nextHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 5, 0));
    const delayMs = nextHour.getTime() - now.getTime();

    setTimeout(() => {
      if (!this.isRunning) return;
      console.log(`[BinanceWS] ⏰ Transición de ciclo horario detectada (:00:05 ET/UTC). Refrescando precios de apertura 1H...`);
      this.fetch1HOpenPrices();
      this.scheduleHourlyReset();
    }, delayMs);
  }

  private startHypePoller(): void {
    setInterval(async () => {
      if (!this.isRunning) return;
      try {
        const resp = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'allMids' })
        });
        if (resp.ok) {
          const mids: any = await resp.json();
          if (mids && mids.HYPE) {
            const currentPrice = parseFloat(mids.HYPE);
            const state = this.tickerStates.get('HYPEUSDT');
            if (state) {
              state.currentPrice = currentPrice;
              if (state.openPrice1H === 0) state.openPrice1H = currentPrice;
              state.deltaAbs = currentPrice - state.openPrice1H;
              state.deltaPct = ((currentPrice - state.openPrice1H) / state.openPrice1H) * 100;
              state.lastTickTimestamp = Date.now();
              state.trend = state.deltaPct > 0.05 ? 'UP' : (state.deltaPct < -0.05 ? 'DOWN' : 'NEUTRAL');
              this.emit('ticker', state);
            }
          }
        }
      } catch (e) {}
    }, 1000);
  }

  private connect(): void {
    const binancePairs = CONFIG.PAIRS.filter(p => p.coin !== 'HYPE');
    const streams = binancePairs.map(p => `${p.symbol}@ticker`).join('/');
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
      const symbol = d.s as string;
      const currentPrice = parseFloat(d.c);
      const eventTime = d.E as number;
      const latencyMs = receiveTime - eventTime;

      const state = this.tickerStates.get(symbol);
      if (state) {
        state.currentPrice = currentPrice;
        
        // If openPrice1H hasn't been fetched yet, fallback to current price
        if (state.openPrice1H === 0) {
          state.openPrice1H = currentPrice;
        }

        state.deltaAbs = currentPrice - state.openPrice1H;
        state.deltaPct = ((currentPrice - state.openPrice1H) / state.openPrice1H) * 100;
        state.delta24HPct = parseFloat(d.P) || 0;
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
      // Save current open as previous cycle's open before updating
      if (state.openPrice1H > 0 && state.openPrice1H !== openPrice) {
        state.previousOpenPrice1H = state.openPrice1H;
      }
      state.openPrice1H = openPrice;
      if (state.currentPrice > 0) {
        state.deltaAbs = state.currentPrice - openPrice;
        state.deltaPct = ((state.currentPrice - openPrice) / openPrice) * 100;
      }
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
