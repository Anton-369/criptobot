import { HFTSharedState } from './HFTSharedState';
import { PolymarketFastSigner } from './PolymarketFastSigner';
import { LocalOrderbookManager } from './LocalOrderbook';
import sqlite3 from 'sqlite3';
import path from 'path';

export interface ApprovedRule {
  id: number;
  coin: string;
  tf: '1H' | '15M' | '5M';
  side: 'UP' | 'DOWN';
  deltaTrigger: number;
  score: number;
  takeProfit: number;
  stopLoss: number;
  minAsk: number;
  maxAsk: number;
  min5MFilter: number;
  tradeCount?: number;
  winsCount?: number;
}

export const MARKET_FLAGS = {
  ENABLE_5M: true,
  ENABLE_15M: true,
  ENABLE_1H: true
};

export const APPROVED_V4_RULES: ApprovedRule[] = [
  // === 1. SOLANA (SOL) ===
  { id: 1,  coin: 'SOL', tf: '1H',  side: 'UP',   deltaTrigger: 0.80,  score: 0.596, takeProfit: 0.90, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 2,  coin: 'SOL', tf: '1H',  side: 'DOWN', deltaTrigger: -0.80, score: 0.614, takeProfit: 0.90, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 11, coin: 'SOL', tf: '15M', side: 'UP',   deltaTrigger: 0.40,  score: 0.561, takeProfit: 0.82, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 12, coin: 'SOL', tf: '15M', side: 'DOWN', deltaTrigger: -0.40, score: 0.604, takeProfit: 0.82, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 21, coin: 'SOL', tf: '5M',  side: 'UP',   deltaTrigger: 0.20,  score: 0.556, takeProfit: 0.78, stopLoss: 0.47, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 22, coin: 'SOL', tf: '5M',  side: 'DOWN', deltaTrigger: -0.20, score: 0.617, takeProfit: 0.78, stopLoss: 0.47, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },

  // === 2. RIPPLE (XRP) ===
  { id: 3,  coin: 'XRP', tf: '1H',  side: 'UP',   deltaTrigger: 0.60,  score: 0.567, takeProfit: 0.88, stopLoss: 0.47, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 4,  coin: 'XRP', tf: '1H',  side: 'DOWN', deltaTrigger: -0.60, score: 0.576, takeProfit: 0.88, stopLoss: 0.47, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 13, coin: 'XRP', tf: '15M', side: 'UP',   deltaTrigger: 0.35,  score: 0.573, takeProfit: 0.80, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 14, coin: 'XRP', tf: '15M', side: 'DOWN', deltaTrigger: -0.35, score: 0.564, takeProfit: 0.80, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 23, coin: 'XRP', tf: '5M',  side: 'UP',   deltaTrigger: 0.18,  score: 0.557, takeProfit: 0.75, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 24, coin: 'XRP', tf: '5M',  side: 'DOWN', deltaTrigger: -0.18, score: 0.561, takeProfit: 0.75, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },

  // === 3. DOGECOIN (DOGE) ===
  { id: 6,  coin: 'DOGE', tf: '1H',  side: 'DOWN', deltaTrigger: -1.00, score: 0.654, takeProfit: 0.92, stopLoss: 0.43, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 15, coin: 'DOGE', tf: '15M', side: 'UP',   deltaTrigger: 0.50,  score: 0.586, takeProfit: 0.85, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 25, coin: 'DOGE', tf: '5M',  side: 'UP',   deltaTrigger: 0.25,  score: 0.602, takeProfit: 0.80, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 26, coin: 'DOGE', tf: '5M',  side: 'DOWN', deltaTrigger: -0.25, score: 0.624, takeProfit: 0.80, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },

  // === 4. BINANCE COIN (BNB) ===
  { id: 7,  coin: 'BNB', tf: '1H',  side: 'UP',   deltaTrigger: 0.50,  score: 0.567, takeProfit: 0.85, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 8,  coin: 'BNB', tf: '1H',  side: 'DOWN', deltaTrigger: -0.50, score: 0.583, takeProfit: 0.85, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 18, coin: 'BNB', tf: '15M', side: 'DOWN', deltaTrigger: -0.30, score: 0.571, takeProfit: 0.78, stopLoss: 0.49, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 27, coin: 'BNB', tf: '5M',  side: 'UP',   deltaTrigger: 0.15,  score: 0.543, takeProfit: 0.72, stopLoss: 0.50, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 28, coin: 'BNB', tf: '5M',  side: 'DOWN', deltaTrigger: -0.15, score: 0.553, takeProfit: 0.72, stopLoss: 0.50, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },

  // === 5. HYPERLIQUID (HYPE) ===
  { id: 9,  coin: 'HYPE', tf: '1H',  side: 'UP',   deltaTrigger: 0.60,  score: 0.650, takeProfit: 0.88, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 10, coin: 'HYPE', tf: '1H',  side: 'DOWN', deltaTrigger: -0.80, score: 0.658, takeProfit: 0.88, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 20, coin: 'HYPE', tf: '15M', side: 'DOWN', deltaTrigger: -0.50, score: 0.644, takeProfit: 0.82, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 30, coin: 'HYPE', tf: '5M',  side: 'DOWN', deltaTrigger: -0.30, score: 0.631, takeProfit: 0.80, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 }
];

export class HFTReactiveEngine {
  private signer: PolymarketFastSigner;
  private db: sqlite3.Database;
  private cooldownMs = 60000; // 1 min cooldown per rule
  private lastTriggerTimes: Map<string, number> = new Map();
  private lastDebugLog: number = 0;

  constructor(private orderbook: LocalOrderbookManager) {
    this.signer = new PolymarketFastSigner();
    
    const dbPath = path.resolve(process.cwd(), 'data', 'criptobot_v4.sqlite');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) console.error('[HFTEngine] ❌ Error conectando a SQLite V4:', err.message);
      else this.initDbSchema();
    });
  }

  private initDbSchema(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS v4_disparos_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp_et TEXT,
        coin TEXT,
        timeframe TEXT,
        side TEXT,
        delta_trigger REAL,
        score REAL,
        price_entry REAL,
        bullet_size REAL,
        status TEXT
      )
    `;
    this.db.run(sql, (err) => {
      if (!err) console.log('[HFTEngine] 🗄️ Tabla v4_disparos_log en SQLite verificada.');
    });
  }

  public evaluateTick(coin: string): void {
    const delta1H = HFTSharedState.getDelta1H(coin);
    const delta15M = HFTSharedState.getDelta15M(coin);
    const delta5M = HFTSharedState.getDelta5M(coin);

    const now = Date.now();
    if (coin === 'HYPE' && now - this.lastDebugLog > 10000) {
      this.lastDebugLog = now;
      console.log('[HFTEngine V4 Live] 📊 HYPE Spot: $' + HFTSharedState.getSpotPrice('HYPE').toFixed(2) + ' | Delta1H: ' + delta1H.toFixed(2) + '% | Delta15M: ' + delta15M.toFixed(2) + '% | Delta5M: ' + delta5M.toFixed(2) + '% | AskDOWN: $' + HFTSharedState.getPolyAsk('HYPE', 'DOWN', '15M').toFixed(3));
    }

    const rules = APPROVED_V4_RULES.filter(r => r.coin === coin);
    for (const rule of rules) {
      if (rule.tf === '5M' && !MARKET_FLAGS.ENABLE_5M) continue;
      if (rule.tf === '15M' && !MARKET_FLAGS.ENABLE_15M) continue;
      if (rule.tf === '1H' && !MARKET_FLAGS.ENABLE_1H) continue;

      let currentDelta = delta1H;
      if (rule.tf === '15M') currentDelta = delta15M;
      if (rule.tf === '5M') currentDelta = delta5M;

      this.checkRule(rule, currentDelta);
    }
  }

  private checkRule(rule: ApprovedRule, currentDelta: number): void {
    const coin = rule.coin;
    const now = Date.now();
    const key = coin + '_' + rule.tf + '_' + rule.side;

    if (now - (this.lastTriggerTimes.get(key) || 0) < this.cooldownMs) return;

    if (rule.side === 'UP' && currentDelta >= rule.deltaTrigger) {
      const realTokenId = this.orderbook.getRealTokenId(coin, 'UP', rule.tf);
      const orderbookAsk = realTokenId ? this.orderbook.getBestAsk(realTokenId) : 0;
      const sharedAsk = HFTSharedState.getPolyAsk(coin, 'UP', rule.tf);
      const effectivePrice = orderbookAsk > 0 ? orderbookAsk : (sharedAsk > 0 ? sharedAsk : 0.54);
      
      if (effectivePrice >= rule.minAsk && effectivePrice <= rule.maxAsk) {
        const bulletInfo = this.calculateBulletSize(rule);
        rule.tradeCount = (rule.tradeCount || 0) + 1;
        this.lastTriggerTimes.set(key, now);

        console.log('[HFTEngine] ⚡ DISPARO FOK UP: ' + coin + ' ' + rule.tf + ' UP | Delta: ' + currentDelta.toFixed(2) + '% | Price: $' + effectivePrice.toFixed(3) + ' (Rango: $' + rule.minAsk + '-$' + rule.maxAsk + ') | Bala: $' + bulletInfo.amountUsdc);
        
        this.saveTriggerToDb(coin, rule.tf, 'UP', currentDelta, rule.score, effectivePrice, bulletInfo.amountUsdc);

        this.signer.executeFOKOrder({
          coin,
          side: 'BUY',
          price: effectivePrice,
          amountUsdc: bulletInfo.amountUsdc,
          tokenId: this.orderbook.getRealTokenId(coin, 'UP', rule.tf) || ('TOKEN_' + coin + '_UP')
        });
      }
    } else if (rule.side === 'DOWN' && currentDelta <= rule.deltaTrigger) {
      const realTokenId = this.orderbook.getRealTokenId(coin, 'DOWN', rule.tf);
      const orderbookAsk = realTokenId ? this.orderbook.getBestAsk(realTokenId) : 0;
      const sharedAsk = HFTSharedState.getPolyAsk(coin, 'DOWN', rule.tf);
      const effectivePrice = orderbookAsk > 0 ? orderbookAsk : (sharedAsk > 0 ? sharedAsk : 0.54);

      if (effectivePrice >= rule.minAsk && effectivePrice <= rule.maxAsk) {
        const bulletInfo = this.calculateBulletSize(rule);
        rule.tradeCount = (rule.tradeCount || 0) + 1;
        this.lastTriggerTimes.set(key, now);

        console.log('[HFTEngine] ⚡ DISPARO FOK DOWN: ' + coin + ' ' + rule.tf + ' DOWN | Delta: ' + currentDelta.toFixed(2) + '% | Price: $' + effectivePrice.toFixed(3) + ' (Rango: $' + rule.minAsk + '-$' + rule.maxAsk + ') | Bala: $' + bulletInfo.amountUsdc);
        
        this.saveTriggerToDb(coin, rule.tf, 'DOWN', currentDelta, rule.score, effectivePrice, bulletInfo.amountUsdc);

        this.signer.executeFOKOrder({
          coin,
          side: 'BUY',
          price: effectivePrice,
          amountUsdc: bulletInfo.amountUsdc,
          tokenId: this.orderbook.getRealTokenId(coin, 'DOWN', rule.tf) || ('TOKEN_' + coin + '_DOWN')
        });
      }
    }
  }

  private calculateBulletSize(rule: ApprovedRule): { amountUsdc: number } {
    return { amountUsdc: 1.00 }; // Fixed $1.00 bullet size per user requirement
  }

  private saveTriggerToDb(coin: string, tf: string, side: string, deltaTrigger: number, score: number, priceEntry: number, bulletSize: number): void {
    const timestampEt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const sql = `
      INSERT INTO v4_disparos_log (timestamp_et, coin, timeframe, side, delta_trigger, score, price_entry, bullet_size, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    this.db.run(sql, [timestampEt, coin, tf, side, deltaTrigger, score, priceEntry, bulletSize, 'EXECUTED_FOK'], (err) => {
      if (err) console.error('[HFTEngine] ❌ Error guardando disparo en SQLite:', err.message);
    });
  }
}

export const CALIBRATED_RULES = APPROVED_V4_RULES;
