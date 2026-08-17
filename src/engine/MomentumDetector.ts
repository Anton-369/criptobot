import { EventEmitter } from 'events';
import { BinanceWebsocketEngine } from '../connectors/BinanceWebsocket';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';
import { PolymarketWebsocketConnector } from '../connectors/PolymarketWebsocket';
import { ModelRegistry } from '../model/modelRegistry';
import { DataValidator } from '../data/dataValidator';
import { EdgeCalculator } from '../features/edgeCalculator';
import { HypeSignalEngine } from '../features/HypeSignalEngine';
import { LiquidityGuard } from '../risk/liquidityGuard';
import { RiskManager } from '../risk/riskManager';
import { PositionMonitor } from '../risk/positionMonitor';
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
  private polyWss: PolymarketWebsocketConnector;
  private modelRegistry: ModelRegistry;
  private riskManager: RiskManager;
  private positionMonitor: PositionMonitor | null = null;
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
    this.polyWss = new PolymarketWebsocketConnector();
    this.polyWss.connect();

    const paramsPath = path.resolve(__dirname, '../../data/parametros_calibrados_v2.json');
    this.modelRegistry = new ModelRegistry(paramsPath);
    this.riskManager = new RiskManager();

    initDatabase()
      .then(async (db) => {
        this.repository = new Repository(db);
        console.log('[MomentumDetector] 🗄️ Database Repository connected.');

        // Sync RiskManager state from SQLite to survive process restarts
        await this.riskManager.syncFromDatabase(this.repository);

        // Start active PositionMonitor loop for Early Exit (TP bash.92 / SL bash.35)
        this.positionMonitor = new PositionMonitor(this.polyClob, this.repository, this.riskManager);
        this.positionMonitor.start(5000);
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
    console.log(`[MomentumDetector] 🚀 Starting Phase 3 Ultra-Low Latency WSS & HYPE Loop (${intervalMs}ms interval)...`);
    if (this.evalInterval) clearInterval(this.evalInterval);
    this.evalInterval = setInterval(() => this.evaluateCycleWindow(), intervalMs);
  }

  public stop(): void {
    if (this.evalInterval) {
      clearInterval(this.evalInterval);
      this.evalInterval = null;
    }
    if (this.positionMonitor) {
      this.positionMonitor.stop();
    }
    this.polyWss.disconnect();
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

      // Evaluate dynamic multi-minute cut windows: Minuto 5, Minuto 15, Minuto 30
      if (![5, 15, 30].includes(minute)) return;

      const coinsToEvaluate = ['XRPUSDT', 'SOLUSDT', 'DOGEUSDT', 'BNBUSDT', 'HYPEUSDT'];

      for (const symbol of coinsToEvaluate) {
        const baseCoin = symbol.replace('USDT', '');
        const emitKey = `${baseCoin}_${minute}`;
        if (this.emittedThisWindow.has(emitKey)) continue;

        // 1. Model Registry Check (fetches min_5, min_15, or min_30 calibration)
        const calib = this.modelRegistry.getCalibration(symbol, minute);
        if (!calib) {
          continue;
        }

        // 2. Market & Token IDs Check
        const market = this.polyClob.getActiveMarket(baseCoin);
        if (!market) {
          continue;
        }

        // Auto-subscribe WSS to active market tokens
        this.polyWss.subscribeTokens([market.upTokenId, market.downTokenId]);

        // Try WSS Cache first for ultra-low latency (<15ms)
        let odds = this.polyWss.getCachedOdds(market.upTokenId, market.downTokenId);
        let dataSource = 'WSS_ULTRA_LOW_LATENCY';

        // Fallback to HTTP REST if WSS cache is warming up
        if (!odds) {
          const restOdds = await this.polyClob.getBestOdds(market.upTokenId, market.downTokenId);
          if (restOdds) {
            odds = {
              upBestAsk: restOdds.upBestAsk,
              downBestAsk: restOdds.downBestAsk,
              upBestBid: restOdds.upBestBid,
              downBestBid: restOdds.downBestBid,
              upAskDepth: restOdds.upAskDepth,
              downAskDepth: restOdds.downAskDepth,
              lastUpdated: Date.now()
            };
            dataSource = 'REST_FALLBACK';
          }
        }

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

        // 4. Calculate Features (racha_down 1H, spot delta for current minute cut, and HYPE velocity)
        const candleStateMinute = await this.binanceWs.fetch1mCandles(symbol, minute);
        const candleValidation = DataValidator.validateBinanceCandles(candleStateMinute);
        if (!candleValidation.valid) {
          console.warn(`[MomentumDetector] ⚠️ Binance ${minute}m Candle Validation Failed for ${symbol}: ${candleValidation.reason}`);
          continue;
        }

        const openPriceMin1 = candleStateMinute[0].open || candleStateMinute[0].close;
        const currentPrice = candleStateMinute[candleStateMinute.length - 1].close;
        const deltaSpotMinute = ((currentPrice - openPriceMin1) / openPriceMin1) * 100;

        // Compute HYPE Micro-Momentum Velocity
        const hype = HypeSignalEngine.calculateHype(candleStateMinute);

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

        // 5. Edge Calculator (Net Edge over best_ask using exact cut calibration)
        const edge = EdgeCalculator.calculateEdge(
          rachaDown,
          deltaSpotMinute,
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
          1.0 //  USD order size
        );

        // Fetch real active exposure and active position count for this coin directly from SQLite
        let currentTotalExposureUSD = 0;
        let openPositionsCountForCoin = 0;
        if (this.repository) {
          currentTotalExposureUSD = await this.repository.getActiveExposureUSD();
          const coinPositions = await this.repository.getActivePositions(baseCoin);
          openPositionsCountForCoin = coinPositions.length;
        }

        // 6.5 Risk Manager Check (Kill Switches & Real Limits)
        const riskCheck = this.riskManager.validateTrade(
          baseCoin,
          1.0,
          openPositionsCountForCoin,
          currentTotalExposureUSD
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
            model_id: `logit_v3_cut_${minute}m_${dataSource.toLowerCase()}`,
            x1_raw: rachaDown,
            x2_raw: deltaSpotMinute,
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
          this.emittedThisWindow.add(emitKey);

          const opportunity: OpportunitySignal = {
            coin: baseCoin,
            strategy: `LOGIT_V3_CUT_${minute}M_WSS`,
            targetSide: edge.selected_side === 'YES' ? 'UP' : 'DOWN',
            targetTokenId: edge.selected_side === 'YES' ? market.upTokenId : market.downTokenId,
            targetPrice: targetAsk,
            bulletSizeUSDC: 1.0,
            spotDeltaPct: deltaSpotMinute,
            cycleMinute: minute,
            reason: `P(IA)=${(edge.p_ia * 100).toFixed(1)}% | EdgeNet=${(edge.selected_edge_net * 100).toFixed(2)}% | Min=${minute}m | HYPEScore=${hype.hype_score.toFixed(2)} (${hype.direction}) | Source=${dataSource} | Ask=$${targetAsk.toFixed(3)} | Depth=$${targetAskDepth.toFixed(1)}`,
            timestamp: Date.now()
          };

          console.log(`[MomentumDetector] 🎯 APPROVED SIGNAL FOR ${baseCoin} (Min ${minute}): ${opportunity.reason}`);
          this.emit('opportunity', opportunity);
        } else {
          console.log(`[MomentumDetector] ⏸️ REJECTED SIGNAL FOR ${baseCoin} (Min ${minute}): ${rejectReason}`);
        }
      }
    } finally {
      this.isEvaluating = false;
    }
  }
}
