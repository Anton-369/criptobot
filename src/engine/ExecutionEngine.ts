import { EventEmitter } from 'events';
import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { CONFIG } from '../config/environment';
import { OpportunitySignal } from './MomentumDetector';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';
import { StateManager } from './StateManager';
import * as path from 'path';

export interface PositionRecord {
  id: string;
  coin: string;
  strategy: string;
  side: 'UP' | 'DOWN' | 'YES' | 'NO';
  tokenId: string;
  entryPrice: number;
  shares: number;
  investedUSDC: number;
  currentValueUSDC?: number;
  status: 'OPEN' | 'WIN' | 'LOSS' | 'SOLD_TP';
  entryTimestamp: number;
  title?: string;
  resolvedTimestamp?: number;
  pnlUSDC?: number;
}

export class ExecutionEngine extends EventEmitter {
  private tradedCoinsThisHour: Set<string> = new Set<string>();
  private polyClob: PolymarketClobConnector;
  private mode: 'SHADOW' | 'LIVE';
  private positions: PositionRecord[] = [];
  private recentLiveExecutions: PositionRecord[] = [];
  private localCycleFills: { coin: string; side: string; investedUSDC: number; timestamp: number }[] = [];
  private stateManager: StateManager;

  // Real-time wallet tracking
  private totalBalanceUSDC: number = 0;
  private availableBalanceUSDC: number = 0;
  private inOrdersUSDC: number = 0;
  private isExecutingSignal: boolean = false;

  constructor(polyClob: PolymarketClobConnector) {
    super();
    this.polyClob = polyClob;
    this.mode = CONFIG.EXECUTION_MODE;
    this.stateManager = new StateManager(path.resolve(__dirname, '../../data'));
  }

  public resetCycleLock(): void {
    this.tradedCoinsThisHour.clear();
    console.log("[ExecutionEngine] 🔄 Cerrojo de ciclo reiniciado para la nueva hora.");
  }

  public async initialize(): Promise<void> {
    console.log(`[ExecutionEngine] 🚀 Inicializando motor en MODO: ${this.mode}`);

    // Load persisted state from previous runs
    const persistedFills = this.stateManager.getCycleFills();
    const cycleStartMs = Date.UTC(
      new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(),
      new Date().getUTCHours(), 0, 0, 0
    );
    let restoredCount = 0;
    for (const pf of persistedFills) {
      if (pf.timestamp >= cycleStartMs) {
        this.localCycleFills.push({
          coin: pf.coin, side: pf.side, investedUSDC: pf.investedUSDC, timestamp: pf.timestamp
        });
        restoredCount++;
      }
    }
    if (restoredCount > 0) {
      console.log(`[ExecutionEngine] 🔄 Restaurados ${restoredCount} fills del ciclo actual desde estado persistido`);
    }

    await this.refreshWalletBalances();
    await this.fetchLiveWalletPositions();
  }

  public async fetchLiveWalletPositions(): Promise<PositionRecord[]> {
    try {
      const url = `https://data-api.polymarket.com/positions?user=${CONFIG.PROXY_WALLET}&sizeThreshold=0`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
      });
      if (resp.ok) {
        const rawPositions: any = await resp.json();
        if (Array.isArray(rawPositions)) {
          const existingTimestamps = new Map<string, number>();
          for (const ep of this.positions) {
            existingTimestamps.set(ep.tokenId, ep.entryTimestamp);
          }

          const livePos: PositionRecord[] = rawPositions
            .filter((p: any) => (parseFloat(p.size) || 0) > 0)
            .map((p: any) => ({
              id: p.conditionId || p.asset,
              coin: p.title?.toUpperCase().includes('XRP') ? 'XRP' :
                p.title?.toUpperCase().includes('SOL') ? 'SOL' :
                  p.title?.toUpperCase().includes('DOGE') ? 'DOGE' :
                    p.title?.toUpperCase().includes('BNB') ? 'BNB' : 'CLIMA/WASHY',
              strategy: 'LOGIT_V3',
              side: (p.outcome || 'YES').toUpperCase() as any,
              tokenId: p.asset,
              entryPrice: parseFloat(p.avgPrice) || 0,
              shares: parseFloat(p.size) || 0,
              investedUSDC: parseFloat(p.initialValue) || 0,
              currentValueUSDC: parseFloat(p.currentValue) || 0,
              status: 'OPEN',
              entryTimestamp: existingTimestamps.get(p.asset) || Date.now(),
              title: p.title
            }));

          const FIVE_MIN_MS = 5 * 60 * 1000;
          this.recentLiveExecutions = this.recentLiveExecutions.filter(p => (Date.now() - p.entryTimestamp) < FIVE_MIN_MS);

          const ONE_HOUR_MS = 60 * 60 * 1000;
          const shadowPos = this.positions.filter(p => p.id.startsWith('SHADOW_') && (Date.now() - p.entryTimestamp) < ONE_HOUR_MS);

          const combined = [...this.recentLiveExecutions, ...livePos, ...shadowPos];
          const uniqueMap = new Map<string, PositionRecord>();
          for (const p of combined) {
            if (!uniqueMap.has(p.tokenId)) uniqueMap.set(p.tokenId, p);
          }
          this.positions = Array.from(uniqueMap.values());
        }
      }
    } catch (err: any) {
      console.warn(`[ExecutionEngine] ⚠️ Error leyendo posiciones de wallet API: ${err.message}`);
    }
    return this.positions;
  }

  public async refreshWalletBalances(): Promise<void> {
    try {
      const bal = await this.polyClob.getCollateralBalance();
      this.totalBalanceUSDC = bal;
      this.availableBalanceUSDC = bal;
    } catch (err: any) {
      console.warn(`[ExecutionEngine] ⚠️ Error refrescando balance: ${err.message}`);
    }
  }

  public async executeSignal(sig: OpportunitySignal): Promise<boolean> {
    if (this.isExecutingSignal) return false;
    if (this.tradedCoinsThisHour.has(sig.coin)) {
        console.warn();
        return false;
      }
      this.tradedCoinsThisHour.add(sig.coin);
    this.isExecutingSignal = true;

    try {
      // Cooldown: Minimum 1 minute (60,000ms) gap between entries on the same coin
      const currentLocalFills = this.localCycleFills.filter(f => f.coin === sig.coin);
      const lastFillTimestamp = Math.max(
        0,
        ...currentLocalFills.map(f => f.timestamp)
      );

      if (lastFillTimestamp > 0 && (Date.now() - lastFillTimestamp) < 60000) {
        console.warn(`[ExecutionEngine] ⏳ Cooldown activo para ${sig.coin}: Ya se ejecutó un disparo en los últimos 60s.`);
        return false;
      }

      if (this.mode === 'SHADOW') {
        return this.executeShadowFill(sig);
      } else {
        return await this.executeLiveFOK(sig);
      }
    } finally {
      this.isExecutingSignal = false;
    }
  }

  private executeShadowFill(sig: OpportunitySignal): boolean {
    const shares = sig.bulletSizeUSDC / sig.targetPrice;
    const posId = `SHADOW_${Date.now()}_${sig.coin}`;

    const pos: PositionRecord = {
      id: posId,
      coin: sig.coin,
      strategy: sig.strategy,
      side: sig.targetSide,
      tokenId: sig.targetTokenId,
      entryPrice: sig.targetPrice,
      shares: shares,
      investedUSDC: sig.bulletSizeUSDC,
      status: 'OPEN',
      entryTimestamp: Date.now()
    };

    this.positions.unshift(pos);
    this.localCycleFills.push({
      coin: sig.coin,
      side: sig.targetSide,
      investedUSDC: sig.bulletSizeUSDC,
      timestamp: Date.now()
    });
    this.stateManager.addFill({
      coin: sig.coin,
      side: sig.targetSide,
      investedUSDC: sig.bulletSizeUSDC,
      timestamp: Date.now()
    });
    this.refreshWalletBalances();

    console.log(`\n👻 [SHADOW EXECUTION] Orden Simulada Favorable`);
    console.log(`   Coin: ${pos.coin} | Lado: ${pos.side} | Precio: $${pos.entryPrice.toFixed(3)} | Invertido: $${pos.investedUSDC.toFixed(2)} USDC`);

    this.emit('position_opened', pos);
    return true;
  }

  private async executeLiveFOK(sig: OpportunitySignal): Promise<boolean> {
    const client = this.polyClob.getClobClient();
    if (!client) {
      console.error(`[ExecutionEngine] ❌ Cliente CLOB no autenticado para LIVE.`);
      return false;
    }

    try {
      // Validate orderbook liquidity using sig.targetPrice * 1.02 (2% slippage cap), NOT hardcoded 0.45!
      const requiredShares = sig.bulletSizeUSDC / sig.targetPrice;
      const slippageCapPrice = Math.min(0.95, sig.targetPrice * 1.02);

      const obValidation = await this.polyClob.validateOrderbookLiquidity(sig.targetTokenId, requiredShares, slippageCapPrice);
      if (!obValidation.isValid) {
        console.warn(`[ExecutionEngine] ⛔ Rechazado por Orderbook CLOB: ${obValidation.reason}`);
        return false;
      }

      console.log(`\n💥 [LIVE FOK EXECUTION] Enviando orden FOK real de $${sig.bulletSizeUSDC.toFixed(2)} USD a Polymarket... (Ask: $${obValidation.bestAsk.toFixed(3)}, Depth: $${obValidation.depth.toFixed(1)})`);

      const orderResp = await client.createAndPostMarketOrder({
        tokenID: sig.targetTokenId,
        price: sig.targetPrice,
        amount: sig.bulletSizeUSDC,
        side: Side.BUY
      }, undefined, OrderType.FOK as any);

      if (orderResp && (orderResp.success || orderResp.orderID)) {
        const shares = Math.floor(sig.bulletSizeUSDC / sig.targetPrice);
        const pos: PositionRecord = {
          id: orderResp.orderID || `LIVE_${Date.now()}`,
          coin: sig.coin,
          strategy: sig.strategy,
          side: sig.targetSide,
          tokenId: sig.targetTokenId,
          entryPrice: sig.targetPrice,
          shares: shares,
          investedUSDC: sig.bulletSizeUSDC,
          status: 'OPEN',
          entryTimestamp: Date.now()
        };

        this.positions.unshift(pos);
        this.recentLiveExecutions.push(pos);
        this.localCycleFills.push({
          coin: sig.coin,
          side: sig.targetSide,
          investedUSDC: sig.bulletSizeUSDC,
          timestamp: Date.now()
        });
        this.stateManager.addFill({
          coin: sig.coin,
          side: sig.targetSide,
          investedUSDC: sig.bulletSizeUSDC,
          timestamp: Date.now()
        });
        await this.refreshWalletBalances();

        console.log(`✅ [LIVE FILL] Orden FOK confirmada con éxito. ID: ${pos.id}`);
        this.emit('position_opened', pos);
        return true;
      } else {
        console.warn(`❌ [LIVE REJECTED] Orden FOK rechazada por Polymarket API: ${JSON.stringify(orderResp)}`);
        return false;
      }
    } catch (err: any) {
      console.error(`❌ [LIVE ERROR] Error enviando orden a Polymarket: ${err.message}`);
      return false;
    }
  }

  public getPositions(): PositionRecord[] {
    return this.positions;
  }

  public getOpenPositions(): PositionRecord[] {
    return this.positions.filter(p => p.status === 'OPEN');
  }

  public getBalances() {
    return {
      total: this.totalBalanceUSDC + this.inOrdersUSDC,
      free: this.availableBalanceUSDC,
      locked: this.inOrdersUSDC,
      mode: this.mode
    };
  }
}
