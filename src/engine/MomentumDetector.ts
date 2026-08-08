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

        // Coin-specific Binance Spot Delta Thresholds
        let reqDelta = 0.25; // XRP default (+0.25%)
        if (coin === 'SOL') reqDelta = 0.30;   // SOL (+0.30%)
        if (coin === 'DOGE') reqDelta = 0.35;  // DOGE (+0.35%)

        // 1. UP Signal Check: Binance Spot is UP (>= reqDelta) AND Polymarket UP odds are cheap ($0.25 - $0.45)
        if (ticker.deltaPct >= reqDelta && odds.upBestAsk >= 0.25 && odds.upBestAsk <= 0.45) {
          const strat = coin === 'XRP' ? 'XRP_SNIPER' : (coin === 'SOL' ? 'SOL_ASYMMETRIC_HEDGE' : 'DOGE_LATE_HUNTER');
          this.emitOpportunity({
            coin: coin,
            strategy: strat,
            targetSide: 'UP',
            targetTokenId: market.upTokenId,
            targetPrice: odds.upBestAsk,
            bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
            spotDeltaPct: ticker.deltaPct,
            cycleMinute: currentMinute,
            reason: `${coin} Spot subiendo (+${ticker.deltaPct.toFixed(2)}%) en Binance con cuota UP desfasada a $${odds.upBestAsk.toFixed(3)} (Minuto ${currentMinute})`,
            timestamp: Date.now()
          });
        }
        // 2. DOWN Signal Check: Binance Spot is DOWN (<= -reqDelta) AND Polymarket DOWN odds are cheap ($0.25 - $0.45)
        else if (ticker.deltaPct <= -reqDelta && odds.downBestAsk >= 0.25 && odds.downBestAsk <= 0.45) {
          const strat = coin === 'XRP' ? 'XRP_SNIPER' : (coin === 'SOL' ? 'SOL_ASYMMETRIC_HEDGE' : 'DOGE_LATE_HUNTER');
          this.emitOpportunity({
            coin: coin,
            strategy: strat,
            targetSide: 'DOWN',
            targetTokenId: market.downTokenId,
            targetPrice: odds.downBestAsk,
            bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
            spotDeltaPct: ticker.deltaPct,
            cycleMinute: currentMinute,
            reason: `${coin} Spot cayendo (${ticker.deltaPct.toFixed(2)}%) en Binance con cuota DOWN desfasada a $${odds.downBestAsk.toFixed(3)} (Minuto ${currentMinute})`,
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
