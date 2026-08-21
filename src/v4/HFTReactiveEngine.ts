/**
 * ⚡ HYBRID HFT REACTIVE ENGINE V4.1.0 (CON AUDITORÍA DE PNL Y CIERRES CONSERVADORES)
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
  entryBid?: number;
  entryAsk?: number;
  entrySpread?: number;
  spotDeltaEntry?: number;
  openedAtUtc?: string;
}

export const DISABLED_RULES = [20, 29, 30];

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
    console.log('[V4 ENGINE] 🚫 REGLAS DESACTIVADAS: #20 HYPE 15M DOWN, #29 HYPE 5M UP, #30 HYPE 5M DOWN');
    
    const dbPath = path.resolve(process.cwd(), 'data', 'criptobot_v4.sqlite');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) console.error('[HFTEngine] ❌ Error conectando a SQLite V4:', err.message);
      else this.initDbSchema();
    });
  }

  private initDbSchema(): void {
    const sqlLog = 'CREATE TABLE IF NOT EXISTS v4_disparos_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp_et TEXT, coin TEXT, timeframe TEXT, side TEXT, delta_trigger REAL, score REAL, price_entry REAL, bullet_size REAL, status TEXT)';
    const sqlPositions = 'CREATE TABLE IF NOT EXISTS v4_positions (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id INTEGER, coin TEXT, timeframe TEXT, side TEXT, price_entry REAL, price_exit REAL, take_profit REAL, stop_loss REAL, bullet_size REAL, token_id TEXT, opened_at TEXT, closed_at TEXT, status TEXT, exit_reason TEXT DEFAULT "UNKNOWN", final_settlement_win INTEGER, final_spot_delta REAL, pnl_real REAL, entry_bid REAL, entry_ask REAL, entry_spread REAL, exit_bid REAL, exit_ask REAL, exit_spread REAL, spot_delta_entry REAL, spot_delta_exit REAL, opened_at_utc TEXT, closed_at_utc TEXT, engine_version TEXT)';
    this.db.run(sqlLog);
    this.db.run(sqlPositions, (err) => {
      if (!err) console.log('[HFTEngine] 🗄️ Tablas v4_disparos_log y v4_positions en SQLite verificadas.');
    });
  }

  public evaluateTick(coin: string): void {
    const delta1H = HFTSharedState.getDelta1H(coin);
    const delta15M = HFTSharedState.getDelta15M(coin);
    const delta5M = HFTSharedState.getDelta5M(coin);

    const rules = APPROVED_V4_RULES.filter(r => r.coin === coin);
    for (const rule of rules) {
      let delta = 0;
      if (rule.tf === '1H' && MARKET_FLAGS.ENABLE_1H) delta = delta1H;
      else if (rule.tf === '15M' && MARKET_FLAGS.ENABLE_15M) delta = delta15M;
      else if (rule.tf === '5M' && MARKET_FLAGS.ENABLE_5M) delta = delta5M;
      else continue;

      if (!this.isWithinSafeExecutionWindow(rule.tf)) {
        continue;
      }

      this.checkRule(rule, delta);
    }

    this.monitorActivePositions();
  }

  public monitorActivePositions(): void {
    const now = Date.now();
    for (const [key, pos] of this.activePositions.entries()) {
      const ageMs = now - pos.openedAt;
      const realTokenId = pos.tokenId;
      const orderbookBid = realTokenId ? this.orderbook.getBestBid(realTokenId) : 0;
      const sharedBid = HFTSharedState.getPolyBid(pos.coin, pos.side, pos.tf);
      const currentBid = orderbookBid > 0 ? orderbookBid : (sharedBid > 0 ? sharedBid : 0);

      const orderbookAsk = realTokenId ? this.orderbook.getBestAsk(realTokenId) : 0;
      const sharedAsk = HFTSharedState.getPolyAsk(pos.coin, pos.side, pos.tf);
      const currentAsk = orderbookAsk > 0 ? orderbookAsk : (sharedAsk > 0 ? sharedAsk : 0);
      const currentSpread = (currentAsk > 0 && currentBid > 0) ? (currentAsk - currentBid) : 0;

      const currentSpot = HFTSharedState.getSpotPrice(pos.coin);
      let rawSpotDeltaPct = 0;
      if (pos.entrySpotPrice && pos.entrySpotPrice > 0 && currentSpot > 0) {
        rawSpotDeltaPct = ((currentSpot - pos.entrySpotPrice) / pos.entrySpotPrice) * 100;
      }

      // Effective delta is side-aware
      const effectiveDelta = pos.side === 'UP' ? rawSpotDeltaPct : -rawSpotDeltaPct;

      // 🎯 1. CHECK TAKE PROFIT (currentBid >= pos.takeProfit)
      // PROHIBIDO registrar salida mayor que currentBid. No usar Math.max(currentBid, pos.takeProfit).
      if (currentBid >= pos.takeProfit) {
        const exitPrice = currentBid;
        const exitReason = 'EARLY_TP_BID';
        console.log(`[HFTEngine] 🎯 TAKE PROFIT ALCANZADO: ${pos.coin} ${pos.tf} ${pos.side} | Entry: $${pos.priceEntry.toFixed(3)} -> Exit: $${exitPrice.toFixed(3)} (Exit Reason: ${exitReason})`);
        this.closePosition(key, pos, exitPrice, 'CLOSED_TP', exitReason, currentBid, currentAsk, currentSpread, rawSpotDeltaPct);
        continue;
      }

      // 🛑 2. CHECK STOP LOSS SIDE-AWARE (effectiveDelta <= -0.40%)
      if (ageMs >= 15000 && effectiveDelta <= -0.40) {
        const exitPrice = currentBid > 0 ? currentBid : pos.stopLoss;
        const exitReason = 'STOP_SPOT_INVALIDATION';
        console.log(`[HFTEngine] 🛑 STOP LOSS POR INVALIDACIÓN SPOT BINANCE: ${pos.coin} ${pos.tf} ${pos.side} | Entry: $${pos.priceEntry.toFixed(3)} -> Exit: $${exitPrice.toFixed(3)} | Effective Delta: ${effectiveDelta.toFixed(2)}%`);
        this.closePosition(key, pos, exitPrice, 'CLOSED_SL', exitReason, currentBid, currentAsk, currentSpread, rawSpotDeltaPct);
        continue;
      }

      // ⏱️ 3. CHECK CYCLE EXPIRY AL FINAL DE VELA OFICIAL DE BINANCE (:00, :15, :30, :45 para 15M / cada 5m para 5M)
      const cycleExpiryMs = this.getOfficialCandleExpiryMs(pos.openedAt, pos.tf);
      if (now >= cycleExpiryMs) {
        let exitPrice = 0.00;
        let finalStatus: 'CLOSED_TP' | 'CLOSED_EXPIRED' = 'CLOSED_EXPIRED';
        let exitReason = 'SETTLEMENT_LOSS';
        let settlementWin: number | null = 0;

        if (effectiveDelta > 0) {
          exitPrice = 1.00;
          finalStatus = 'CLOSED_TP';
          exitReason = 'SETTLEMENT_WIN';
          settlementWin = 1;
        } else if (effectiveDelta < 0) {
          exitPrice = 0.00;
          finalStatus = 'CLOSED_EXPIRED';
          exitReason = 'SETTLEMENT_LOSS';
          settlementWin = 0;
        } else {
          // Empate / Delta == 0
          exitPrice = pos.priceEntry;
          finalStatus = 'CLOSED_EXPIRED';
          exitReason = 'SETTLEMENT_PUSH';
          settlementWin = null;
        }

        console.log(`[HFTEngine] ⏱️ SETTLEMENT AL VENCIMIENTO (${exitReason}): ${pos.coin} ${pos.tf} ${pos.side} | Effective Delta Final: ${effectiveDelta.toFixed(2)}% | Exit Price: $${exitPrice.toFixed(2)}`);
        this.closePosition(key, pos, exitPrice, finalStatus, exitReason, currentBid, currentAsk, currentSpread, rawSpotDeltaPct, settlementWin);
      }
    }
  }

    public getOfficialCandleExpiryMs(openedAtMs: number, tf: '1H' | '15M' | '5M'): number {
    const dt = new Date(openedAtMs);
    const min = dt.getUTCMinutes();
    const tfMin = tf === '5M' ? 5 : (tf === '15M' ? 15 : 60);
    const cycleStartMin = Math.floor(min / tfMin) * tfMin;
    const cycleEndDt = new Date(dt.getTime());
    cycleEndDt.setUTCMinutes(cycleStartMin + tfMin, 0, 0);
    return cycleEndDt.getTime();
  }

  public getOfficialCandleStartMs(openedAtMs: number, tf: '1H' | '15M' | '5M'): number {
    const dt = new Date(openedAtMs);
    const min = dt.getUTCMinutes();
    const tfMin = tf === '5M' ? 5 : (tf === '15M' ? 15 : 60);
    const cycleStartMin = Math.floor(min / tfMin) * tfMin;
    const cycleStartDt = new Date(dt.getTime());
    cycleStartDt.setUTCMinutes(cycleStartMin, 0, 0);
    return cycleStartDt.getTime();
  }

  private closePosition(
    key: string,
    pos: OpenPosition,
    exitPrice: number,
    status: 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_EXPIRED',
    exitReason: string,
    exitBid: number = 0,
    exitAsk: number = 0,
    exitSpread: number = 0,
    spotDeltaExit: number = 0,
    finalSettlementWin: number | null = null
  ): void {
    this.activePositions.delete(key);

    // Execute Sell Order in Live/Shadow
    this.signer.executeFOKOrder({
      coin: pos.coin,
      side: 'SELL',
      price: exitPrice,
      amountUsdc: pos.bulletSize,
      tokenId: pos.tokenId
    });

    const timestampEt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timestampUtc = new Date().toISOString();
    const pnlReal = pos.bulletSize * (exitPrice - pos.priceEntry);

    const sql = `UPDATE v4_positions SET 
      price_exit = ?, 
      closed_at = ?, 
      status = ?, 
      exit_reason = ?, 
      pnl_real = ?, 
      exit_bid = ?, 
      exit_ask = ?, 
      exit_spread = ?, 
      spot_delta_exit = ?, 
      closed_at_utc = ?,
      final_settlement_win = COALESCE(?, final_settlement_win),
      final_spot_delta = COALESCE(?, final_spot_delta),
      engine_version = 'v4.1.0'
      WHERE id = ?`;

    if (pos.id) {
      this.db.run(sql, [
        exitPrice,
        timestampEt,
        status,
        exitReason,
        pnlReal,
        exitBid,
        exitAsk,
        exitSpread,
        spotDeltaExit,
        timestampUtc,
        finalSettlementWin,
        spotDeltaExit,
        pos.id
      ]);
    }
  }

  public isWithinSafeExecutionWindow(tf: '1H' | '15M' | '5M'): boolean {
    const now = new Date();
    const min = now.getMinutes();
    const sec = now.getSeconds();

    if (tf === '5M') {
      const secInCycle = (min * 60 + sec) % 300;
      return secInCycle >= 30 && secInCycle <= 240;
    } else if (tf === '15M') {
      const minInCycle = min % 15;
      return minInCycle >= 1 && minInCycle <= 10;
    } else if (tf === '1H') {
      return min >= 2 && min <= 45;
    }
    return true;
  }

  private checkRule(rule: ApprovedRule, currentDelta: number): void {
    if (DISABLED_RULES.includes(rule.id)) {
      return; // Skip disabled rules #20, #29, #30
    }

    const coin = rule.coin;
    const now = Date.now();
    const key = coin + '_' + rule.tf + '_' + rule.side;

    if (this.activePositions.has(key)) return;
    if (now - (this.lastTriggerTimes.get(key) || 0) < this.cooldownMs) return;

    if ((rule.side === 'UP' && currentDelta >= rule.deltaTrigger) || (rule.side === 'DOWN' && currentDelta <= rule.deltaTrigger)) {
      const realTokenId = this.orderbook.getRealTokenId(coin, rule.side, rule.tf);
      const orderbookAsk = realTokenId ? this.orderbook.getBestAsk(realTokenId) : 0;
      const sharedAsk = HFTSharedState.getPolyAsk(coin, rule.side, rule.tf);
      const effectivePrice = orderbookAsk > 0 ? orderbookAsk : (sharedAsk > 0 ? sharedAsk : 0);
      if (effectivePrice <= 0) {
        return;
      }

      if (effectivePrice >= rule.minAsk && effectivePrice <= rule.maxAsk) {
        const bulletInfo = this.calculateBulletSize(rule);
        rule.tradeCount = (rule.tradeCount || 0) + 1;
        this.lastTriggerTimes.set(key, now);

        const spotPrice = HFTSharedState.getSpotPrice(coin);
        const orderbookBid = realTokenId ? this.orderbook.getBestBid(realTokenId) : 0;
        const sharedBid = HFTSharedState.getPolyBid(coin, rule.side, rule.tf);
        const effectiveBid = orderbookBid > 0 ? orderbookBid : (sharedBid > 0 ? sharedBid : 0);
        const spread = (effectivePrice > 0 && effectiveBid > 0) ? (effectivePrice - effectiveBid) : 0;

        console.log('[HFTEngine] ⚡ DISPARO FOK ' + rule.side + ': ' + coin + ' ' + rule.tf + ' | Delta: ' + currentDelta.toFixed(2) + '% | Entry Price: $' + effectivePrice.toFixed(3) + ' | TP Target: $' + rule.takeProfit + ' | SL Target: $' + rule.stopLoss + ' | Bala: $' + bulletInfo.amountUsdc);

        this.saveTriggerToDb(coin, rule.tf, rule.side, currentDelta, rule.score, effectivePrice, bulletInfo.amountUsdc);

        const tokenId = realTokenId || ('TOKEN_' + coin + '_' + rule.side);

        const position: OpenPosition = {
          ruleId: rule.id,
          coin: rule.coin,
          tf: rule.tf,
          side: rule.side,
          priceEntry: effectivePrice,
          entrySpotPrice: spotPrice,
          takeProfit: rule.takeProfit,
          stopLoss: rule.stopLoss,
          bulletSize: bulletInfo.amountUsdc,
          tokenId: tokenId,
          openedAt: now,
          status: 'OPEN',
          entryBid: effectiveBid,
          entryAsk: effectivePrice,
          entrySpread: spread,
          spotDeltaEntry: currentDelta,
          openedAtUtc: new Date().toISOString()
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
    return { amountUsdc: 1.00 };
  }

  private saveTriggerToDb(coin: string, tf: string, side: string, deltaTrigger: number, score: number, priceEntry: number, bulletSize: number): void {
    const timestampEt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const sql = 'INSERT INTO v4_disparos_log (timestamp_et, coin, timeframe, side, delta_trigger, score, price_entry, bullet_size, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    this.db.run(sql, [timestampEt, coin, tf, side, deltaTrigger, score, priceEntry, bulletSize, 'EXECUTED_FOK']);
  }

  private savePositionToDb(pos: OpenPosition, callback: (id: number) => void): void {
    const timestampEt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timestampUtc = new Date().toISOString();
    const sql = `INSERT INTO v4_positions (
      rule_id, coin, timeframe, side, price_entry, take_profit, stop_loss, bullet_size, token_id, opened_at, status,
      entry_bid, entry_ask, entry_spread, spot_delta_entry, opened_at_utc, engine_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'v4.1.0')`;

    this.db.run(sql, [
      pos.ruleId, pos.coin, pos.tf, pos.side, pos.priceEntry, pos.takeProfit, pos.stopLoss, pos.bulletSize, pos.tokenId, timestampEt, 'OPEN',
      pos.entryBid || pos.priceEntry, pos.entryAsk || pos.priceEntry, pos.entrySpread || 0, pos.spotDeltaEntry || 0, timestampUtc
    ], function(err) {
      if (!err && this.lastID) callback(this.lastID);
      else callback(Date.now());
    });
  }
}

export const CALIBRATED_RULES = APPROVED_V4_RULES;
