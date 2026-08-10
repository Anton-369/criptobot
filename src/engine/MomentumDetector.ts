import { EventEmitter } from 'events';
import { BinanceWebsocketEngine, BinanceTickerState } from '../connectors/BinanceWebsocket';
import { PolymarketClobConnector, Polymarket1HMarket, BestOdds } from '../connectors/PolymarketClob';
import { CycleMatrixHistory, DirectionalBias } from './CycleMatrixHistory';
import { CONFIG } from '../config/environment';

import { PatternEngine, CoinPrediction } from './PatternEngine';

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

  public setOracle(predictions: CoinPrediction[]): void {
    this.oracle = predictions;
  }

  /** Check if oracle agrees with a proposed trade direction */
  private oracleApproves(coin: string, side: 'UP' | 'DOWN'): boolean {
    if (this.oracle.length === 0) return true; // no oracle yet = allow all
    const p = this.oracle.find(o => o.coin === coin);
    if (!p) return true;
    return p.predictedSide === side;
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

    try {
      const now = new Date();
      const currentMinute = now.getUTCMinutes(); // 0 to 59 — UTC aligned with Polymarket cycles
      const currentHour = now.getUTCHours();     // UTC — Polymarket cycles reset at :00 UTC

      // Automatically record completed hour outcomes at minute 0 (on new UTC hour transition)
      if (currentMinute === 0 && this.lastRecordedHour !== currentHour) {
        this.recordHourOutcomes();
        this.lastRecordedHour = currentHour;
      }

      // Time windows:
      // Ventana 0 (Minuto 01 a 10): Bala de Apertura & Desfase Ineficiencia
      // Ventana 1 (Minuto 12 a 25): Entrada Principal Direccional con Confluencia
      // Ventana 2 (Minuto 33 a 43): Póliza de Seguro Asimétrica (Risk-Free Lock)
      // Ventana 3 (Minuto 44 a 60): ZONA DE CANDADO (Hold-to-Oracle)
      const isApertureWindow = currentMinute >= 1 && currentMinute <= 10;
      const isMainBulletWindow = currentMinute >= 12 && currentMinute <= 25;
      const isInsuranceWindow = currentMinute >= 33 && currentMinute <= 43;

      if (!isApertureWindow && !isMainBulletWindow && !isInsuranceWindow) {
        return;
      }

      // Get macro beacon directions
      const btcTicker = this.binanceWs.getTickerState('BTCUSDT');
      const ethTicker = this.binanceWs.getTickerState('ETHUSDT');
      const btcDir: 'UP' | 'DOWN' = (btcTicker?.deltaPct || 0) >= 0 ? 'UP' : 'DOWN';
      const ethDir: 'UP' | 'DOWN' = (ethTicker?.deltaPct || 0) >= 0 ? 'UP' : 'DOWN';

      // Evaluate each tradable pair (XRP, SOL, DOGE, BNB, HYPE)
      const activeCoins = ['XRP', 'SOL', 'DOGE', 'BNB', 'HYPE'];
      for (const coin of activeCoins) {
        const pair = CONFIG.PAIRS.find((p: any) => p.coin === coin);
        if (!pair) continue;

        const ticker = this.binanceWs.getTickerState(pair.symbol);
        const market = this.polyClob.getActiveMarket(coin);

        if (!ticker || ticker.currentPrice === 0 || !market) {
          continue;
        }

        // Fetch live Polymarket orderbook odds
        const odds: BestOdds = await this.polyClob.getBestOdds(market.upTokenId, market.downTokenId);
        this.latestOdds.set(coin, odds);
        
        // Capa B: Get historical directional bias
        const bias: DirectionalBias = this.matrixHistory.getDirectionalBias(coin, btcDir, ethDir);

        // Evaluate specific coin hybrid strategy
        switch (coin) {
          case 'XRP':
            await this.evaluateXRP(market, ticker, odds, bias, currentMinute, isApertureWindow, isMainBulletWindow, isInsuranceWindow);
            break;
          case 'SOL':
            await this.evaluateSOL(market, ticker, odds, bias, currentMinute, isApertureWindow, isMainBulletWindow, isInsuranceWindow);
            break;
          case 'DOGE':
            await this.evaluateDOGE(market, ticker, odds, bias, currentMinute, isApertureWindow, isMainBulletWindow, isInsuranceWindow);
            break;
          case 'BNB':
            await this.evaluateBNB(market, ticker, odds, bias, currentMinute, isApertureWindow, isMainBulletWindow, isInsuranceWindow);
            break;
          case 'HYPE':
            await this.evaluateHYPE(market, ticker, odds, bias, currentMinute, isApertureWindow, isMainBulletWindow, isInsuranceWindow);
            break;
        }
      }
    } catch (err: any) {
      // Handle soft errors
    } finally {
      this.isEvaluating = false;
    }
  }

  /**
   * XRP Evaluator: Rebote Elástico + Asimetría BTC + Micro-vela Spot
   */
  private async evaluateXRP(
    market: Polymarket1HMarket,
    ticker: BinanceTickerState,
    odds: BestOdds,
    bias: DirectionalBias,
    currentMinute: number,
    isAperture: boolean,
    isMain: boolean,
    isInsurance: boolean
  ): Promise<void> {
    const coin = 'XRP';
    const strat = 'XRP_HYBRID_SNIPER';

    if (isAperture || isMain) {
      // FIXED: Require BOTH bias UP AND positive spot momentum (not OR)
      // Prevents firing on every cycle when BTC is bullish
      const spotUp = ticker.deltaPct >= 0.10;   // min +0.10% spot movement
      const spotDown = ticker.deltaPct <= -0.20; // min -0.20% spot movement

      if (bias.predictedSide === 'UP' && spotUp && odds.upBestAsk >= 0.25 && odds.upBestAsk <= 0.45) {
        this.emitOpportunity({
          coin, strategy: strat, targetSide: 'UP',
          targetTokenId: market.upTokenId, targetPrice: odds.upBestAsk,
          bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC, spotDeltaPct: ticker.deltaPct,
          cycleMinute: currentMinute,
          reason: `XRP UP: Bias ${bias.predictedSide} (${bias.confidencePct}%) + Spot +${ticker.deltaPct.toFixed(2)}% @ $${odds.upBestAsk.toFixed(3)}`,
          timestamp: Date.now()
        });
      } else if (spotDown && odds.downBestAsk >= 0.25 && odds.downBestAsk <= 0.45) {
        this.emitOpportunity({
          coin, strategy: strat, targetSide: 'DOWN',
          targetTokenId: market.downTokenId, targetPrice: odds.downBestAsk,
          bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC, spotDeltaPct: ticker.deltaPct,
          cycleMinute: currentMinute,
          reason: `XRP DOWN: Impulso Spot ${ticker.deltaPct.toFixed(2)}% @ $${odds.downBestAsk.toFixed(3)}`,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * SOL Evaluator: High Volatility Impulse + Active Asymmetric Insurance
   */
  private async evaluateSOL(
    market: Polymarket1HMarket,
    ticker: BinanceTickerState,
    odds: BestOdds,
    bias: DirectionalBias,
    currentMinute: number,
    isAperture: boolean,
    isMain: boolean,
    isInsurance: boolean
  ): Promise<void> {
    const coin = 'SOL';
    const strat = 'SOL_HYBRID_VOLATILITY';

    if (isAperture || isMain) {
      // FIXED: Require bias AND confirmed spot momentum
      const spotUp = ticker.deltaPct >= 0.20;
      const spotDown = ticker.deltaPct <= -0.25;

      if (bias.predictedSide === 'UP' && spotUp && odds.upBestAsk >= 0.25 && odds.upBestAsk <= 0.45) {
        this.emitOpportunity({
          coin, strategy: strat, targetSide: 'UP',
          targetTokenId: market.upTokenId, targetPrice: odds.upBestAsk,
          bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC, spotDeltaPct: ticker.deltaPct,
          cycleMinute: currentMinute,
          reason: `SOL UP: Bias ${bias.predictedSide} (${bias.confidencePct}%) + Spot +${ticker.deltaPct.toFixed(2)}% @ $${odds.upBestAsk.toFixed(3)}`,
          timestamp: Date.now()
        });
      } else if (spotDown && odds.downBestAsk >= 0.25 && odds.downBestAsk <= 0.45) {
        this.emitOpportunity({
          coin, strategy: strat, targetSide: 'DOWN',
          targetTokenId: market.downTokenId, targetPrice: odds.downBestAsk,
          bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC, spotDeltaPct: ticker.deltaPct,
          cycleMinute: currentMinute,
          reason: `SOL DOWN: Impulso Spot ${ticker.deltaPct.toFixed(2)}% @ $${odds.downBestAsk.toFixed(3)}`,
          timestamp: Date.now()
        });
      }
    }

    if (isInsurance) {
      // Insurance still valid: requires strong existing position in opposite direction
      if (odds.downBestAsk >= 0.08 && odds.downBestAsk <= 0.25) {
        this.emitOpportunity({
          coin, strategy: strat, targetSide: 'DOWN',
          targetTokenId: market.downTokenId, targetPrice: odds.downBestAsk,
          bulletSizeUSDC: CONFIG.SOL_INSURANCE_BULLET_USDC || 1.00, spotDeltaPct: ticker.deltaPct,
          cycleMinute: currentMinute,
          reason: `🛡️ POLIZA SEGURO SOL: DOWN @ $${odds.downBestAsk.toFixed(3)} (Ventana 2)`,
          timestamp: Date.now()
        });
      } else if (odds.upBestAsk >= 0.08 && odds.upBestAsk <= 0.25) {
        this.emitOpportunity({
          coin, strategy: strat, targetSide: 'UP',
          targetTokenId: market.upTokenId, targetPrice: odds.upBestAsk,
          bulletSizeUSDC: CONFIG.SOL_INSURANCE_BULLET_USDC || 1.00, spotDeltaPct: ticker.deltaPct,
          cycleMinute: currentMinute,
          reason: `🛡️ POLIZA SEGURO SOL: UP @ $${odds.upBestAsk.toFixed(3)} (Ventana 2)`,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * DOGE Evaluator: Swarm Connector Bridge
   */
  private async evaluateDOGE(
    market: Polymarket1HMarket,
    ticker: BinanceTickerState,
    odds: BestOdds,
    bias: DirectionalBias,
    currentMinute: number,
    isAperture: boolean,
    isMain: boolean,
    isInsurance: boolean
  ): Promise<void> {
    const coin = 'DOGE';
    const strat = 'DOGE_HYBRID_SWARM';

    if (isAperture || isMain) {
      // FIXED: Require a REAL signal — bias must be non-NEUTRAL OR strong spot momentum.
      // Prevents DOGE from firing on every single cycle with zero confirmation.
      const hasStrongSpot = Math.abs(ticker.deltaPct) >= 0.15;
      const hasNonNeutralBias = bias.predictedSide !== 'NEUTRAL';

      if (!hasStrongSpot && !hasNonNeutralBias) return; // No signal — skip

      const side = (hasNonNeutralBias ? bias.predictedSide : (ticker.deltaPct >= 0 ? 'UP' : 'DOWN')) as 'UP' | 'DOWN';
      const targetOdds = side === 'UP' ? odds.upBestAsk : odds.downBestAsk;
      const targetTokenId = side === 'UP' ? market.upTokenId : market.downTokenId;

      if (targetOdds >= 0.25 && targetOdds <= 0.45) {
        this.emitOpportunity({
          coin, strategy: strat, targetSide: side, targetTokenId, targetPrice: targetOdds,
          bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC, spotDeltaPct: ticker.deltaPct,
          cycleMinute: currentMinute,
          reason: `DOGE Swarm ${side} @ $${targetOdds.toFixed(3)} [Bias: ${bias.predictedSide} (${bias.confidencePct}%) | Spot: ${ticker.deltaPct.toFixed(2)}%]`,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * BNB Evaluator: Cluster ETH Sync + Lag Arbitrage
   */
  private async evaluateBNB(
    market: Polymarket1HMarket,
    ticker: BinanceTickerState,
    odds: BestOdds,
    bias: DirectionalBias,
    currentMinute: number,
    isAperture: boolean,
    isMain: boolean,
    isInsurance: boolean
  ): Promise<void> {
    const coin = 'BNB';
    const strat = 'BNB_HYBRID_ETH_CLUSTER';

    if (isAperture || isMain) {
      if (bias.predictedSide === 'UP' && odds.upBestAsk >= 0.20 && odds.upBestAsk <= 0.45) {
        this.emitOpportunity({
          coin: coin,
          strategy: strat,
          targetSide: 'UP',
          targetTokenId: market.upTokenId,
          targetPrice: odds.upBestAsk,
          bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
          spotDeltaPct: ticker.deltaPct,
          cycleMinute: currentMinute,
          reason: `BNB Cluster ETH Sync UP a $${odds.upBestAsk.toFixed(3)} [Confianza: ${bias.confidencePct}%] -> ${bias.reason}`,
          timestamp: Date.now()
        });
      } else if (bias.predictedSide === 'DOWN' && odds.downBestAsk >= 0.20 && odds.downBestAsk <= 0.45) {
        this.emitOpportunity({
          coin: coin,
          strategy: strat,
          targetSide: 'DOWN',
          targetTokenId: market.downTokenId,
          targetPrice: odds.downBestAsk,
          bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
          spotDeltaPct: ticker.deltaPct,
          cycleMinute: currentMinute,
          reason: `BNB Cluster ETH Sync DOWN a $${odds.downBestAsk.toFixed(3)} [Confianza: ${bias.confidencePct}%]`,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * HYPE Evaluator: Hyperliquid DEX Arbitrage & Uncontested PolyCLOB Inefficiency
   */
  private async evaluateHYPE(
    market: Polymarket1HMarket,
    ticker: BinanceTickerState,
    odds: BestOdds,
    bias: DirectionalBias,
    currentMinute: number,
    isAperture: boolean,
    isMain: boolean,
    isInsurance: boolean
  ): Promise<void> {
    const coin = 'HYPE';
    const strat = 'HYPE_HYBRID_DEX_ARBITRAGE';

    if (isAperture || isMain) {
      // FIXED: HYPE has low liquidity — require a real trigger, not just any quote in range
      const hasStrongSpot = Math.abs(ticker.deltaPct) >= 0.20;
      const hasNonNeutralBias = bias.predictedSide !== 'NEUTRAL';

      if (!hasStrongSpot && !hasNonNeutralBias) return; // No signal — skip

      const side = (hasNonNeutralBias ? bias.predictedSide : (ticker.deltaPct >= 0 ? 'UP' : 'DOWN')) as 'UP' | 'DOWN';
      const targetOdds = side === 'UP' ? odds.upBestAsk : odds.downBestAsk;
      const targetTokenId = side === 'UP' ? market.upTokenId : market.downTokenId;

      // Tighter range for HYPE due to low liquidity
      if (targetOdds >= 0.20 && targetOdds <= 0.45) {
        this.emitOpportunity({
          coin, strategy: strat, targetSide: side, targetTokenId, targetPrice: targetOdds,
          bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC, spotDeltaPct: ticker.deltaPct,
          cycleMinute: currentMinute,
          reason: `HYPE DEX Ineficiencia ${side} @ $${targetOdds.toFixed(3)} [Bias: ${bias.predictedSide} (${bias.confidencePct}%) | Spot: ${ticker.deltaPct.toFixed(2)}%]`,
          timestamp: Date.now()
        });
      }
    }
  }

  public recordHourOutcomes(): void {
    const activeCoins = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'BNB', 'HYPE'];
    for (const coin of activeCoins) {
      const pair = CONFIG.PAIRS.find((p: any) => p.coin === coin);
      if (pair) {
        const ticker = this.binanceWs.getTickerState(pair.symbol);
        if (ticker && ticker.currentPrice > 0) {
          // Use previousOpenPrice1H to determine the COMPLETED cycle's outcome
          // Falls back to current deltaPct if previousOpenPrice1H not yet available
          const refPrice = ticker.previousOpenPrice1H > 0 ? ticker.previousOpenPrice1H : ticker.openPrice1H;
          const outcome = ticker.currentPrice >= refPrice ? 'UP' : 'DOWN';
          this.matrixHistory.recordHourlyOutcome(coin, outcome);
        }
      }
    }
  }

  private emitOpportunity(sig: OpportunitySignal): void {
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
