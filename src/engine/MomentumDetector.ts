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

      for (const pair of CONFIG.PAIRS) {
        const coin = pair.coin;
        const ticker = this.binanceWs.getTickerState(pair.symbol);
        const market = this.polyClob.getActiveMarket(coin);

        if (!ticker || ticker.currentPrice === 0 || !market) {
          continue;
        }

        // Fetch live orderbook odds from Polymarket
        const odds: BestOdds = await this.polyClob.getBestOdds(market.upTokenId, market.downTokenId);

        // 1. XRP Strategy Rules
        if (coin === 'XRP') {
          this.evaluateXRP(ticker, market, odds, currentMinute);
        }

        // 2. SOL Strategy Rules
        if (coin === 'SOL') {
          this.evaluateSOL(ticker, market, odds, currentMinute);
        }

        // 3. DOGE Strategy Rules
        if (coin === 'DOGE') {
          this.evaluateDOGE(ticker, market, odds, currentMinute);
        }
      }
    } catch (err: any) {
      // Handle soft errors
    } finally {
      this.isEvaluating = false;
    }
  }

  private evaluateXRP(ticker: BinanceTickerState, market: Polymarket1HMarket, odds: BestOdds, minute: number): void {
    // Window: Minutes 15 to 28
    const inWindow = minute >= 15 && minute <= 28;
    
    if (ticker.trend === 'UP' && odds.upBestAsk >= 0.31 && odds.upBestAsk <= 0.42 && inWindow) {
      this.emitOpportunity({
        coin: 'XRP',
        strategy: 'XRP_SNIPER',
        targetSide: 'UP',
        targetTokenId: market.upTokenId,
        targetPrice: odds.upBestAsk,
        bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
        spotDeltaPct: ticker.deltaPct,
        cycleMinute: minute,
        reason: `XRP en Spot subiendo (+${ticker.deltaPct.toFixed(2)}%) con cuota UP desfasada a $${odds.upBestAsk.toFixed(3)} (Minuto ${minute})`,
        timestamp: Date.now()
      });
    } else if (ticker.trend === 'DOWN' && odds.downBestAsk >= 0.31 && odds.downBestAsk <= 0.42 && inWindow) {
      this.emitOpportunity({
        coin: 'XRP',
        strategy: 'XRP_SNIPER',
        targetSide: 'DOWN',
        targetTokenId: market.downTokenId,
        targetPrice: odds.downBestAsk,
        bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
        spotDeltaPct: ticker.deltaPct,
        cycleMinute: minute,
        reason: `XRP en Spot cayendo (${ticker.deltaPct.toFixed(2)}%) con cuota DOWN desfasada a $${odds.downBestAsk.toFixed(3)} (Minuto ${minute})`,
        timestamp: Date.now()
      });
    }
  }

  private evaluateSOL(ticker: BinanceTickerState, market: Polymarket1HMarket, odds: BestOdds, minute: number): void {
    // Window: Minutes 33 to 43
    const inWindow = minute >= 33 && minute <= 43;
    if (!inWindow) return;

    // Dominant side bullet ($2.00)
    if (ticker.trend === 'UP' && odds.upBestAsk <= 0.45) {
      this.emitOpportunity({
        coin: 'SOL',
        strategy: 'SOL_ASYMMETRIC_HEDGE',
        targetSide: 'UP',
        targetTokenId: market.upTokenId,
        targetPrice: odds.upBestAsk,
        bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
        spotDeltaPct: ticker.deltaPct,
        cycleMinute: minute,
        reason: `SOL Bala Principal Dominante UP a $${odds.upBestAsk.toFixed(3)} (Spot: +${ticker.deltaPct.toFixed(2)}%)`,
        timestamp: Date.now()
      });
    }

    // Insurance side bullet ($0.66)
    if (odds.downBestAsk >= 0.15 && odds.downBestAsk <= 0.30) {
      this.emitOpportunity({
        coin: 'SOL',
        strategy: 'SOL_ASYMMETRIC_HEDGE',
        targetSide: 'DOWN',
        targetTokenId: market.downTokenId,
        targetPrice: odds.downBestAsk,
        bulletSizeUSDC: CONFIG.SOL_INSURANCE_BULLET_USDC,
        spotDeltaPct: ticker.deltaPct,
        cycleMinute: minute,
        reason: `SOL Bala de Seguro DOWN a precio desfasado $${odds.downBestAsk.toFixed(3)} (Póliza Barata 25%)`,
        timestamp: Date.now()
      });
    }
  }

  private evaluateDOGE(ticker: BinanceTickerState, market: Polymarket1HMarket, odds: BestOdds, minute: number): void {
    // Window: Minutes 33 to 58
    const inWindow = minute >= 33 && minute <= 58;
    if (!inWindow) return;

    if (ticker.trend === 'UP' && odds.upBestAsk >= 0.20 && odds.upBestAsk <= 0.35) {
      this.emitOpportunity({
        coin: 'DOGE',
        strategy: 'DOGE_LATE_HUNTER',
        targetSide: 'UP',
        targetTokenId: market.upTokenId,
        targetPrice: odds.upBestAsk,
        bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
        spotDeltaPct: ticker.deltaPct,
        cycleMinute: minute,
        reason: `DOGE Cazador Tardío UP a $${odds.upBestAsk.toFixed(3)} en libro desierto (Minuto ${minute})`,
        timestamp: Date.now()
      });
    } else if (ticker.trend === 'DOWN' && odds.downBestAsk >= 0.20 && odds.downBestAsk <= 0.35) {
      this.emitOpportunity({
        coin: 'DOGE',
        strategy: 'DOGE_LATE_HUNTER',
        targetSide: 'DOWN',
        targetTokenId: market.downTokenId,
        targetPrice: odds.downBestAsk,
        bulletSizeUSDC: CONFIG.DEFAULT_BULLET_USDC,
        spotDeltaPct: ticker.deltaPct,
        cycleMinute: minute,
        reason: `DOGE Cazador Tardío DOWN a $${odds.downBestAsk.toFixed(3)} en libro desierto (Minuto ${minute})`,
        timestamp: Date.now()
      });
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
