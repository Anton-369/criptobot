import { EventEmitter } from 'events';
import { BinanceWebsocketEngine, BinanceTickerState } from '../connectors/BinanceWebsocket';
import { PolymarketClobConnector, Polymarket1HMarket, BestOdds } from '../connectors/PolymarketClob';
import { CONFIG } from '../config/environment';

export interface OpportunitySignal {
  coin: string;
  strategy: 'XRP_SNIPER' | 'SOL_ASYMMETRIC_HEDGE' | 'DOGE_LATE_HUNTER';
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
  private isEvaluating: boolean = false;
  private evalInterval: NodeJS.Timeout | null = null;

  constructor(binanceWs: BinanceWebsocketEngine, polyClob: PolymarketClobConnector) {
    super();
    this.binanceWs = binanceWs;
    this.polyClob = polyClob;
  }

  public start(intervalMs: number = 2000): void {
    if (this.evalInterval) return;

    console.log(`[MomentumDetector] 🎯 Evaluador de señales iniciado (Frecuencia: ${intervalMs}ms)...`);
    this.evalInterval = setInterval(() => this.evaluate(), intervalMs);
  }

  private async evaluate(): Promise<void> {
    if (this.isEvaluating) return;
    this.isEvaluating = true;

    try {
      const now = new Date();
      const currentMinute = now.getMinutes(); // 0 to 59

      // Active trading window: Minutes 2 to 55 of the 1H cycle
      const inWindow = currentMinute >= 2 && currentMinute <= 55;
      if (!inWindow) return;

      for (const pair of CONFIG.PAIRS) {
        const coin = pair.coin;
        const ticker = this.binanceWs.getTickerState(pair.symbol);
        const market = this.polyClob.getActiveMarket(coin);

        if (!ticker || ticker.currentPrice === 0 || !market) {
          continue;
        }

        // Fetch live orderbook odds from Polymarket
        const odds: BestOdds = await this.polyClob.getBestOdds(market.upTokenId, market.downTokenId);

        // -------------------------------------------------------------
        // CAPA 1: FILTRO DE MERCADO PLANO (DEAD/SIDEWAYS MARKET)
        // -------------------------------------------------------------
        // If 1H movement is flat (< 0.15%), skip directional entries to protect balance
        const isFlatMarket = Math.abs(ticker.deltaPct) < 0.15;
        if (isFlatMarket) {
          // Continue to insurance hedge check below, but skip directional entries
        } else {
          // Coin-specific base Binance Spot Delta Thresholds
          let baseReqDelta = 0.25; // XRP default (+0.25%)
          if (coin === 'SOL') baseReqDelta = 0.30;   // SOL (+0.30%)
          if (coin === 'DOGE') baseReqDelta = 0.35;  // DOGE (+0.35%)

          const isMacro24HUp = (ticker.delta24HPct || 0) > 0.5;
          const isMacro24HDown = (ticker.delta24HPct || 0) < -0.5;

          // -------------------------------------------------------------
          // CAPA 2 & CAPA 3: IMPULSO REQUERIDO DINÁMICO (MACRO VS 1H)
          // -------------------------------------------------------------
          // If 1H opposes 24H macro trend (Counter-trend Reversal), require strong acceleration (+0.65%)
          // If 1H aligns with 24H macro trend (Tide aligned), require base impulse (0.25% - 0.35%)
          let upReqDelta = isMacro24HDown ? 0.65 : baseReqDelta;
          let downReqDelta = isMacro24HUp ? 0.65 : baseReqDelta;

          // 1. UP Signal Check: Binance Spot is UP (>= upReqDelta) AND Polymarket UP odds are cheap ($0.25 - $0.45)
          if (ticker.deltaPct >= upReqDelta && odds.upBestAsk >= 0.25 && odds.upBestAsk <= 0.45) {
            const strat = coin === 'XRP' ? 'XRP_SNIPER' : (coin === 'SOL' ? 'SOL_ASYMMETRIC_HEDGE' : 'DOGE_LATE_HUNTER');
            const trendTag = isMacro24HUp ? 'ALINEADO_MACRO_24H' : (isMacro24HDown ? 'REVERSAL_CONFIRMADO' : 'IMPULSO_NORMAL');
            this.emitOpportunity({
              coin: coin,
              strategy: strat,
              targetSide: 'UP',
              targetTokenId: market.upTokenId,
              targetPrice: odds.upBestAsk,
              bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
              spotDeltaPct: ticker.deltaPct,
              cycleMinute: currentMinute,
              reason: `${coin} Spot UP (+${ticker.deltaPct.toFixed(2)}% | 24H: ${ticker.delta24HPct.toFixed(1)}% [${trendTag}]) a $${odds.upBestAsk.toFixed(3)} (Min ${currentMinute})`,
              timestamp: Date.now()
            });
          }
          // 2. DOWN Signal Check: Binance Spot is DOWN (<= -downReqDelta) AND Polymarket DOWN odds are cheap ($0.25 - $0.45)
          else if (ticker.deltaPct <= -downReqDelta && odds.downBestAsk >= 0.25 && odds.downBestAsk <= 0.45) {
            const strat = coin === 'XRP' ? 'XRP_SNIPER' : (coin === 'SOL' ? 'SOL_ASYMMETRIC_HEDGE' : 'DOGE_LATE_HUNTER');
            const trendTag = isMacro24HDown ? 'ALINEADO_MACRO_24H' : (isMacro24HUp ? 'REVERSAL_CONFIRMADO' : 'IMPULSO_NORMAL');
            this.emitOpportunity({
              coin: coin,
              strategy: strat,
              targetSide: 'DOWN',
              targetTokenId: market.downTokenId,
              targetPrice: odds.downBestAsk,
              bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
              spotDeltaPct: ticker.deltaPct,
              cycleMinute: currentMinute,
              reason: `${coin} Spot DOWN (${ticker.deltaPct.toFixed(2)}% | 24H: ${ticker.delta24HPct.toFixed(1)}% [${trendTag}]) a $${odds.downBestAsk.toFixed(3)} (Min ${currentMinute})`,
              timestamp: Date.now()
            });
          }
        }

        // 3. INSURANCE HEDGE CHECK: If opposite side drops to dirt-cheap insurance zone ($0.12 - $0.22)
        if (odds.downBestAsk >= 0.12 && odds.downBestAsk <= 0.22) {
          const strat = coin === 'XRP' ? 'XRP_SNIPER' : (coin === 'SOL' ? 'SOL_ASYMMETRIC_HEDGE' : 'DOGE_LATE_HUNTER');
          this.emitOpportunity({
            coin: coin,
            strategy: strat,
            targetSide: 'DOWN',
            targetTokenId: market.downTokenId,
            targetPrice: odds.downBestAsk,
            bulletSizeUSDC: CONFIG.SOL_INSURANCE_BULLET_USDC || 0.66,
            spotDeltaPct: ticker.deltaPct,
            cycleMinute: currentMinute,
            reason: `🛡️ PÓLIZA SEGURO: ${coin} DOWN regalado a $${odds.downBestAsk.toFixed(3)} (Garantiza arbitraje sin riesgo)`,
            timestamp: Date.now()
          });
        } else if (odds.upBestAsk >= 0.12 && odds.upBestAsk <= 0.22) {
          const strat = coin === 'XRP' ? 'XRP_SNIPER' : (coin === 'SOL' ? 'SOL_ASYMMETRIC_HEDGE' : 'DOGE_LATE_HUNTER');
          this.emitOpportunity({
            coin: coin,
            strategy: strat,
            targetSide: 'UP',
            targetTokenId: market.upTokenId,
            targetPrice: odds.upBestAsk,
            bulletSizeUSDC: CONFIG.SOL_INSURANCE_BULLET_USDC || 0.66,
            spotDeltaPct: ticker.deltaPct,
            cycleMinute: currentMinute,
            reason: `🛡️ PÓLIZA SEGURO: ${coin} UP regalado a $${odds.upBestAsk.toFixed(3)} (Garantiza arbitraje sin riesgo)`,
            timestamp: Date.now()
          });
        }
      }
    } catch (err: any) {
      // Handle soft errors
    } finally {
      this.isEvaluating = false;
    }
  }

  private emitOpportunity(sig: OpportunitySignal): void {
    this.emit('opportunity', sig);
  }

  public stop(): void {
    if (this.evalInterval) {
      clearInterval(this.evalInterval);
      this.evalInterval = null;
    }
  }
}
