import { HFTSharedState } from './HFTSharedState';
import { PolymarketFastSigner } from './PolymarketFastSigner';
import { LocalOrderbookManager } from './LocalOrderbook';

export interface ApprovedRule {
  coin: string;
  tf: '1H' | '15M' | '5M';
  side: 'UP' | 'DOWN';
  deltaTrigger: number;
  takeProfit: number;
  stopLoss: number;
  min5MFilter: number;
}

export const APPROVED_V4_RULES: ApprovedRule[] = [
  // 1. SOL
  { coin: 'SOL', tf: '1H',  side: 'UP',   deltaTrigger: 0.80,  takeProfit: 0.90, stopLoss: 0.45, min5MFilter: 0.00 },
  { coin: 'SOL', tf: '1H',  side: 'DOWN', deltaTrigger: -0.80, takeProfit: 0.90, stopLoss: 0.45, min5MFilter: 0.00 },
  { coin: 'SOL', tf: '15M', side: 'DOWN', deltaTrigger: -0.40, takeProfit: 0.90, stopLoss: 0.45, min5MFilter: -0.10 },
  { coin: 'SOL', tf: '5M',  side: 'DOWN', deltaTrigger: -0.20, takeProfit: 0.90, stopLoss: 0.45, min5MFilter: -0.20 },

  // 2. XRP
  { coin: 'XRP', tf: '1H',  side: 'UP',   deltaTrigger: 0.60,  takeProfit: 0.88, stopLoss: 0.47, min5MFilter: 0.00 },
  { coin: 'XRP', tf: '1H',  side: 'DOWN', deltaTrigger: -0.60, takeProfit: 0.88, stopLoss: 0.47, min5MFilter: 0.00 },

  // 3. DOGE
  { coin: 'DOGE', tf: '1H',  side: 'UP',   deltaTrigger: 1.00,  takeProfit: 0.92, stopLoss: 0.43, min5MFilter: 0.00 },
  { coin: 'DOGE', tf: '1H',  side: 'DOWN', deltaTrigger: -1.00, takeProfit: 0.92, stopLoss: 0.43, min5MFilter: 0.00 },
  { coin: 'DOGE', tf: '15M', side: 'UP',   deltaTrigger: 0.50,  takeProfit: 0.92, stopLoss: 0.43, min5MFilter: 0.10 },
  { coin: 'DOGE', tf: '5M',  side: 'UP',   deltaTrigger: 0.25,  takeProfit: 0.92, stopLoss: 0.43, min5MFilter: 0.25 },
  { coin: 'DOGE', tf: '5M',  side: 'DOWN', deltaTrigger: -0.25, takeProfit: 0.92, stopLoss: 0.43, min5MFilter: -0.25 },

  // 4. BNB
  { coin: 'BNB', tf: '1H',  side: 'UP',   deltaTrigger: 0.50,  takeProfit: 0.85, stopLoss: 0.48, min5MFilter: 0.00 },
  { coin: 'BNB', tf: '1H',  side: 'DOWN', deltaTrigger: -0.50, takeProfit: 0.85, stopLoss: 0.48, min5MFilter: 0.00 }
];

export const CALIBRATED_RULES = APPROVED_V4_RULES;

export class HFTReactiveEngine {
  private signer: PolymarketFastSigner;
  private lastTriggerTimes: Map<string, number> = new Map();
  private cooldownMs: number = 30000;

  constructor(private orderbook: LocalOrderbookManager) {
    this.signer = new PolymarketFastSigner();
    console.log('[HFTEngine] 🚀 Motor V4 inicializado exclusivamente con las 13 REGLAS AUDITADAS APROBADAS.');
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
          this.lastTriggerTimes.set(key, now);
          console.log('[HFTEngine] ⚡ SEÑAL REGISTRADA: ' + coin + ' ' + rule.tf + ' UP (Delta: ' + currentDelta.toFixed(2) + '%) | TP: $' + rule.takeProfit + ' | SL: $' + rule.stopLoss);
          
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
          this.lastTriggerTimes.set(key, now);
          console.log('[HFTEngine] ⚡ SEÑAL REGISTRADA: ' + coin + ' ' + rule.tf + ' DOWN (Delta: ' + currentDelta.toFixed(2) + '%) | TP: $' + rule.takeProfit + ' | SL: $' + rule.stopLoss);
          
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
