/**
 * ⚡ BINANCE MULTI-TIMEFRAME WEBSOCKET STREAM (1H, 15M, 5M) + HYPERLIQUID DEX
 * Arquitectura Híbrida V4 - Subscripción Nativa a Klines
 */

import WebSocket from 'ws';
import { HFTSharedState } from './HFTSharedState';

const SYMBOLS = ['solusdt', 'xrpusdt', 'dogeusdt', 'bnbusdt'];

export class BinanceMultiFrameWS {
  private ws: any = null;
  private hypeInterval: NodeJS.Timeout | null = null;

  public async start(): Promise<void> {
    await this.fetchInitialOpenPrices();

    const streams: string[] = [];
    for (const sym of SYMBOLS) {
      streams.push(sym + '@kline_1h');
      streams.push(sym + '@kline_15m');
      streams.push(sym + '@kline_5m');
    }

    const url = 'wss://stream.binance.com:9443/stream?streams=' + streams.join('/');
    console.log('[BinanceMultiWS] 📡 Conectando streams nativos de 1H, 15M y 5M de Binance...');

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[BinanceMultiWS] ✅ Stream multiplexado (1H/15M/5M) conectado con éxito.');
    });

    this.ws.on('message', (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!msg.data || !msg.data.k) return;

        const k = msg.data.k;
        const symbol = k.s.toUpperCase();
        const coin = symbol.replace('USDT', '');
        const interval = k.i;
        const openPrice = parseFloat(k.o);
        const currentPrice = parseFloat(k.c);

        HFTSharedState.updateNativeKline(coin, interval, openPrice, currentPrice);
      } catch (err) {
        // Ignorar
      }
    });

    this.ws.on('close', () => {
      console.warn('[BinanceMultiWS] ⚠️ Conexión perdida. Reconectando en 1s...');
      setTimeout(() => this.start(), 1000);
    });

    this.ws.on('error', (err: any) => {
      console.error('[BinanceMultiWS] ❌ Error:', err.message);
    });

    this.startHypeStream();
  }

  private async fetchInitialOpenPrices(): Promise<void> {
    for (const sym of SYMBOLS) {
      const coin = sym.replace('usdt', '').toUpperCase();
      try {
        for (const tf of ['1h', '15m', '5m']) {
          const res = await (globalThis as any).fetch('https://api.binance.com/api/v3/klines?symbol=' + sym.toUpperCase() + '&interval=' + tf + '&limit=1');
          if (res.ok) {
            const data: any = await res.json();
            if (data && data.length > 0) {
              const openPrice = parseFloat(data[0][1]);
              const closePrice = parseFloat(data[0][4]);
              HFTSharedState.updateNativeKline(coin, tf, openPrice, closePrice);
            }
          }
        }
      } catch (e: any) {
        console.warn('[BinanceMultiWS] ⚠️ Error pre-cargando Klines REST para ' + coin + ': ' + e.message);
      }
    }
  }

  private startHypeStream(): void {
    if (this.hypeInterval) clearInterval(this.hypeInterval);

    this.hypeInterval = setInterval(async () => {
      try {
        const nowMs = Date.now();
        for (const tf of ['1h', '15m', '5m']) {
          const deltaMs = tf === '1h' ? 3600000 : (tf === '15m' ? 900000 : 300000);
          const res = await (globalThis as any).fetch('https://api.hyperliquid.xyz/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'candleSnapshot',
              req: { coin: 'HYPE', interval: tf, startTime: nowMs - deltaMs, endTime: nowMs }
            })
          });
          if (res.ok) {
            const candles: any = await res.json();
            if (candles && candles.length > 0) {
              const latest = candles[candles.length - 1];
              const openPx = parseFloat(latest.o);
              const closePx = parseFloat(latest.c);
              HFTSharedState.updateNativeKline('HYPE', tf, openPx, closePx);
            }
          }
        }
      } catch (e) {
        // Soft ignore
      }
    }, 1000);
  }
}
