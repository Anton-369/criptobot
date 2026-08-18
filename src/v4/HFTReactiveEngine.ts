import { HFTSharedState } from './HFTSharedState';
import { PolymarketFastSigner } from './PolymarketFastSigner';
import { LocalOrderbookManager } from './LocalOrderbook';

export interface ApprovedRule {
  id: number;
  coin: string;
  tf: '1H' | '15M' | '5M';
  side: 'UP' | 'DOWN';
  deltaTrigger: number;
  score: number;        // Probabilidad Win Rate Out-of-Sample (Score)
  takeProfit: number;   // Escalado por volatilidad
  stopLoss: number;     // Escalado por volatilidad
  min5MFilter: number;  // Filtro de aceleracion 5M
}

/**
 * 🏆 LAS 12 REGLAS DE ORO RE-AUDITADAS CON CRITERIO UNIFORME DE UNA COLA (Z >= 1.645, N >= 30)
 */
export const APPROVED_V4_RULES: ApprovedRule[] = [
  // 1. SOL
  { id: 1,  coin: 'SOL', tf: '1H',  side: 'UP',   deltaTrigger: 0.80,  score: 0.596, takeProfit: 0.90, stopLoss: 0.45, min5MFilter: 0.00 },
  { id: 2,  coin: 'SOL', tf: '1H',  side: 'DOWN', deltaTrigger: -0.80, score: 0.614, takeProfit: 0.90, stopLoss: 0.45, min5MFilter: 0.00 },
  { id: 12, coin: 'SOL', tf: '15M', side: 'DOWN', deltaTrigger: -0.40, score: 0.588, takeProfit: 0.90, stopLoss: 0.45, min5MFilter: -0.10 },
  { id: 22, coin: 'SOL', tf: '5M',  side: 'DOWN', deltaTrigger: -0.20, score: 0.590, takeProfit: 0.90, stopLoss: 0.45, min5MFilter: -0.20 },

  // 2. XRP
  { id: 3,  coin: 'XRP', tf: '1H',  side: 'UP',   deltaTrigger: 0.60,  score: 0.567, takeProfit: 0.88, stopLoss: 0.47, min5MFilter: 0.00 },
  { id: 4,  coin: 'XRP', tf: '1H',  side: 'DOWN', deltaTrigger: -0.60, score: 0.576, takeProfit: 0.88, stopLoss: 0.47, min5MFilter: 0.00 },

  // 3. DOGE
  { id: 6,  coin: 'DOGE', tf: '1H',  side: 'DOWN', deltaTrigger: -1.00, score: 0.654, takeProfit: 0.92, stopLoss: 0.43, min5MFilter: 0.00 },
  { id: 15, coin: 'DOGE', tf: '15M', side: 'UP',   deltaTrigger: 0.50,  score: 0.571, takeProfit: 0.92, stopLoss: 0.43, min5MFilter: 0.10 },
  { id: 25, coin: 'DOGE', tf: '5M',  side: 'UP',   deltaTrigger: 0.25,  score: 0.583, takeProfit: 0.92, stopLoss: 0.43, min5MFilter: 0.25 },
  { id: 26, coin: 'DOGE', tf: '5M',  side: 'DOWN', deltaTrigger: -0.25, score: 0.600, takeProfit: 0.92, stopLoss: 0.43, min5MFilter: -0.25 },

  // 4. BNB
  { id: 7,  coin: 'BNB', tf: '1H',  side: 'UP',   deltaTrigger: 0.50,  score: 0.567, takeProfit: 0.85, stopLoss: 0.48, min5MFilter: 0.00 },
  { id: 8,  coin: 'BNB', tf: '1H',  side: 'DOWN', deltaTrigger: -0.50, score: 0.583, takeProfit: 0.85, stopLoss: 0.48, min5MFilter: 0.00 }
];

export const CALIBRATED_RULES = APPROVED_V4_RULES;

export class HFTReactiveEngine {
  private signer: PolymarketFastSigner;
  private lastTriggerTimes: Map<string, number> = new Map();
  private cooldownMs: number = 30000;
  private minNetEdge: number = 0.04; // Filtro de Edge Real Minimo (Score - Price >= 4.0%)

  constructor(private orderbook: LocalOrderbookManager) {
    this.signer = new PolymarketFastSigner();
    console.log('[HFTEngine] 🚀 Motor V4 inicializado con 12 Reglas de Oro y Filtro de Edge Real (Score - Price >= 0.04).');
  }

  public evaluateTick(coin: string): void {
    const delta1H = HFTSharedState.getDelta1H(coin);
    const delta15M = HFTSharedState.getDelta15M(coin);
    const delta5M = HFTSharedState.getDelta5M(coin);

    const rules = APPROVED_V4_RULES.filter(r => r.coin === coin);
    for (const rule of rules) {
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
          // 🎯 FILTRO 2: EDGE REAL (Score - Precio Pagado >= 0.04)
          const netEdge = rule.score - askUP;
          if (netEdge < this.minNetEdge) {
            // Edge insuficiente frente al ask de Polymarket
            return;
          }

          this.lastTriggerTimes.set(key, now);
          console.log('[HFTEngine] ⚡ DISPARO FOK (EDGE VALIDAD0): ' + coin + ' ' + rule.tf + ' UP | Delta: ' + currentDelta.toFixed(2) + '% | Score: ' + (rule.score*100).toFixed(1) + '% | Ask: $' + askUP.toFixed(3) + ' | Net Edge: +' + (netEdge*100).toFixed(1) + '% | TP: $' + rule.takeProfit + ' | SL: $' + rule.stopLoss);
          
          this.signer.executeFOKOrder({
            coin,
            side: 'BUY',
            price: askUP,
            amountUsdc: 1.0,
            tokenId: 'TOKEN_' + coin + '_UP'
          });
        }
      }
    } else if (rule.side === 'DOWN' && currentDelta <= rule.deltaTrigger) {
      if (delta5M <= rule.min5MFilter) {
        const askDOWN = HFTSharedState.getPolyAsk(coin, 'DOWN');
        if (askDOWN > 0 && askDOWN <= 0.60) {
          // 🎯 FILTRO 2: EDGE REAL (Score - Precio Pagado >= 0.04)
          const netEdge = rule.score - askDOWN;
          if (netEdge < this.minNetEdge) {
            // Edge insuficiente frente al ask de Polymarket
            return;
          }

          this.lastTriggerTimes.set(key, now);
          console.log('[HFTEngine] ⚡ DISPARO FOK (EDGE VALIDAD0): ' + coin + ' ' + rule.tf + ' DOWN | Delta: ' + currentDelta.toFixed(2) + '% | Score: ' + (rule.score*100).toFixed(1) + '% | Ask: $' + askDOWN.toFixed(3) + ' | Net Edge: +' + (netEdge*100).toFixed(1) + '% | TP: $' + rule.takeProfit + ' | SL: $' + rule.stopLoss);
          
          this.signer.executeFOKOrder({
            coin,
            side: 'BUY',
            price: askDOWN,
            amountUsdc: 1.0,
            tokenId: 'TOKEN_' + coin + '_DOWN'
          });
        }
      }
    }
  }
}
