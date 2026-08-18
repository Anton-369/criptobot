/**
 * 📚 LOCAL ORDERBOOK RECONSTRUCTOR (RAM-BASED CLOB DELTA MANAGER)
 * Arquitectura Híbrida V4 - Reconstrucción en Vivo del Libro de Polymarket (1H, 15M, 5M)
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

  public registerTokens(mappings: TokenMapping[]): void {
    for (const m of mappings) {
      this.tokenMap.set(m.tokenId, m);
      const key = m.coin + '_' + m.side + '_' + m.timeframe;
      this.dynamicLookup.set(key, m.tokenId);
    }
    console.log('[LocalOrderbook] 📋 Registrados ' + mappings.length + ' tokens activos para Polymarket (1H, 15M, 5M).');
  }

  public registerAndSubscribeTokens(mappings: TokenMapping[]): void {
    const newTokensToSubscribe: string[] = [];
    for (const m of mappings) {
      if (!this.tokenMap.has(m.tokenId)) {
        this.tokenMap.set(m.tokenId, m);
        newTokensToSubscribe.push(m.tokenId);
      }
      const key = m.coin + '_' + m.side + '_' + m.timeframe;
      this.dynamicLookup.set(key, m.tokenId);
    }

    if (newTokensToSubscribe.length > 0) {
      console.log('[LocalOrderbook] 🔄 Auto-rotación de ciclo: Suscribiendo ' + newTokensToSubscribe.length + ' nuevos tokens...');
      if (this.ws && this.ws.readyState === 1) {
        const msg = JSON.stringify({
          assets_ids: newTokensToSubscribe,
          type: 'market'
        });
        this.ws.send(msg);
      }
    }
  }

  public getRealTokenId(coin: string, side: 'UP' | 'DOWN', tf: '1H' | '15M' | '5M'): string | undefined {
    const key = coin + '_' + side + '_' + tf;
    return this.dynamicLookup.get(key);
  }

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
    console.log('[LocalOrderbook] 📡 Suscritos ' + assetIds.length + ' tokens (1H/15M/5M) en el CLOB WebSocket.');
  }

  private handleMessage(raw: any): void {
    try {
      const data = JSON.parse(raw.toString());
      const events = Array.isArray(data) ? data : [data];

      for (const event of events) {
        const tokenId = event.asset_id || event.market;
        if (!tokenId) continue;

        const mapping = this.tokenMap.get(tokenId);
        if (!mapping) continue;

        let bestAsk = 0;
        if (event.asks && event.asks.length > 0) {
          bestAsk = parseFloat(event.asks[0].price);
        } else if (event.price) {
          bestAsk = parseFloat(event.price);
        } else if (event.changes && Array.isArray(event.changes)) {
          for (const ch of event.changes) {
            if (ch.side === 'SELL' || ch.side === 'ASK') {
              bestAsk = parseFloat(ch.price);
              break;
            }
          }
        }

        if (bestAsk > 0) {
          this.bestAsks.set(tokenId, bestAsk);
          HFTSharedState.updatePolyAsk(mapping.coin, mapping.side, mapping.timeframe, bestAsk);
        }
      }
    } catch (e) {
      // Ignorar
    }
  }

  public getBestAsk(tokenId: string): number {
    return this.bestAsks.get(tokenId) || 0;
  }
}
