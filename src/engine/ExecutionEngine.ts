import { EventEmitter } from 'events';
import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { CONFIG } from '../config/environment';
import { OpportunitySignal } from './MomentumDetector';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';
import { StateManager, PersistedFill } from './StateManager';
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

  public async initialize(): Promise<void> {
    console.log(`[ExecutionEngine] 🚀 Inicializando motor en MODO: ${this.mode}`);

    // Load persisted state from previous runs (survives restarts)
    const persistedFills = this.stateManager.getCycleFills();
    const nowMs = Date.now();
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
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' }
      });
      if (resp.ok) {
        const rawPositions: any = await resp.json();
        if (Array.isArray(rawPositions)) {
          // Build lookup of existing positions to preserve original entryTimestamp
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
                    p.title?.toUpperCase().includes('BNB') ? 'BNB' :
                      p.title?.toUpperCase().includes('HYPE') ? 'HYPE' : 'CLIMA/WASHY',
              strategy: 'WASHY/LEGACY',
              side: (p.outcome || 'YES').toUpperCase() as any,
              tokenId: p.asset,
              entryPrice: parseFloat(p.avgPrice) || 0,
              shares: parseFloat(p.size) || 0,
              investedUSDC: parseFloat(p.initialValue) || 0,
              currentValueUSDC: parseFloat(p.currentValue) || 0,
              status: 'OPEN',
              // Preserve original timestamp if position already known; use Date.now() only for new positions
              entryTimestamp: existingTimestamps.get(p.asset) || Date.now(),
              title: p.title
            }));

          // Preserve recent local LIVE executions (< 5 mins) to prevent Polymarket Data API indexing lag from wiping local state
          const FIVE_MIN_MS = 5 * 60 * 1000;
          this.recentLiveExecutions = this.recentLiveExecutions.filter(p => (Date.now() - p.entryTimestamp) < FIVE_MIN_MS);

          const ONE_HOUR_MS = 60 * 60 * 1000;
          const shadowPos = this.positions.filter(p => p.id.startsWith('SHADOW_') && (Date.now() - p.entryTimestamp) < ONE_HOUR_MS);
          
          // Deduplicate live positions by tokenId/asset
          const combined = [...this.recentLiveExecutions, ...livePos, ...shadowPos];
          const uniqueMap = new Map<string, PositionRecord>();
          for (const pos of combined) {
            const key = `${pos.coin}_${pos.side}_${pos.tokenId}`;
            if (!uniqueMap.has(key) || (uniqueMap.get(key)!.investedUSDC < pos.investedUSDC)) {
              uniqueMap.set(key, pos);
            }
          }
          this.positions = Array.from(uniqueMap.values());
        }
      }
    } catch (err: any) {
      console.warn(`[ExecutionEngine] Error consultando posiciones en vivo de la wallet: ${err.message}`);
    }

    return this.positions;
  }

  public async refreshWalletBalances(): Promise<{ total: number; free: number; locked: number; nativeGasPOL: number }> {
    let maticGas = 0;
    try {
      // 1. Fetch live open positions first to ensure locked capital is up to date
      await this.fetchLiveWalletPositions();

      // 2. Check Native POL/MATIC gas balance on Polygon RPC for EOA Wallet
      const respGas = await fetch(CONFIG.POLYGON_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [CONFIG.EOA_WALLET, 'latest'],
          id: 1
        })
      });
      if (respGas.ok) {
        const jsonGas: any = await respGas.json();
        if (jsonGas.result && jsonGas.result !== '0x') {
          maticGas = parseInt(jsonGas.result, 16) / 1e18;
        }
      }

      // 3. Query Polymarket CLOB Collateral balance (SignatureType 3 / Poly Proxy)
      const polyClobCash = await this.polyClob.getCollateralBalance();

      // 4. Check Native USDC and USDC.e balance on Polygon RPC for EOA & Proxy Wallets
      const usdcNativeContract = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
      const usdcBridgedContract = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

      let rpcCashUSDC = 0;

      for (const walletAddr of [CONFIG.PROXY_WALLET, CONFIG.EOA_WALLET]) {
        for (const contract of [usdcNativeContract, usdcBridgedContract]) {
          try {
            const resp = await fetch(CONFIG.POLYGON_RPC_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [{
                  to: contract,
                  data: `0x70a08231000000000000000000000000${walletAddr.substring(2)}`
                }, 'latest'],
                id: 1
              })
            });

            if (resp.ok) {
              const resJson: any = await resp.json();
              if (resJson.result && resJson.result !== '0x') {
                const val = parseInt(resJson.result, 16) / 1e6;
                rpcCashUSDC += val;
              }
            }
          } catch (e) {
            // Ignore single contract failures
          }
        }
      }

      (this as any).nativeGasPOL = maticGas;
      this.totalBalanceUSDC = polyClobCash > 0 ? polyClobCash : rpcCashUSDC;

      // Fallback: if CLOB balance query returns 0 (v5 POLY_PROXY limitation),
      // estimate from Data API positions total value
      if (this.totalBalanceUSDC <= 0 && this.positions.length > 0) {
        const posTotal = this.positions.reduce((sum, p) => sum + (p.currentValueUSDC || p.investedUSDC), 0);
        if (posTotal > 0) {
          this.totalBalanceUSDC = posTotal;
        }
      }
    } catch (err: any) {
      console.warn(`[ExecutionEngine] No se pudo obtener saldo en vivo: ${err.message}`);
    }

    // Calculate in-orders locked capital from active positions
    // Only count positions with actual value (>0). Resolved/dead positions (value=0) = freed capital.
    const openPositions = this.positions.filter(p => p.status === 'OPEN');
    this.inOrdersUSDC = openPositions.reduce((sum, p) => {
      if (p.currentValueUSDC !== undefined && p.currentValueUSDC !== null) {
        return sum + p.currentValueUSDC; // use actual value (may be 0 = resolved)
      }
      return sum + p.investedUSDC; // fallback for positions not yet fetched from API
    }, 0);
    // Available = liquid CLOB cash minus what's locked in open positions
    this.availableBalanceUSDC = Math.max(0, this.totalBalanceUSDC - this.inOrdersUSDC);

    const result = {
      total: this.totalBalanceUSDC + this.inOrdersUSDC, // Total Portfolio Value (Cash + Positions)
      free: this.totalBalanceUSDC,                     // Free Liquid USDC Cash
      locked: this.inOrdersUSDC,                        // In active positions
      nativeGasPOL: maticGas                            // Native Gas
    };

    this.emit('balance_updated', result);
    return result;
  }

  public async executeSignal(sig: OpportunitySignal): Promise<boolean> {
    if (this.isExecutingSignal) {
      console.warn(`[ExecutionEngine] ⚠️ Lock activo. Ignorando señal concurrente para ${sig.coin} (${sig.strategy}).`);
      return false;
    }

    this.isExecutingSignal = true;

    try {
      // Refresh live wallet state first
      await this.refreshWalletBalances();

      // Check if free balance is sufficient
      if (this.availableBalanceUSDC < sig.bulletSizeUSDC) {
        console.warn(`[ExecutionEngine] ⚠️ Saldo disponible insuficiente ($${this.availableBalanceUSDC.toFixed(2)} USD) para la bala ($${sig.bulletSizeUSDC.toFixed(2)} USD)`);
        return false;
      }

      // Cycle start anchored to UTC :00 to match Polymarket cycle boundaries
      const nowUtc = new Date();
      const cycleStartMs = Date.UTC(
        nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate(),
        nowUtc.getUTCHours(), 0, 0, 0
      );

      // Clean local cycle fills older than current 1H cycle
      this.localCycleFills = this.localCycleFills.filter(f => f.timestamp >= cycleStartMs);
      this.stateManager.cleanCycleFills(cycleStartMs);

      // Filter active open positions for this coin in current cycle from both wallet and local fills
      const currentLocalFills = this.localCycleFills.filter(f => f.coin === sig.coin);
      const currentWalletPositions = this.positions.filter(
        p => p.coin === sig.coin && p.status === 'OPEN'
      );

      const isInsuranceSig = sig.bulletSizeUSDC <= 1.0;

      if (isInsuranceSig) {
        // STRICT SAFETY RULE: Insurance bullets MUST have an open main directional position (> $1.0) in the opposite direction
        const hasOppositeMainBullet = currentLocalFills.some(f => f.investedUSDC > 1.0 && f.side !== sig.targetSide) ||
          currentWalletPositions.some(p => p.investedUSDC > 1.0 && p.side !== sig.targetSide);
        if (!hasOppositeMainBullet) {
          console.warn(`[ExecutionEngine] ⛔ Seguro rechazado: No existe bala principal opuesta en ${sig.coin} para asegurar.`);
          return false;
        }

        // Max 1 Insurance Bullet per coin per 1H cycle
        const hasInsurance = currentLocalFills.some(f => f.investedUSDC <= 1.0) ||
          currentWalletPositions.some(p => p.investedUSDC <= 1.0);
        if (hasInsurance) {
          return false;
        }

        // Also check total exposure (insurance + main) doesn't exceed per-coin cap
        const localInsInvested = currentLocalFills
          .filter(f => f.investedUSDC <= 1.0)
          .reduce((sum, f) => sum + f.investedUSDC, 0);
        const localMainInvestedIns = currentLocalFills
          .filter(f => f.investedUSDC > 1.0)
          .reduce((sum, f) => sum + f.investedUSDC, 0);
        const coinCap = CONFIG.TOTAL_MAX_CAPITAL_USDC / 5; // $5.00 per coin
        if (localMainInvestedIns + localInsInvested + sig.bulletSizeUSDC > coinCap) {
          console.warn(`[ExecutionEngine] ⛔ Seguro excedería límite de $${coinCap.toFixed(2)} en ${sig.coin}.`);
          return false;
        }
      } else {
        // Calculate max exposure from both local fills and API wallet state
        const localMainInvested = currentLocalFills
          .filter(f => f.investedUSDC > 1.0)
          .reduce((sum, f) => sum + f.investedUSDC, 0);

        const walletMainInvested = currentWalletPositions
          .filter(p => p.investedUSDC > 1.0)
          .reduce((sum, p) => sum + p.investedUSDC, 0);

        const totalMainInvested = Math.max(localMainInvested, walletMainInvested);
        const coinCap = CONFIG.TOTAL_MAX_CAPITAL_USDC / 5; // $5.00 per coin

        if (totalMainInvested + sig.bulletSizeUSDC > coinCap) {
          console.warn(`[ExecutionEngine] ⛔ Límite alcanzado: Exposición máxima en ${sig.coin} superaría $${coinCap.toFixed(2)} USD ($${totalMainInvested.toFixed(2)} ya invertidos).`);
          return false;
        }
      }

      // Cooldown: Minimum 3 minutes (180,000ms) gap between any bullet entries on the same coin
      const lastFillTimestamp = Math.max(
        0,
        ...currentLocalFills.map(f => f.timestamp),
        ...currentWalletPositions.map(p => p.entryTimestamp)
      );

      if (lastFillTimestamp > 0 && (Date.now() - lastFillTimestamp) < 180000) {
        const remainingSec = Math.ceil((180000 - (Date.now() - lastFillTimestamp)) / 1000);
        console.warn(`[ExecutionEngine] ⏳ Cooldown activo para ${sig.coin}: Faltan ${remainingSec}s para el próximo disparo.`);
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

    console.log(`\n👻 [SHADOW EXECUTION] Orden Límite FOK Simulada Favorable`);
    console.log(`   Coin:     ${pos.coin} | Lado: ${pos.side}`);
    console.log(`   Estrategia:${pos.strategy}`);
    console.log(`   Precio:   $${pos.entryPrice.toFixed(3)} | Acciones: ${pos.shares.toFixed(2)}`);
    console.log(`   Invertido:$${pos.investedUSDC.toFixed(2)} USDC`);

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
      console.log(`\n💥 [LIVE FOK EXECUTION] Enviando orden FOK de $${sig.bulletSizeUSDC.toFixed(2)} USD a Polymarket...`);

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
        console.warn(`❌ [LIVE REJECTED] Orden FOK rechazada: ${JSON.stringify(orderResp)}`);
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
      nativeGasPOL: (this as any).nativeGasPOL || 0,
      mode: this.mode
    };
  }
}
