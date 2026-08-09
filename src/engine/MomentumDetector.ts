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

      // -------------------------------------------------------------
      // CUATRO VENTANAS DE TIEMPO DEL CICLO DE 1 HORA
      // -------------------------------------------------------------
      // Ventana 0 (Minuto 01 a 10): Bala de Apertura (Early Aperture Alpha, Odds <= $0.45)
      // Ventana 1 (Minuto 12 a 25): Entrada Principal (Binance Spot Impulse + Odds $0.25-$0.45)
      // Ventana 2 (Minuto 33 a 43): Póliza Cobertura Asimétrica (Odds $0.15-$0.30)
      // Ventana 3 (Minuto 44 a 60): ZONA DE CANDADO (Cero entradas, Hold-to-Oracle)
      const isApertureWindow = currentMinute >= 1 && currentMinute <= 10;
      const isMainBulletWindow = currentMinute >= 12 && currentMinute <= 25;
      const isInsuranceWindow = currentMinute >= 33 && currentMinute <= 43;

      if (!isApertureWindow && !isMainBulletWindow && !isInsuranceWindow) {
        // Estrictamente fuera de las ventanas activas (incluye el candado Min 44-60)
        return;
      }

      for (const pair of CONFIG.PAIRS) {
        const coin = pair.coin;

        // ESTRICTO: Solo disparar dinero real en los 3 activos operables comprobados (XRP, SOL, DOGE).
        // BNB y HYPE permanecen en STANDBY acumulando datos en el Dashboard y las Matrices.
        // BTC y ETH actúan como Faros Macro (no se compran).
        const isTradableActive = coin === 'XRP' || coin === 'SOL' || coin === 'DOGE';
        if (!isTradableActive) continue;

        const ticker = this.binanceWs.getTickerState(pair.symbol);
        const market = this.polyClob.getActiveMarket(coin);

        if (!ticker || ticker.currentPrice === 0 || !market) {
          continue;
        }

        // Fetch live orderbook odds from Polymarket
        const odds: BestOdds = await this.polyClob.getBestOdds(market.upTokenId, market.downTokenId);

        // -------------------------------------------------------------
        // VENTANA 0 (MINUTO 01 A 10): BALA DE APERTURA (EARLY APERTURE ALPHA)
        // Captura cuotas desalineadas ($0.25-$0.45) aprovechando volatilidad inicial
        // -------------------------------------------------------------
        if (isApertureWindow) {
          if (odds.upBestAsk >= 0.25 && odds.upBestAsk <= 0.45) {
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
              reason: `${coin} Apertura Early Alpha UP a $${odds.upBestAsk.toFixed(3)} (Ventana 0 - Min ${currentMinute})`,
              timestamp: Date.now()
            });
          } else if (odds.downBestAsk >= 0.25 && odds.downBestAsk <= 0.45) {
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
              reason: `${coin} Apertura Early Alpha DOWN a $${odds.downBestAsk.toFixed(3)} (Ventana 0 - Min ${currentMinute})`,
              timestamp: Date.now()
            });
          }
        }

        // -------------------------------------------------------------
        // VENTANA 1 (MINUTO 12 A 25): BALA PRINCIPAL DIRECCIONAL
        // -------------------------------------------------------------
        if (isMainBulletWindow) {
          const isFlatMarket = Math.abs(ticker.deltaPct) < 0.15;
          if (!isFlatMarket) {
            let baseReqDelta = 0.25; // XRP default (+0.25%)
            if (coin === 'SOL') baseReqDelta = 0.30;   // SOL (+0.30%)
            if (coin === 'DOGE') baseReqDelta = 0.35;  // DOGE (+0.35%)

            const isMacro24HUp = (ticker.delta24HPct || 0) > 0.5;
            const isMacro24HDown = (ticker.delta24HPct || 0) < -0.5;

            let upReqDelta = isMacro24HDown ? 0.65 : baseReqDelta;
            let downReqDelta = isMacro24HUp ? 0.65 : baseReqDelta;

            // 1. UP Signal Check
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
                reason: `${coin} Spot UP (+${ticker.deltaPct.toFixed(2)}% | 24H: ${ticker.delta24HPct.toFixed(1)}% [${trendTag}]) a $${odds.upBestAsk.toFixed(3)} (Ventana 1 - Min ${currentMinute})`,
                timestamp: Date.now()
              });
            }
            // 2. DOWN Signal Check
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
                reason: `${coin} Spot DOWN (${ticker.deltaPct.toFixed(2)}% | 24H: ${ticker.delta24HPct.toFixed(1)}% [${trendTag}]) a $${odds.downBestAsk.toFixed(3)} (Ventana 1 - Min ${currentMinute})`,
                timestamp: Date.now()
              });
            }
          }
        }

        // -------------------------------------------------------------
        // VENTANA 2 (MINUTO 33 A 43): PÓLIZA DE SEGURO SOBRE-DESCUENTADA ($0.08 - $0.25)
        // Arbitraje libre de riesgo (Risk-Free Lock) cuando la posición principal domina
        // -------------------------------------------------------------
        if (isInsuranceWindow) {
          if (odds.downBestAsk >= 0.08 && odds.downBestAsk <= 0.25) {
            const strat = coin === 'XRP' ? 'XRP_SNIPER' : (coin === 'SOL' ? 'SOL_ASYMMETRIC_HEDGE' : 'DOGE_LATE_HUNTER');
            this.emitOpportunity({
              coin: coin,
              strategy: strat,
              targetSide: 'DOWN',
              targetTokenId: market.downTokenId,
              targetPrice: odds.downBestAsk,
              bulletSizeUSDC: CONFIG.SOL_INSURANCE_BULLET_USDC || 1.00,
              spotDeltaPct: ticker.deltaPct,
              cycleMinute: currentMinute,
              reason: `🛡️ PÓLIZA SEGURO: ${coin} DOWN sobre-descuentado a $${odds.downBestAsk.toFixed(3)} (Ventana 2 - Min ${currentMinute})`,
              timestamp: Date.now()
            });
          } else if (odds.upBestAsk >= 0.08 && odds.upBestAsk <= 0.25) {
            const strat = coin === 'XRP' ? 'XRP_SNIPER' : (coin === 'SOL' ? 'SOL_ASYMMETRIC_HEDGE' : 'DOGE_LATE_HUNTER');
            this.emitOpportunity({
              coin: coin,
              strategy: strat,
              targetSide: 'UP',
              targetTokenId: market.upTokenId,
              targetPrice: odds.upBestAsk,
              bulletSizeUSDC: CONFIG.SOL_INSURANCE_BULLET_USDC || 1.00,
              spotDeltaPct: ticker.deltaPct,
              cycleMinute: currentMinute,
              reason: `🛡️ PÓLIZA SEGURO: ${coin} UP sobre-descuentado a $${odds.upBestAsk.toFixed(3)} (Ventana 2 - Min ${currentMinute})`,
              timestamp: Date.now()
            });
          }
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
