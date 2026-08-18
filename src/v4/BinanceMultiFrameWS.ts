/**
 * ⚡ BINANCE MULTI-TIMEFRAME WEBSOCKET STREAM (1H, 15M, 5M)
 * Arquitectura Híbrida V4 - Subscripción Nativa a Klines de Binance
 * 
 * Recibe directamente los eventos de velas de 1H, 15M y 5M con sus precios de apertura exactos (k.o).
 */

import WebSocket from 'ws';
import { HFTSharedState } from './HFTSharedState';

const SYMBOLS = ['solusdt', 'xrpusdt', 'dogeusdt', 'bnbusdt'];

export class BinanceMultiFrameWS {
  private ws: any = null;

  public start(): void {
    // Construir streams multiplexados nativos de Binance para 1H, 15M y 5M
    const streams: string[] = [];
    for (const sym of SYMBOLS) {
      streams.push(`${sym}@kline_1h`);
      streams.push(`${sym}@kline_15m`);
      streams.push(`${sym}@kline_5m`);
    }

    const url = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
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
        const symbol = k.s.toUpperCase(); // e.g. SOLUSDT
        const coin = symbol.replace('USDT', '');
        const interval = k.i; // '1h', '15m', '5m'
        const openPrice = parseFloat(k.o);
        const currentPrice = parseFloat(k.c);

        // Actualizar directamente la memoria RAM contigua en cero milisegundos
        HFTSharedState.updateNativeKline(coin, interval, openPrice, currentPrice);
      } catch (err) {
        // Ignorar errores de parseo
      }
    });

    this.ws.on('close', () => {
      console.warn('[BinanceMultiWS] ⚠️ Conexión perdida. Reconectando en 1s...');
      setTimeout(() => this.start(), 1000);
    });

    this.ws.on('error', (err: any) => {
      console.error('[BinanceMultiWS] ❌ Error:', err.message);
    });
  }
}
