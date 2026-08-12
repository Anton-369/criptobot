import { EventEmitter } from 'events';
import { BinanceWebsocketEngine, BinanceTickerState } from '../connectors/BinanceWebsocket';
import { PolymarketClobConnector, Polymarket1HMarket, BestOdds } from '../connectors/PolymarketClob';
import { CycleMatrixHistory, DirectionalBias } from './CycleMatrixHistory';
import { CONFIG } from '../config/environment';

import { PatternEngine, CoinPrediction } from './PatternEngine';

import * as fs from 'fs';
import * as path from 'path';

export interface OpportunitySignal {
  coin: string;
  strategy: string;
  targetSide: 'UP' | 'DOWN';
  targetTokenId: string;
  targetPrice: number;
  bulletSizeUSDC: number;
  spotDeltaPct: number;
  cycleMinute: number;
  reason: string;
  timestamp: number;
}

export class MomentumDetector extends EventEmitter {
  private binanceWs: BinanceWebsocketEngine;
  private polyClob: PolymarketClobConnector;
  private matrixHistory: CycleMatrixHistory;
  private isEvaluating: boolean = false;
  private evalInterval: NodeJS.Timeout | null = null;
  private lastRecordedHour: number = -1;
  private latestOdds: Map<string, BestOdds> = new Map();
  private oracle: CoinPrediction[] = [];
  private emittedThisWindow: Set<string> = new Set();
  private calibratedRules: Map<string, any> = new Map();
  private lastContractMtime: number = 0;

  public setOracle(predictions: CoinPrediction[]): void {
    this.oracle = predictions;
  }

  private oracleApproves(coin: string, side: 'UP' | 'DOWN'): boolean {
    if (this.oracle.length === 0) return true;
    const p = this.oracle.find(o => o.coin === coin);
    if (!p) return true;
    if (p.predictedSide !== side && p.confidencePct >= 70) {
      return false;
    }
    return true;
  }

  private loadCalibratedRules(): void {
    try {
      const contractPath = path.resolve(__dirname, '../../data/parametros_calibrados.json');
      if (fs.existsSync(contractPath)) {
        const stats = fs.statSync(contractPath);
        if (stats.mtimeMs <= this.lastContractMtime) return;
        this.lastContractMtime = stats.mtimeMs;

        const raw = fs.readFileSync(contractPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.rules_by_coin) {
          this.calibratedRules.clear();
          for (const [coin, rules] of Object.entries(parsed.rules_by_coin)) {
            if (Array.isArray(rules) && rules.length > 0) {
              this.calibratedRules.set(coin, rules);
            }
          }
          console.log(`[MomentumDetector] 📜 Contrato parametros_calibrados.json actualizado. Monedas autorizadas: [ ${Array.from(this.calibratedRules.keys()).join(', ')} ]`);
        }
      }
    } catch (e: any) {
      console.warn(`[MomentumDetector] ⚠️ No se pudo cargar contrato calibrado: ${e.message}`);
    }
  }

  constructor(
    binanceWs: BinanceWebsocketEngine,
    polyClob: PolymarketClobConnector,
    matrixHistory?: CycleMatrixHistory
  ) {
    super();
    this.binanceWs = binanceWs;
    this.polyClob = polyClob;
    this.matrixHistory = matrixHistory || new CycleMatrixHistory();
    this.loadCalibratedRules();
  }

  public getMatrixHistory(): CycleMatrixHistory {
    return this.matrixHistory;
  }

  public start(intervalMs: number = 2000): void {
    if (this.evalInterval) return;

    console.log(`[MomentumDetector] 🎯 Evaluador de Señales Híbrido (5 Coins) iniciado (${intervalMs}ms)...`);
    this.evalInterval = setInterval(() => this.evaluate(), intervalMs);
  }

  private async evaluate(): Promise<void> {
    if (this.isEvaluating) return;
    this.isEvaluating = true;
    this.emittedThisWindow.clear(); // Reset dedup per evaluation cycle
    this.loadCalibratedRules(); // Mantener reglas sincronizadas

    try {
      const now = new Date();
      const currentMinute = now.getUTCMinutes(); // 0 to 59 — UTC aligned with Polymarket cycles
      const currentHour = now.getUTCHours();     // UTC — Polymarket cycles reset at :00 UTC

      // Automatically record completed hour outcomes at minute 0 (on new UTC hour transition)
      if (currentMinute === 0 && this.lastRecordedHour !== currentHour) {
        this.recordHourOutcomes();
        this.lastRecordedHour = currentHour;
      }

      // Evaluar cada moneda activa de forma 100% DINÁMICA mediante las reglas de la IA
      const activeCoins = ['XRP', 'SOL', 'DOGE', 'BNB', 'HYPE'];
      for (const coin of activeCoins) {
        const rules = this.calibratedRules.get(coin);
        if (!rules || !Array.isArray(rules) || rules.length === 0) {
          continue; // Moneda no aprobada por el filtro cuantitativo / IA (ej. HYPE)
        }

        const pair = CONFIG.PAIRS.find((p: any) => p.coin === coin);
        if (!pair) continue;

        const ticker = this.binanceWs.getTickerState(pair.symbol);
        const market = this.polyClob.getActiveMarket(coin);

        if (!ticker || ticker.currentPrice === 0 || !market) {
          continue;
        }

        // Consultar cuotas del orderbook de Polymarket
        const odds: BestOdds = await this.polyClob.getBestOdds(market.upTokenId, market.downTokenId);
        this.latestOdds.set(coin, odds);

        // Ejecutar las reglas dinámicas provenientes de parametros_calibrados.json
        for (const rule of rules) {
          const windowMin = rule.recommended_entry_window_min || [1, 25];
          if (currentMinute < windowMin[0] || currentMinute > windowMin[1]) {
            continue;
          }

          const triggerDelta = rule.trigger_delta_pct || 0.10;
          const maxPrice = rule.max_entry_price || 0.45;

          let targetSide: 'UP' | 'DOWN' | null = null;
          let targetOdds = 1.0;
          let targetTokenId = '';

          if (ticker.deltaPct >= triggerDelta) {
            targetSide = 'UP';
            targetOdds = odds.upBestAsk;
            targetTokenId = market.upTokenId;
          } else if (ticker.deltaPct <= -triggerDelta) {
            targetSide = 'DOWN';
            targetOdds = odds.downBestAsk;
            targetTokenId = market.downTokenId;
          }

          if (targetSide && targetOdds >= 0.20 && targetOdds <= maxPrice) {
            this.emitOpportunity({
              coin,
              strategy: rule.rule_id || 'AI_MOMENTUM_RULE',
              targetSide,
              targetTokenId,
              targetPrice: targetOdds,
              bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
              spotDeltaPct: ticker.deltaPct,
              cycleMinute: currentMinute,
              reason: `[AI Contract] ${rule.rule_id} ${targetSide} @ $${targetOdds.toFixed(3)} | Spot: ${ticker.deltaPct >= 0 ? '+' : ''}${ticker.deltaPct.toFixed(2)}% | WR Train: ${(rule.win_rate_train * 100).toFixed(1)}% | WR Test: ${(rule.win_rate_test_oos * 100).toFixed(1)}% | p-val: ${rule.p_value.toExponential(2)}`,
              timestamp: Date.now()
            });
          }
        }
      }
    } catch (err: any) {
      // Manejo de errores suaves
    } finally {
      this.isEvaluating = false;
    }
  }

  public recordHourOutcomes(): void {
    const activeCoins = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'BNB', 'HYPE'];
    // The COMPLETED cycle's UTC hour (current hour minus 1, since we just crossed the boundary)
    const now = new Date();
    const completedHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() - 1, 0, 0, 0));
    const completedHourMs = completedHour.getTime();
    
    for (const coin of activeCoins) {
      const pair = CONFIG.PAIRS.find((p: any) => p.coin === coin);
      if (pair) {
        const ticker = this.binanceWs.getTickerState(pair.symbol);
        if (ticker && ticker.currentPrice > 0) {
          // Use previousOpenPrice1H to determine the COMPLETED cycle's outcome
          const refPrice = ticker.previousOpenPrice1H > 0 ? ticker.previousOpenPrice1H : ticker.openPrice1H;
          const outcome = ticker.currentPrice >= refPrice ? 'UP' : 'DOWN';
          this.matrixHistory.recordHourlyOutcome(coin, outcome, completedHourMs);
        }
      }
    }
  }

  private emitOpportunity(sig: OpportunitySignal): void {
    // Dedup: only 1 signal per coin per evaluation cycle
    if (this.emittedThisWindow.has(sig.coin)) return;
    this.emittedThisWindow.add(sig.coin);
    // Oracle gate: only fire if oracle agrees (or no oracle yet)
    if (!this.oracleApproves(sig.coin, sig.targetSide)) {
      return;
    }
    // Check orderbook depth before emitting signal
    const odds = this.latestOdds.get(sig.coin);
    if (odds) {
      const requiredShares = sig.bulletSizeUSDC / sig.targetPrice;
      const availableDepth = sig.targetSide === 'UP' ? odds.upAskDepth : odds.downAskDepth;
      if (availableDepth < requiredShares) {
        return; // Not enough depth — skip signal without spamming
      }
    }
    this.emit('opportunity', sig);
  }

  public stop(): void {
    if (this.evalInterval) {
      clearInterval(this.evalInterval);
      this.evalInterval = null;
    }
  }
}
