/**
 * ⚡ HYBRID HFT REACTIVE ENGINE V4 (CON TP/SL Y GESTIÓN DE POSICIONES EN TIEMPO REAL)
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { PolymarketFastSigner } from './PolymarketFastSigner';
import { LocalOrderbookManager } from './LocalOrderbook';
import { HFTSharedState } from './HFTSharedState';

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

export interface OpenPosition {
  id?: number;
  ruleId: number;
  coin: string;
  tf: '1H' | '15M' | '5M';
  side: 'UP' | 'DOWN';
  priceEntry: number;
  entrySpotPrice?: number;
  takeProfit: number;
  stopLoss: number;
  bulletSize: number;
  tokenId: string;
  openedAt: number;
  status: 'OPEN' | 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_EXPIRED';
}

export const MARKET_FLAGS = {
  ENABLE_5M: true,
  ENABLE_15M: true,
  ENABLE_1H: true,
};

export const APPROVED_V4_RULES: ApprovedRule[] = [
  // === 1. SOLANA (SOL) ===
  { id: 1,  coin: 'SOL', tf: '1H',  side: 'UP',   deltaTrigger: 0.80,  score: 0.596, takeProfit: 0.90, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 2,  coin: 'SOL', tf: '1H',  side: 'DOWN', deltaTrigger: -0.80, score: 0.614, takeProfit: 0.90, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 11, coin: 'SOL', tf: '15M', side: 'UP',   deltaTrigger: 0.28,  score: 0.561, takeProfit: 0.82, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 12, coin: 'SOL', tf: '15M', side: 'DOWN', deltaTrigger: -0.40, score: 0.604, takeProfit: 0.82, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 21, coin: 'SOL', tf: '5M',  side: 'UP',   deltaTrigger: 0.20,  score: 0.556, takeProfit: 0.78, stopLoss: 0.47, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 22, coin: 'SOL', tf: '5M',  side: 'DOWN', deltaTrigger: -0.25, score: 0.617, takeProfit: 0.78, stopLoss: 0.47, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },

  // === 2. RIPPLE (XRP) ===
  { id: 3,  coin: 'XRP', tf: '1H',  side: 'UP',   deltaTrigger: 0.60,  score: 0.567, takeProfit: 0.88, stopLoss: 0.47, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 4,  coin: 'XRP', tf: '1H',  side: 'DOWN', deltaTrigger: -0.60, score: 0.576, takeProfit: 0.88, stopLoss: 0.47, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 13, coin: 'XRP', tf: '15M', side: 'UP',   deltaTrigger: 0.35,  score: 0.573, takeProfit: 0.80, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 14, coin: 'XRP', tf: '15M', side: 'DOWN', deltaTrigger: -0.25, score: 0.564, takeProfit: 0.80, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 23, coin: 'XRP', tf: '5M',  side: 'UP',   deltaTrigger: 0.20,  score: 0.557, takeProfit: 0.75, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 24, coin: 'XRP', tf: '5M',  side: 'DOWN', deltaTrigger: -0.22, score: 0.561, takeProfit: 0.75, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },

  // === 3. DOGECOIN (DOGE) ===
  { id: 5,  coin: 'DOGE', tf: '1H',  side: 'UP',   deltaTrigger: 1.00,  score: 0.580, takeProfit: 0.90, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 6,  coin: 'DOGE', tf: '1H',  side: 'DOWN', deltaTrigger: -1.00, score: 0.654, takeProfit: 0.92, stopLoss: 0.43, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 15, coin: 'DOGE', tf: '15M', side: 'UP',   deltaTrigger: 0.50,  score: 0.586, takeProfit: 0.85, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 16, coin: 'DOGE', tf: '15M', side: 'DOWN', deltaTrigger: -0.50, score: 0.610, takeProfit: 0.85, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 25, coin: 'DOGE', tf: '5M',  side: 'UP',   deltaTrigger: 0.22,  score: 0.602, takeProfit: 0.80, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 26, coin: 'DOGE', tf: '5M',  side: 'DOWN', deltaTrigger: -0.28, score: 0.624, takeProfit: 0.80, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },

  // === 4. BINANCE COIN (BNB) ===
  { id: 7,  coin: 'BNB', tf: '1H',  side: 'UP',   deltaTrigger: 0.50,  score: 0.567, takeProfit: 0.85, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 8,  coin: 'BNB', tf: '1H',  side: 'DOWN', deltaTrigger: -0.50, score: 0.583, takeProfit: 0.85, stopLoss: 0.48, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 17, coin: 'BNB', tf: '15M', side: 'UP',   deltaTrigger: 0.30,  score: 0.560, takeProfit: 0.78, stopLoss: 0.49, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 18, coin: 'BNB', tf: '15M', side: 'DOWN', deltaTrigger: -0.30, score: 0.571, takeProfit: 0.78, stopLoss: 0.49, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 27, coin: 'BNB', tf: '5M',  side: 'UP',   deltaTrigger: 0.18,  score: 0.543, takeProfit: 0.72, stopLoss: 0.50, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 28, coin: 'BNB', tf: '5M',  side: 'DOWN', deltaTrigger: -0.22, score: 0.553, takeProfit: 0.72, stopLoss: 0.50, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },

  // === 5. HYPERLIQUID (HYPE) ===
  { id: 9,  coin: 'HYPE', tf: '1H',  side: 'UP',   deltaTrigger: 0.60,  score: 0.650, takeProfit: 0.88, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 10, coin: 'HYPE', tf: '1H',  side: 'DOWN', deltaTrigger: -0.80, score: 0.658, takeProfit: 0.88, stopLoss: 0.45, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 19, coin: 'HYPE', tf: '15M', side: 'UP',   deltaTrigger: 0.40,  score: 0.630, takeProfit: 0.82, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 20, coin: 'HYPE', tf: '15M', side: 'DOWN', deltaTrigger: -0.45, score: 0.644, takeProfit: 0.82, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 29, coin: 'HYPE', tf: '5M',  side: 'UP',   deltaTrigger: 0.25,  score: 0.620, takeProfit: 0.80, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 },
  { id: 30, coin: 'HYPE', tf: '5M',  side: 'DOWN', deltaTrigger: -0.32, score: 0.631, takeProfit: 0.80, stopLoss: 0.46, minAsk: 0.50, maxAsk: 0.65, min5MFilter: 0.00, tradeCount: 0, winsCount: 0 }
];

export class HFTReactiveEngine {
  private signer: PolymarketFastSigner;
  private db: sqlite3.Database;
  private cooldownMs = 60000; // 1 min cooldown per rule
  private lastTriggerTimes: Map<string, number> = new Map();
  private activePositions: Map<string, OpenPosition> = new Map();
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
    const sqlLog = 'CREATE TABLE IF NOT EXISTS v4_disparos_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp_et TEXT, coin TEXT, timeframe TEXT, side TEXT, delta_trigger REAL, score REAL, price_entry REAL, bullet_size REAL, status TEXT)';
    const sqlPositions = 'CREATE TABLE IF NOT EXISTS v4_positions (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id INTEGER, coin TEXT, timeframe TEXT, side TEXT, price_entry REAL, price_exit REAL, take_profit REAL, stop_loss REAL, bullet_size REAL, token_id TEXT, opened_at TEXT, closed_at TEXT, status TEXT)';
    this.db.run(sqlLog);
    this.db.run(sqlPositions, (err) => {
      if (!err) console.log('[HFTEngine] 🗄️ Tablas v4_disparos_log y v4_positions en SQLite verificadas.');
    });
  }

  public evaluateTick(coin: string): void {
    const delta1H = HFTSharedState.getDelta1H(coin);
    const delta15M = HFTSharedState.getDelta15M(coin);
    const delta5M = HFTSharedState.getDelta5M(coin);

    const now = Date.now();
    if (coin === 'HYPE' && now - this.lastDebugLog > 10000) {
      this.lastDebugLog = now;
      console.log('[HFTEngine V4 Live] 📊 HYPE Spot: $' + HFTSharedState.getSpotPrice('HYPE').toFixed(2) + ' | Delta1H: ' + delta1H.toFixed(2) + '% | Delta15M: ' + delta15M.toFixed(2) + '% | Delta5M: ' + delta5M.toFixed(2) + '% | AskDOWN: $' + HFTSharedState.getPolyAsk('HYPE', 'DOWN', '15M').toFixed(3) + ' | PosicionesActivas: ' + this.activePositions.size);
    }

    // Monitor TP/SL for all active positions of this coin
    this.monitorActivePositions(coin);

    const rules = APPROVED_V4_RULES.filter(r => r.coin === coin);
    for (const rule of rules) {
      if (rule.tf === '5M' && !MARKET_FLAGS.ENABLE_5M) continue;
      if (rule.tf === '15M' && !MARKET_FLAGS.ENABLE_15M) continue;
      if (rule.tf === '1H' && !MARKET_FLAGS.ENABLE_1H) continue;

      let currentDelta = delta1H;
      if (rule.tf === '15M') currentDelta = delta15M;
      if (rule.tf === '5M') currentDelta = delta5M;

      if (!this.isWithinSafeExecutionWindow(rule.tf)) continue;
      this.checkRule(rule, currentDelta);
    }
  }

  private monitorActivePositions(coin: string): void {
    const now = Date.now();
    const currentSpot = HFTSharedState.getSpotPrice(coin);

    for (const [key, pos] of Array.from(this.activePositions.entries())) {
      if (pos.coin !== coin) continue;

      const ageMs = now - pos.openedAt;

      // Determine current best bid for exit
      const realTokenId = pos.tokenId;
      const orderbookBid = realTokenId ? this.orderbook.getBestBid(realTokenId) : 0;
      const sharedBid = HFTSharedState.getPolyBid(pos.coin, pos.side, pos.tf);
      const currentBid = orderbookBid > 0 ? orderbookBid : (sharedBid > 0 ? sharedBid : 0);

      // Calculate spot delta from entry spot
      let spotDeltaPct = 0;
      if (pos.entrySpotPrice && pos.entrySpotPrice > 0 && currentSpot > 0) {
        spotDeltaPct = ((currentSpot - pos.entrySpotPrice) / pos.entrySpotPrice) * 100;
        if (pos.side === 'DOWN') {
          spotDeltaPct = -spotDeltaPct; // Favorable if DOWN and spot decreased
        }
      }

      // 🎯 1. CHECK TAKE PROFIT (Bid Poly >= 0.75 o Movimiento Spot Binance >= +0.30%)
      if (currentBid >= pos.takeProfit || (spotDeltaPct >= 0.30 && currentBid >= 0.65)) {
        const exitPrice = currentBid >= pos.takeProfit ? currentBid : Math.max(currentBid, pos.takeProfit);
        console.log('[HFTEngine] 🎯 TAKE PROFIT ALCANZADO: ' + pos.coin + ' ' + pos.tf + ' ' + pos.side + ' | Entry: $' + pos.priceEntry.toFixed(3) + ' -> Exit: $' + exitPrice.toFixed(3) + ' (Spot Delta: ' + spotDeltaPct.toFixed(2) + '%)');
        this.closePosition(key, pos, exitPrice, 'CLOSED_TP');
        continue;
      }

      // 🛑 2. CHECK STOP LOSS (INVALIDACIÓN PURA POR PRECIO SPOT EN BINANCE <= -0.40%)
      // Se elimina el Stop Loss por Bid de Polymarket para evitar barridos por falta de liquidez
      if (ageMs >= 15000 && spotDeltaPct <= -0.40) {
        const exitPrice = currentBid > 0 ? currentBid : pos.stopLoss;
        console.log('[HFTEngine] 🛑 STOP LOSS POR INVALIDACIÓN SPOT BINANCE: ' + pos.coin + ' ' + pos.tf + ' ' + pos.side + ' | Entry: $' + pos.priceEntry.toFixed(3) + ' -> Exit: $' + exitPrice.toFixed(3) + ' (Spot Delta: ' + spotDeltaPct.toFixed(2) + '%, Age: ' + Math.round(ageMs/1000) + 's)');
        this.closePosition(key, pos, exitPrice, 'CLOSED_SL');
        continue;
      }

      // ⏱️ 3. CHECK CYCLE EXPIRY / SETTLEMENT AL VENCIMIENTO (5M = 5m, 15M = 15m, 1H = 60m)
      const maxAgeMs = pos.tf === '5M' ? 5 * 60000 : (pos.tf === '15M' ? 15 * 60000 : 60 * 60000);
      if (ageMs > maxAgeMs) {
        const isWinAtExpiry = spotDeltaPct >= 0 || currentBid >= 0.50;
        const exitPrice = isWinAtExpiry ? 1.00 : 0.00;
        const finalStatus = isWinAtExpiry ? 'CLOSED_TP' : 'CLOSED_EXPIRED';
        console.log('[HFTEngine] ⏱️ SETTLEMENT AL VENCIMIENTO ($1.00 WIN / $0.00 LOSS): ' + pos.coin + ' ' + pos.tf + ' ' + pos.side + ' | Spot Delta Final: ' + spotDeltaPct.toFixed(2) + '% | Resultado: ' + finalStatus + ' ($' + exitPrice.toFixed(2) + ')');
        this.closePosition(key, pos, exitPrice, finalStatus);
      }
    }
  }

  private closePosition(key: string, pos: OpenPosition, exitPrice: number, status: 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_EXPIRED'): void {
    this.activePositions.delete(key);

    // Execute Sell Order in Live/Shadow
    this.signer.executeFOKOrder({
      coin: pos.coin,
      side: 'SELL',
      price: exitPrice,
      amountUsdc: pos.bulletSize,
      tokenId: pos.tokenId
    });

    // Update DB
    const timestampEt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const sql = 'UPDATE v4_positions SET price_exit = ?, closed_at = ?, status = ? WHERE id = ?';
    if (pos.id) {
      this.db.run(sql, [exitPrice, timestampEt, status, pos.id]);
    }
  }

    public isWithinSafeExecutionWindow(tf: '1H' | '15M' | '5M'): boolean {
    const now = new Date();
    const min = now.getMinutes();
    const sec = now.getSeconds();

    if (tf === '5M') {
      const secInCycle = (min * 60 + sec) % 300;
      // Permitir solo entre segundo 30 y segundo 240 (Minuto 0.5 a 4.0 de la vela de 5M)
      return secInCycle >= 30 && secInCycle <= 240;
    } else if (tf === '15M') {
      const minInCycle = min % 15;
      // Permitir solo entre minuto 1 y minuto 10 de la vela de 15M (Bloquea min 00, 11, 12, 13, 14)
      return minInCycle >= 1 && minInCycle <= 10;
    } else if (tf === '1H') {
      // Permitir solo entre minuto 2 y minuto 45 de la vela de 1H (Bloquea min 46-59)
      return min >= 2 && min <= 45;
    }
    return true;
  }

  private checkRule(rule: ApprovedRule, currentDelta: number): void {
    const coin = rule.coin;
    const now = Date.now();
    const key = coin + '_' + rule.tf + '_' + rule.side;

    if (this.activePositions.has(key)) return; // Position already open for this rule
    if (now - (this.lastTriggerTimes.get(key) || 0) < this.cooldownMs) return;

    if ((rule.side === 'UP' && currentDelta >= rule.deltaTrigger) || (rule.side === 'DOWN' && currentDelta <= rule.deltaTrigger)) {
      const realTokenId = this.orderbook.getRealTokenId(coin, rule.side, rule.tf);
      const orderbookAsk = realTokenId ? this.orderbook.getBestAsk(realTokenId) : 0;
      const sharedAsk = HFTSharedState.getPolyAsk(coin, rule.side, rule.tf);
      const effectivePrice = orderbookAsk > 0 ? orderbookAsk : (sharedAsk > 0 ? sharedAsk : 0);
      if (effectivePrice <= 0) {
        return; // No disparar si el precio Ask real en RAM es 0 (Libro vacio o no registrado)
      }

      if (effectivePrice >= rule.minAsk && effectivePrice <= rule.maxAsk) {
        const bulletInfo = this.calculateBulletSize(rule);
        rule.tradeCount = (rule.tradeCount || 0) + 1;
        this.lastTriggerTimes.set(key, now);

        console.log('[HFTEngine] ⚡ DISPARO FOK ' + rule.side + ': ' + coin + ' ' + rule.tf + ' | Delta: ' + currentDelta.toFixed(2) + '% | Entry Price: $' + effectivePrice.toFixed(3) + ' | TP Target: $' + rule.takeProfit + ' | SL Target: $' + rule.stopLoss + ' | Bala: $' + bulletInfo.amountUsdc);

        this.saveTriggerToDb(coin, rule.tf, rule.side, currentDelta, rule.score, effectivePrice, bulletInfo.amountUsdc);

        const tokenId = realTokenId || ('TOKEN_' + coin + '_' + rule.side);

        // Open Position for TP/SL monitoring
        const position: OpenPosition = {
          ruleId: rule.id,
          coin: rule.coin,
          tf: rule.tf,
          side: rule.side,
          priceEntry: effectivePrice,
          takeProfit: rule.takeProfit,
          stopLoss: rule.stopLoss,
          bulletSize: bulletInfo.amountUsdc,
          tokenId: tokenId,
          openedAt: now,
          status: 'OPEN'
        };

        this.savePositionToDb(position, (posId) => {
          position.id = posId;
          this.activePositions.set(key, position);
        });

        this.signer.executeFOKOrder({
          coin,
          side: 'BUY',
          price: effectivePrice,
          amountUsdc: bulletInfo.amountUsdc,
          tokenId: tokenId
        });
      }
    }
  }

  private calculateBulletSize(rule: ApprovedRule): { amountUsdc: number } {
    return { amountUsdc: 1.00 }; // Fixed .00 bullet size
  }

  private saveTriggerToDb(coin: string, tf: string, side: string, deltaTrigger: number, score: number, priceEntry: number, bulletSize: number): void {
    const timestampEt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const sql = 'INSERT INTO v4_disparos_log (timestamp_et, coin, timeframe, side, delta_trigger, score, price_entry, bullet_size, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    this.db.run(sql, [timestampEt, coin, tf, side, deltaTrigger, score, priceEntry, bulletSize, 'EXECUTED_FOK']);
  }

  private savePositionToDb(pos: OpenPosition, callback: (id: number) => void): void {
    const timestampEt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const sql = 'INSERT INTO v4_positions (rule_id, coin, timeframe, side, price_entry, take_profit, stop_loss, bullet_size, token_id, opened_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    this.db.run(sql, [pos.ruleId, pos.coin, pos.tf, pos.side, pos.priceEntry, pos.takeProfit, pos.stopLoss, pos.bulletSize, pos.tokenId, timestampEt, 'OPEN'], function(err) {
      if (!err && this.lastID) callback(this.lastID);
      else callback(Date.now());
    });
  }
}

export const CALIBRATED_RULES = APPROVED_V4_RULES;
