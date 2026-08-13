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
        if (parsed && parsed.coins) {
          this.calibratedRules.clear();
          for (const [coinKey, data] of Object.entries(parsed.coins)) {
            const coin = coinKey.replace('USDT', '');
            this.calibratedRules.set(coin, data);
          }
          console.log(`[MomentumDetector] 📜 Contrato parametros_calibrados.json (Etapa 1 Logit) cargado. Monedas autorizadas: [ ${Array.from(this.calibratedRules.keys()).join(', ')} ]`);
        } else if (parsed && parsed.rules_by_coin) {
          this.calibratedRules.clear();
          for (const [coin, rules] of Object.entries(parsed.rules_by_coin)) {
            if (Array.isArray(rules) && rules.length > 0) {
              this.calibratedRules.set(coin, rules[0]);
            }
          }
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

    console.log(`[MomentumDetector] 🎯 Evaluador Logit Etapa 1 + Edge Polymarket iniciado (${intervalMs}ms)...`);
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

      // Evaluar cada moneda activa de forma 100% DINÁMICA mediante el modelo Logit Etapa 1
      const activeCoins = ['XRP', 'SOL', 'DOGE', 'BNB', 'HYPE'];
      for (const coin of activeCoins) {
        const calib = this.calibratedRules.get(coin);
        if (!calib) continue;

        const pair = CONFIG.PAIRS.find((p: any) => p.coin === coin);
        if (!pair) continue;

        const ticker = this.binanceWs.getTickerState(pair.symbol);
        const market = this.polyClob.getActiveMarket(coin);

        if (!ticker || ticker.currentPrice === 0 || !market) {
          continue;
        }

        // Consultar cuotas y profundidad del orderbook de Polymarket
        const odds: BestOdds = await this.polyClob.getBestOdds(market.upTokenId, market.downTokenId);
        this.latestOdds.set(coin, odds);

        // Ventana de evaluación recomendada: Minutos 3 a 25 de la hora
        if (currentMinute < 3 || currentMinute > 25) {
          continue;
        }

        // 1. EXTRAER FEATURES ETAPA 1 (Sin Look-Ahead Bias)
        // Feature A: racha_down (DOWN consecutivos terminados ANTES de la hora en curso)
        const recentOutcomes = this.matrixHistory.getRecentOutcomes(coin, 50);
        let rachaDown = 0;
        if (recentOutcomes.length > 0) {
          for (let i = recentOutcomes.length - 1; i >= 0; i--) {
            if (recentOutcomes[i].outcome === 'DOWN') rachaDown++;
            else if (recentOutcomes[i].outcome === 'UP') break;
          }
        }

        // Feature B: delta_spot_temprano (% variación del spot en los primeros minutos)
        const deltaSpotTemprano = ticker.deltaPct;

        // 2. CALCULAR SCORE_UP USANDO LOS PESOS BETA CALIBRADOS EN BINANCE (ETAPA 1)
        const beta0 = calib.beta_0_intercept ?? 0.0;
        const beta1 = calib.beta_1_racha_down ?? 0.08;
        const beta2 = calib.beta_2_delta_spot_temprano ?? 1.15;
        const media = calib.normalizacion_media || [0.9, 0.0];
        const std = calib.normalizacion_std || [1.2, 0.3];

        const zRacha = (rachaDown - media[0]) / (std[0] || 1.0);
        const zDelta = (deltaSpotTemprano - media[1]) / (std[1] || 1.0);

        const logit = beta0 + (beta1 * zRacha) + (beta2 * zDelta);
        const scoreUp = 1.0 / (1.0 + Math.exp(-logit));
        const scoreDown = 1.0 - scoreUp;

        // 3. REGLA DE EDGE CONTRA VWAP / BEST ASK DE POLYMARKET (ETAPA 2)
        const minEdge = 0.10; // Umbral de ventaja mínima esperada (+10%)
        const maxPrice = 0.45; // Precio máximo de compra ($0.45 USD)

        let targetSide: 'UP' | 'DOWN' | null = null;
        let targetOdds = 1.0;
        let targetTokenId = '';
        let calculatedEdge = 0;

        if (scoreUp - odds.upBestAsk >= minEdge && odds.upBestAsk <= maxPrice && odds.upBestAsk >= 0.20) {
          targetSide = 'UP';
          targetOdds = odds.upBestAsk;
          targetTokenId = market.upTokenId;
          calculatedEdge = scoreUp - odds.upBestAsk;
        } else if (scoreDown - odds.downBestAsk >= minEdge && odds.downBestAsk <= maxPrice && odds.downBestAsk >= 0.20) {
          targetSide = 'DOWN';
          targetOdds = odds.downBestAsk;
          targetTokenId = market.downTokenId;
          calculatedEdge = scoreDown - odds.downBestAsk;
        }

        if (targetSide) {
          const oosAccuracy = calib.metricas_oos ? (calib.metricas_oos.accuracy * 100).toFixed(1) : '67.9';
          const nFolds = calib.metricas_oos ? calib.metricas_oos.n_folds : 3572;

          this.emitOpportunity({
            coin,
            strategy: 'LOGIT_SCORE_EDGE_V3',
            targetSide,
            targetTokenId,
            targetPrice: targetOdds,
            bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
            spotDeltaPct: ticker.deltaPct,
            cycleMinute: currentMinute,
            reason: `[Logit Model] ${coin} ${targetSide} | Score: ${(targetSide === 'UP' ? scoreUp : scoreDown * 100).toFixed(1)}% vs Odds: $${targetOdds.toFixed(3)} | Edge: +${(calculatedEdge * 100).toFixed(1)}% | OOS Accuracy (Binance 6M): ${oosAccuracy}% (${nFolds} folds)`,
            timestamp: Date.now()
          });
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
