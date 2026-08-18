/**
 * ⚡ HFT REACTIVE ENGINE V4 - MULTI-TIMEFRAME EVENT-DRIVEN SNIPER
 * Arquitectura Híbrida V4 - Matriz de 30 Parámetros Calibrados
 * 
 * Reacciona a cada tick de Binance y Hyperliquid en sub-milisegundos.
 * Inferencia O(1) leyendo Float64Array en RAM sin Garbage Collection.
 */

import { HFTSharedState } from './HFTSharedState';
import { PolymarketFastSigner } from './PolymarketFastSigner';
import { LocalOrderbookManager } from './LocalOrderbook';

export interface AssetRule {
  coin: string;
  tf: '1H' | '15M';
  deltaUpTrigger: number;
  pWinUp: number;
  deltaDownTrigger: number;
  pWinDown: number;
}

// MATRIZ DE 30 PARÁMETROS FORENSICAMENTE CALIBRADA
export const CALIBRATED_RULES: Record<string, Record<string, AssetRule>> = {
  'SOL': {
    '1H':  { coin: 'SOL', tf: '1H',  deltaUpTrigger: 0.60, pWinUp: 0.596, deltaDownTrigger: -0.75, pWinDown: 0.614 },
    '15M': { coin: 'SOL', tf: '15M', deltaUpTrigger: 0.35, pWinUp: 0.500, deltaDownTrigger: -0.45, pWinDown: 0.588 }
  },
  'XRP': {
    '1H':  { coin: 'XRP', tf: '1H',  deltaUpTrigger: 0.60, pWinUp: 0.567, deltaDownTrigger: -0.75, pWinDown: 0.576 },
    '15M': { coin: 'XRP', tf: '15M', deltaUpTrigger: 0.35, pWinUp: 0.577, deltaDownTrigger: -0.45, pWinDown: 0.556 }
  },
  'DOGE': {
    '1H':  { coin: 'DOGE', tf: '1H',  deltaUpTrigger: 0.80, pWinUp: 0.534, deltaDownTrigger: -0.90, pWinDown: 0.654 },
    '15M': { coin: 'DOGE', tf: '15M', deltaUpTrigger: 0.50, pWinUp: 0.364, deltaDownTrigger: -0.60, pWinDown: 0.800 }
  },
  'BNB': {
    '1H':  { coin: 'BNB', tf: '1H',  deltaUpTrigger: 0.50, pWinUp: 0.467, deltaDownTrigger: -0.75, pWinDown: 0.583 },
    '15M': { coin: 'BNB', tf: '15M', deltaUpTrigger: 0.30, pWinUp: 0.500, deltaDownTrigger: -0.45, pWinDown: 0.667 }
  },
  'HYPE': {
    '1H':  { coin: 'HYPE', tf: '1H',  deltaUpTrigger: 0.60, pWinUp: 0.750, deltaDownTrigger: -0.80, pWinDown: 0.782 },
    '15M': { coin: 'HYPE', tf: '15M', deltaUpTrigger: 0.35, pWinUp: 0.520, deltaDownTrigger: -0.50, pWinDown: 0.778 }
  }
};

export class HFTReactiveEngine {
  private signer: PolymarketFastSigner;
  private lastTriggerTimes: Map<string, number> = new Map();
  private cooldownMs: number = 30000; // 30s de enfriamiento entre disparos

  constructor(private orderbook: LocalOrderbookManager) {
    this.signer = new PolymarketFastSigner();
  }

  /**
   * Inferencia Inmediata O(1) al recibir Klines nativas
   */
  public evaluateTick(coin: string): void {
    const delta1H = HFTSharedState.getDelta1H(coin);
    const delta15M = HFTSharedState.getDelta15M(coin);
    const delta5M = HFTSharedState.getDelta5M(coin);

    const rules = CALIBRATED_RULES[coin];
    if (!rules) return;

    if (rules['1H']) this.checkRule(rules['1H'], delta1H, delta5M);
    if (rules['15M']) this.checkRule(rules['15M'], delta15M, delta5M);
  }

  private checkRule(rule: AssetRule, currentDelta: number, delta5MFilter: number): void {
    const coin = rule.coin;
    const now = Date.now();

    // A) REGLA SUBIDA (UP)
    if (currentDelta >= rule.deltaUpTrigger) {
      if (delta5MFilter >= 0) { // Filtro 5M
        const askUP = HFTSharedState.getPolyAsk(coin, 'UP');
        if (askUP > 0 && askUP <= 0.56) {
          const key = `${coin}_${rule.tf}_UP`;
          if (now - (this.lastTriggerTimes.get(key) || 0) > this.cooldownMs) {
            this.lastTriggerTimes.set(key, now);
            this.fire(coin, 'UP', rule.tf, askUP, rule.pWinUp);
          }
        }
      }
    }

    // B) REGLA CAÍDA (DOWN)
    if (currentDelta <= rule.deltaDownTrigger) {
      if (delta5MFilter <= 0) { // Filtro 5M
        const askDOWN = HFTSharedState.getPolyAsk(coin, 'DOWN');
        if (askDOWN > 0 && askDOWN <= 0.56) {
          const key = `${coin}_${rule.tf}_DOWN`;
          if (now - (this.lastTriggerTimes.get(key) || 0) > this.cooldownMs) {
            this.lastTriggerTimes.set(key, now);
            this.fire(coin, 'DOWN', rule.tf, askDOWN, rule.pWinDown);
          }
        }
      }
    }
  }

  private async fire(coin: string, side: 'UP' | 'DOWN', tf: '1H' | '15M', askPrice: number, pWin: number): Promise<void> {
    // 🎯 OBTENER TOKEN ID REAL DE POLYMARKET DINÁMICAMENTE (REPARACIÓN BUG 4)
    const realTokenId = this.orderbook.getRealTokenId(coin, side, tf);
    if (!realTokenId) {
      console.warn(`[Engine V4] ⚠️ No se encontró Token ID real en Polymarket para ${coin} ${side} ${tf}. Disparo omitido por seguridad.`);
      return;
    }

    const expectedValue = (pWin * 0.34) - ((1.0 - pWin) * 0.08);

    console.log(`\n=================================================================`);
    console.log(`🎯 [GUNSHOT FIRED V4] Disparo Francotirador HFT en RAM!`);
    console.log(`📌 Activo: ${coin} | Mercado: ${tf} | Lado: ${side}`);
    console.log(`🔑 Token ID Real: ${realTokenId}`);
    console.log(`💲 Precio Ask Polymarket: $${askPrice.toFixed(3)} | Certidumbre: ${(pWin * 100).toFixed(1)}%`);
    console.log(`📈 EV Calculado: +$${expectedValue.toFixed(4)} USD por dólar apostado`);
    console.log(`=================================================================\n`);

    await this.signer.executeFOKOrder({
      tokenId: realTokenId,
      price: askPrice,
      amountUsdc: 1.00,
      side: 'BUY',
      coin
    });
  }
}
