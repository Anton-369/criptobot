import { EventEmitter } from 'events';
import { BinanceWebsocketEngine } from '../connectors/BinanceWebsocket';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';
import { ModelRegistry } from '../model/modelRegistry';
import { DataValidator } from '../data/dataValidator';
import { EdgeCalculator } from '../features/edgeCalculator';
import { LiquidityGuard } from '../risk/liquidityGuard';
import { RiskManager } from '../risk/riskManager';
import { Repository } from '../db/repository';
import { initDatabase } from '../db/schema';
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
  private modelRegistry: ModelRegistry;
  private riskManager: RiskManager;
  private repository: Repository | null = null;
  private evalInterval: NodeJS.Timeout | null = null;
  private emittedThisWindow: Set<string> = new Set();
  private lastEvaluatedHour: number = -1;
  private oraclePredictions: any[] = [];
  private isEvaluating: boolean = false;

  constructor(binanceWs: BinanceWebsocketEngine, polyClob: PolymarketClobConnector) {
    super();
    this.binanceWs = binanceWs;
    this.polyClob = polyClob;

    const paramsPath = path.resolve(__dirname, '../../data/parametros_calibrados.json');
    this.modelRegistry = new ModelRegistry(paramsPath);
    this.riskManager = new RiskManager();

    initDatabase()
      .then((db) => {
        this.repository = new Repository(db);
        console.log('[MomentumDetector] 🗄️ Database Repository connected.');
      })
      .catch((err) => console.error('[MomentumDetector] ❌ DB Init Error:', err));
  }

  public setOracle(predictions: any[]): void {
    this.oraclePredictions = predictions;
  }

  public recordHourOutcomes(hour?: number): void {
    console.log(`[MomentumDetector] 📜 Cycle hour outcome recorded for UTC hour ${hour ?? 'current'}`);
  }

  public getMatrixHistory(): any {
    return null;
  }

  public getRiskManager(): RiskManager {
    return this.riskManager;
  }

  public start(intervalMs: number = 500): void {
    console.log(`[MomentumDetector] 🚀 Starting Phase 2 Quantitative & Risk Detector Loop (${intervalMs}ms interval)...`);
    if (this.evalInterval) clearInterval(this.evalInterval);
    this.evalInterval = setInterval(() => this.evaluateCycleWindow(), intervalMs);
  }

  public stop(): void {
    if (this.evalInterval) {
      clearInterval(this.evalInterval);
      this.evalInterval = null;
    }
  }

  private async evaluateCycleWindow(): Promise<void> {
    // 1. Race Condition Guard: Prevent parallel execution ticks
    if (this.isEvaluating) return;
    this.isEvaluating = true;

    try {
      const now = new Date();
      const currentHour = now.getUTCHours();
      const minute = now.getUTCMinutes();

      // Reset window lock on new hour
      if (currentHour !== this.lastEvaluatedHour) {
        this.emittedThisWindow.clear();
        this.lastEvaluatedHour = currentHour;

        // Reset daily stats at midnight UTC (00:00)
        if (currentHour === 0) {
          this.riskManager.resetDailyStats();
        }
      }

      // Only evaluate inside the firing window around :15:01.500
      if (minute !== 15) return;

      const coinsToEvaluate = ['XRPUSDT', 'SOLUSDT'];

      for (const symbol of coinsToEvaluate) {
        const baseCoin = symbol.replace('USDT', '');
        if (this.emittedThisWindow.has(baseCoin)) continue;

        // 1. Model Registry Check
        const calib = this.modelRegistry.getCalibration(symbol);
        if (!calib) {
          continue;
        }

        // 2. Market & Odds Data
        const market = this.polyClob.getActiveMarket(baseCoin);
        if (!market) {
          continue;
        }

        const odds = await this.polyClob.getBestOdds(market.upTokenId, market.downTokenId);
        if (!odds) {
          continue;
        }

        // 3. Data Validation Check
        const orderbookValidation = DataValidator.validateOrderbook({
          upBestAsk: odds.upBestAsk,
          downBestAsk: odds.downBestAsk
        });

        if (!orderbookValidation.valid) {
          console.warn(`[MomentumDetector] ⚠️ Data Validation Failed for ${baseCoin}: ${orderbookValidation.reason}`);
          continue;
        }

        // 4. Calculate Features (racha_down 1H and delta_15m)
        const candleState15m = await this.binanceWs.fetch1mCandles(symbol, 15);
        const candleValidation = DataValidator.validateBinanceCandles(candleState15m);
        if (!candleValidation.valid) {
          console.warn(`[MomentumDetector] ⚠️ Binance 15m Candle Validation Failed for ${symbol}: ${candleValidation.reason}`);
          continue;
        }

        const openPriceMin1 = candleState15m[0].open || candleState15m[0].close;
        const currentPrice = candleState15m[candleState15m.length - 1].close;
        const deltaSpot15m = ((currentPrice - openPriceMin1) / openPriceMin1) * 100;

        // Calculate 1H racha_down (consecutive previous completed 1H candles that closed DOWN)
        const candleState1H = await this.binanceWs.fetch1HCandles(symbol, 10);
        let rachaDown = 0;
        if (candleState1H.length >= 2) {
          for (let i = candleState1H.length - 2; i >= 0; i--) {
            if (candleState1H[i].close < candleState1H[i].open) {
              rachaDown++;
            } else {
              break;
            }
          }
        }

        // 5. Edge Calculator (Net Edge over best_ask)
        const edge = EdgeCalculator.calculateEdge(
          rachaDown,
          deltaSpot15m,
          calib,
          odds.upBestAsk,
          odds.downBestAsk
        );

        // 6. Liquidity Guard (5x depth & max 3.5% spread)
        const targetAsk = edge.selected_side === 'YES' ? odds.upBestAsk : odds.downBestAsk;
        const targetBid = edge.selected_side === 'YES' ? odds.upBestBid : odds.downBestBid;
        const targetAskDepth = edge.selected_side === 'YES' ? odds.upAskDepth : odds.downAskDepth;

        const liquidity = LiquidityGuard.validateLiquidity(
          targetAsk,
          targetBid,
          targetAskDepth,
          1.0 // $1 USD order size
        );

        // 6.5 Risk Manager Check (Kill Switches & Limits)
        const riskCheck = this.riskManager.validateTrade(
          baseCoin,
          1.0,
          this.emittedThisWindow.has(baseCoin) ? 1 : 0
        );

        const isFullyApproved = edge.approved && liquidity.approved && riskCheck.approved;
        const rejectReason = edge.reject_reason || liquidity.reject_reason || riskCheck.reject_reason;

        // ISO Standardized Hour Bucket for relational SQL integrity
        const hourBucket = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), currentHour, 0, 0)).toISOString();

        // 7. Save Signal to SQLite
        if (this.repository) {
          await this.repository.saveSignal({
            created_at: now.toISOString(),
            hour_bucket: hourBucket,
            coin: baseCoin,
            market_token_id: edge.selected_side === 'YES' ? market.upTokenId : market.downTokenId,
            model_id: 'logit_v3_phase2',
            x1_raw: rachaDown,
            x2_raw: deltaSpot15m,
            x1_norm: edge.x1_norm,
            x2_norm: edge.x2_norm,
            z: edge.z,
            p_ia: edge.p_ia,
            yes_ask: odds.upBestAsk,
            yes_bid: odds.upBestBid,
            no_ask: odds.downBestAsk,
            no_bid: odds.downBestBid,
            spread: liquidity.spread,
            depth_usd: targetAskDepth,
            edge_gross_yes: edge.edge_gross_yes,
            edge_gross_no: edge.edge_gross_no,
            edge_net_yes: edge.edge_net_yes,
            edge_net_no: edge.edge_net_no,
            selected_side: edge.selected_side,
            status: isFullyApproved ? 'APPROVED' : 'REJECTED',
            reject_reason: rejectReason,
            data_quality_ok: 1,
            risk_approved: riskCheck.approved ? 1 : 0
          });
        }

        // 8. Emit Signal if Edge, Liquidity, and RiskManager are Approved
        if (isFullyApproved) {
          this.emittedThisWindow.add(baseCoin);

          const opportunity: OpportunitySignal = {
            coin: baseCoin,
            strategy: 'LOGIT_V3_NET_EDGE',
            targetSide: edge.selected_side === 'YES' ? 'UP' : 'DOWN',
            targetTokenId: edge.selected_side === 'YES' ? market.upTokenId : market.downTokenId,
            targetPrice: targetAsk,
            bulletSizeUSDC: 1.0,
            spotDeltaPct: deltaSpot15m,
            cycleMinute: minute,
            reason: `P(IA)=${(edge.p_ia * 100).toFixed(1)}% | EdgeNet=${(edge.selected_edge_net * 100).toFixed(2)}% | Ask=$${targetAsk.toFixed(3)} | Depth=$${targetAskDepth.toFixed(1)} | RiskOK=true`,
            timestamp: Date.now()
          };

          console.log(`[MomentumDetector] 🎯 APPROVED SIGNAL FOR ${baseCoin}: ${opportunity.reason}`);
          this.emit('opportunity', opportunity);
        } else {
          console.log(`[MomentumDetector] ⏸️ REJECTED SIGNAL FOR ${baseCoin}: ${rejectReason}`);
        }
      }
    } finally {
      this.isEvaluating = false;
    }
  }
}
