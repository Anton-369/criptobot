/**
 * 📚 LOCAL ORDERBOOK RECONSTRUCTOR (RAM-BASED CLOB DELTA MANAGER)
 * Arquitectura Híbrida V4 - Reconstrucción en Vivo del Libro de Polymarket
 * 
 * Escucha los deltas por WebSocket del CLOB de Polymarket y mantiene
 * el estado del Best Ask en la memoria RAM en sub-milisegundos.
 */

import WebSocket from 'ws';
import { HFTSharedState } from './HFTSharedState';

export interface TokenMapping {
  tokenId: string;
  coin: string;
  side: 'UP' | 'DOWN';
  timeframe: '1H' | '15M' | '5M';
}

export class LocalOrderbookManager {
  private ws: any = null;
  private tokenMap: Map<string, TokenMapping> = new Map();
  private bestAsks: Map<string, number> = new Map();
  private dynamicLookup: Map<string, string> = new Map();

  constructor(private wsUrl: string = 'wss://ws-subscriptions-clob.polymarket.com/ws/market') {}

  // Registrar tokens activos para las 5 monedas
  public registerTokens(mappings: TokenMapping[]): void {
    for (const m of mappings) {
      this.tokenMap.set(m.tokenId, m);
      const key = `${m.coin}_${m.side}_${m.timeframe}`;
      this.dynamicLookup.set(key, m.tokenId);
    }
  }

  public getRealTokenId(coin: string, side: 'UP' | 'DOWN', tf: '1H' | '15M' | '5M'): string | undefined {
    const key = `${coin}_${side}_${tf}`;
    return this.dynamicLookup.get(key);
  }

  // Conectar WebSocket nativo
  public start(): void {
    console.log('[LocalOrderbook] 📡 Conectando WebSocket nativo de Polymarket CLOB...');
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('[LocalOrderbook] ✅ WebSocket Polymarket conectado. Suscribiendo tokens...');
      this.subscribeAll();
    });

    this.ws.on('message', (raw: any) => {
      this.handleMessage(raw);
    });

    this.ws.on('close', () => {
      console.warn('[LocalOrderbook] ⚠️ WebSocket Polymarket desconectado. Reconectando en 2s...');
      setTimeout(() => this.start(), 2000);
    });

    this.ws.on('error', (err: any) => {
      console.error('[LocalOrderbook] ❌ Error en WebSocket Polymarket:', err.message);
    });
  }

  private subscribeAll(): void {
    if (!this.ws || this.ws.readyState !== 1) return;
    
    const assetIds = Array.from(this.tokenMap.keys());
    if (assetIds.length === 0) return;

    const msg = JSON.stringify({
      assets_ids: assetIds,
      type: 'market'
    });

    this.ws.send(msg);
    console.log(`[LocalOrderbook] 📡 Suscritos ${assetIds.length} tokens en el CLOB WebSocket.`);
  }

  // Procesar deltas de precio en sub-milisegundos
  private handleMessage(raw: any): void {
    try {
      const data = JSON.parse(raw.toString());
      if (!Array.isArray(data)) return;

      for (const event of data) {
        const tokenId = event.asset_id;
        const mapping = this.tokenMap.get(tokenId);
        if (!mapping) continue;

        // Extraer el mejor precio de compra (Ask) del libro
        if (event.asks && event.asks.length > 0) {
          const bestAsk = parseFloat(event.asks[0].price);
          this.bestAsks.set(tokenId, bestAsk);

          // Actualizar inmediatamente la RAM fija Zero-GC
          if (mapping.timeframe === '1H') {
            HFTSharedState.updatePolyAsk(mapping.coin, mapping.side, bestAsk);
          }
        }
      }
    } catch (e) {
      // Ignorar mensajes de control
    }
  }

  public getBestAsk(tokenId: string): number {
    return this.bestAsks.get(tokenId) || 0;
  }
}
