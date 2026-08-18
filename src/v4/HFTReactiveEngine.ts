import { HFTSharedState } from './HFTSharedState';
import { PolymarketFastSigner } from './PolymarketFastSigner';
import { LocalOrderbookManager } from './LocalOrderbook';

export interface ApprovedRule {
  id: number;
  coin: string;
  tf: '1H' | '15M' | '5M';
  side: 'UP' | 'DOWN';
  deltaTrigger: number;
  score: number;        // Win Rate Out-of-Sample
  takeProfit: number;   // TP especifico por Mercado
  stopLoss: number;     // SL especifico por Mercado
  min5MFilter: number;  // Filtro 5M
  tradeCount?: number;  // Disparos acumulados en vivo
  winsCount?: number;   // Victorias acumuladas en vivo
}

/**
 * 🎛️ LLAVES DE CONTROL DE MERCADO (5M, 15M, 1H)
 */
export const MARKET_FLAGS = {
  ENABLE_5M: true,   // 🟢 Mercado 5 Minutos
  ENABLE_15M: true,  // 🟢 Mercado 15 Minutos
  ENABLE_1H: true    // 🟢 Mercado 1 Hora
};

/**
 * 🏆 MATRIZ DE 25 REGLAS APROBADAS POR MERCADO
 */
export const APPROVED_V4_RULES: ApprovedRule[] = [
  // 1. SOL
  { id: 1,  coin: 'SOL', tf: '1H',  side: 'UP',   deltaTrigger: 0.80,  score: 0.596, takeProfit: 0.90, stopLoss: 0.45, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 2,  coin: 'SOL', tf: '1H',  side: 'DOWN', deltaTrigger: -0.80, score: 0.614, takeProfit: 0.90, stopLoss: 0.45, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 11, coin: 'SOL', tf: '15M', side: 'UP',   deltaTrigger: 0.40,  score: 0.561, takeProfit: 0.82, stopLoss: 0.46, min5MFilter: 0.10, tradeCount: 0, winsCount: 0 },
  { id: 12, coin: 'SOL', tf: '15M', side: 'DOWN', deltaTrigger: -0.40, score: 0.604, takeProfit: 0.82, stopLoss: 0.46, min5MFilter: -0.10, tradeCount: 0, winsCount: 0 },
  { id: 21, coin: 'SOL', tf: '5M',  side: 'UP',   deltaTrigger: 0.20,  score: 0.556, takeProfit: 0.78, stopLoss: 0.47, min5MFilter: 0.20, tradeCount: 0, winsCount: 0 },
  { id: 22, coin: 'SOL', tf: '5M',  side: 'DOWN', deltaTrigger: -0.20, score: 0.617, takeProfit: 0.78, stopLoss: 0.47, min5MFilter: -0.20, tradeCount: 0, winsCount: 0 },

  // 2. XRP
  { id: 3,  coin: 'XRP', tf: '1H',  side: 'UP',   deltaTrigger: 0.60,  score: 0.567, takeProfit: 0.88, stopLoss: 0.47, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 4,  coin: 'XRP', tf: '1H',  side: 'DOWN', deltaTrigger: -0.60, score: 0.576, takeProfit: 0.88, stopLoss: 0.47, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 13, coin: 'XRP', tf: '15M', side: 'UP',   deltaTrigger: 0.35,  score: 0.573, takeProfit: 0.80, stopLoss: 0.48, min5MFilter: 0.10, tradeCount: 0, winsCount: 0 },
  { id: 14, coin: 'XRP', tf: '15M', side: 'DOWN', deltaTrigger: -0.35, score: 0.564, takeProfit: 0.80, stopLoss: 0.48, min5MFilter: -0.10, tradeCount: 0, winsCount: 0 },
  { id: 23, coin: 'XRP', tf: '5M',  side: 'UP',   deltaTrigger: 0.18,  score: 0.557, takeProfit: 0.75, stopLoss: 0.48, min5MFilter: 0.18, tradeCount: 0, winsCount: 0 },
  { id: 24, coin: 'XRP', tf: '5M',  side: 'DOWN', deltaTrigger: -0.18, score: 0.561, takeProfit: 0.75, stopLoss: 0.48, min5MFilter: -0.18, tradeCount: 0, winsCount: 0 },

  // 3. DOGE
  { id: 6,  coin: 'DOGE', tf: '1H',  side: 'DOWN', deltaTrigger: -1.00, score: 0.654, takeProfit: 0.92, stopLoss: 0.43, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 15, coin: 'DOGE', tf: '15M', side: 'UP',   deltaTrigger: 0.50,  score: 0.586, takeProfit: 0.85, stopLoss: 0.45, min5MFilter: 0.10, tradeCount: 0, winsCount: 0 },
  { id: 25, coin: 'DOGE', tf: '5M',  side: 'UP',   deltaTrigger: 0.25,  score: 0.602, takeProfit: 0.80, stopLoss: 0.46, min5MFilter: 0.25, tradeCount: 0, winsCount: 0 },
  { id: 26, coin: 'DOGE', tf: '5M',  side: 'DOWN', deltaTrigger: -0.25, score: 0.624, takeProfit: 0.80, stopLoss: 0.46, min5MFilter: -0.25, tradeCount: 0, winsCount: 0 },

  // 4. BNB
  { id: 7,  coin: 'BNB', tf: '1H',  side: 'UP',   deltaTrigger: 0.50,  score: 0.567, takeProfit: 0.85, stopLoss: 0.48, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 8,  coin: 'BNB', tf: '1H',  side: 'DOWN', deltaTrigger: -0.50, score: 0.583, takeProfit: 0.85, stopLoss: 0.48, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 18, coin: 'BNB', tf: '15M', side: 'DOWN', deltaTrigger: -0.30, score: 0.571, takeProfit: 0.78, stopLoss: 0.49, min5MFilter: -0.10, tradeCount: 0, winsCount: 0 },
  { id: 27, coin: 'BNB', tf: '5M',  side: 'UP',   deltaTrigger: 0.15,  score: 0.543, takeProfit: 0.72, stopLoss: 0.50, min5MFilter: 0.15, tradeCount: 0, winsCount: 0 },
  { id: 28, coin: 'BNB', tf: '5M',  side: 'DOWN', deltaTrigger: -0.15, score: 0.553, takeProfit: 0.72, stopLoss: 0.50, min5MFilter: -0.15, tradeCount: 0, winsCount: 0 },

  // 5. HYPE
  { id: 9,  coin: 'HYPE', tf: '1H',  side: 'UP',   deltaTrigger: 0.60,  score: 0.650, takeProfit: 0.88, stopLoss: 0.45, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 10, coin: 'HYPE', tf: '1H',  side: 'DOWN', deltaTrigger: -0.80, score: 0.658, takeProfit: 0.88, stopLoss: 0.45, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 20, coin: 'HYPE', tf: '15M', side: 'DOWN', deltaTrigger: -0.50, score: 0.644, takeProfit: 0.82, stopLoss: 0.46, min5MFilter: -0.10, tradeCount: 0, winsCount: 0 },
  { id: 30, coin: 'HYPE', tf: '5M',  side: 'DOWN', deltaTrigger: -0.30, score: 0.631, takeProfit: 0.80, stopLoss: 0.46, min5MFilter: -0.20, tradeCount: 0, winsCount: 0 }
];

export const CALIBRATED_RULES = APPROVED_V4_RULES;

export class HFTReactiveEngine {
  private signer: PolymarketFastSigner;
  private lastTriggerTimes: Map<string, number> = new Map();
  private cooldownMs: number = 30000;
  private minNetEdge: number = 0.04;

  constructor(private orderbook: LocalOrderbookManager) {
    this.signer = new PolymarketFastSigner();
    console.log('[HFTEngine] 🚀 Motor V4 inicializado con Llaves por Mercado (5M, 15M, 1H) y Escalamiento Dinamico de Balas.');
  }

  /**
   * 🎯 CALCULO DE TAMAÑO DE BALA SEGUN WIN RATE Y DISPAROS ACUMULADOS
   */
  public calculateBulletSize(rule: ApprovedRule): { amountUsdc: number; stageLabel: string } {
    const trades = rule.tradeCount || 0;
    const wins = rule.winsCount || 0;

    // Primeros 10 disparos: Calibración inicial a  USD
    if (trades < 10) {
      return { amountUsdc: 1.0, stageLabel: 'PRUEBA (1.0 USD)' };
    }

    const liveWR = wins / trades;

    if (liveWR >= 0.90) {
      return { amountUsdc: 20.0, stageLabel: 'ELITE 90%+ (20.0 USD)' };
    } else if (liveWR >= 0.85) {
      return { amountUsdc: 10.0, stageLabel: 'ALTO RENDIMIENTO 85%+ (10.0 USD)' };
    } else if (liveWR >= 0.80) {
      return { amountUsdc: 5.0, stageLabel: 'ESCALADO 80%+ (5.0 USD)' };
    } else if (liveWR >= 0.75) {
      return { amountUsdc: 2.0, stageLabel: 'ESCALADO 75%+ (2.0 USD)' };
    } else {
      return { amountUsdc: 1.0, stageLabel: 'BASE <75% (1.0 USD)' };
    }
  }

  public evaluateTick(coin: string): void {
    const delta1H = HFTSharedState.getDelta1H(coin);
    const delta15M = HFTSharedState.getDelta15M(coin);
    const delta5M = HFTSharedState.getDelta5M(coin);

    const rules = APPROVED_V4_RULES.filter(r => r.coin === coin);
    for (const rule of rules) {
      // 🎛️ CHEQUEO DE LLAVES DE MERCADO (5M, 15M, 1H)
      if (rule.tf === '5M' && !MARKET_FLAGS.ENABLE_5M) continue;
      if (rule.tf === '15M' && !MARKET_FLAGS.ENABLE_15M) continue;
      if (rule.tf === '1H' && !MARKET_FLAGS.ENABLE_1H) continue;

      let currentDelta = delta1H;
      if (rule.tf === '15M') currentDelta = delta15M;
      if (rule.tf === '5M') currentDelta = delta5M;

      this.checkRule(rule, currentDelta, delta5M);
    }
  }

  private checkRule(rule: ApprovedRule, currentDelta: number, delta5M: number): void {
    const coin = rule.coin;
    const now = Date.now();
    const key = coin + '_' + rule.tf + '_' + rule.side;

    if (now - (this.lastTriggerTimes.get(key) || 0) < this.cooldownMs) return;

    if (rule.side === 'UP' && currentDelta >= rule.deltaTrigger) {
      if (delta5M >= rule.min5MFilter) {
        const askUP = HFTSharedState.getPolyAsk(coin, 'UP');
        if (askUP > 0 && askUP <= 0.60) {
          const netEdge = rule.score - askUP;
          if (netEdge < this.minNetEdge) return;

          const bulletInfo = this.calculateBulletSize(rule);
          rule.tradeCount = (rule.tradeCount || 0) + 1;

          this.lastTriggerTimes.set(key, now);
          console.log('[HFTEngine] ⚡ DISPARO FOK (BALA ' + bulletInfo.stageLabel + '): ' + coin + ' ' + rule.tf + ' UP | Delta: ' + currentDelta.toFixed(2) + '% | Score: ' + (rule.score*100).toFixed(1) + '% | Ask: $' + askUP.toFixed(3) + ' | Net Edge: +' + (netEdge*100).toFixed(1) + '% | Bala: $' + bulletInfo.amountUsdc + ' USDC');
          
          this.signer.executeFOKOrder({
            coin,
            side: 'BUY',
            price: askUP,
            amountUsdc: bulletInfo.amountUsdc,
            tokenId: 'TOKEN_' + coin + '_UP'
          });
        }
      }
    } else if (rule.side === 'DOWN' && currentDelta <= rule.deltaTrigger) {
      if (delta5M <= rule.min5MFilter) {
        const askDOWN = HFTSharedState.getPolyAsk(coin, 'DOWN');
        if (askDOWN > 0 && askDOWN <= 0.60) {
          const netEdge = rule.score - askDOWN;
          if (netEdge < this.minNetEdge) return;

          const bulletInfo = this.calculateBulletSize(rule);
          rule.tradeCount = (rule.tradeCount || 0) + 1;

          this.lastTriggerTimes.set(key, now);
          console.log('[HFTEngine] ⚡ DISPARO FOK (BALA ' + bulletInfo.stageLabel + '): ' + coin + ' ' + rule.tf + ' DOWN | Delta: ' + currentDelta.toFixed(2) + '% | Score: ' + (rule.score*100).toFixed(1) + '% | Ask: $' + askDOWN.toFixed(3) + ' | Net Edge: +' + (netEdge*100).toFixed(1) + '% | Bala: $' + bulletInfo.amountUsdc + ' USDC');
          
          this.signer.executeFOKOrder({
            coin,
            side: 'BUY',
            price: askDOWN,
            amountUsdc: bulletInfo.amountUsdc,
            tokenId: 'TOKEN_' + coin + '_DOWN'
          });
        }
      }
    }
  }
}
