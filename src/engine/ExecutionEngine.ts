import { EventEmitter } from 'events';
import { ClobClient } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { CONFIG } from '../config/environment';
import { OpportunitySignal } from './MomentumDetector';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';

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
  
  // Real-time wallet tracking
  private totalBalanceUSDC: number = 0;
  private availableBalanceUSDC: number = 0;
  private inOrdersUSDC: number = 0;

  constructor(polyClob: PolymarketClobConnector) {
    super();
    this.polyClob = polyClob;
    this.mode = CONFIG.EXECUTION_MODE;
  }

  public async initialize(): Promise<void> {
    console.log(`[ExecutionEngine] 🚀 Inicializando motor en MODO: ${this.mode}`);
    await this.refreshWalletBalances();
    await this.fetchLiveWalletPositions();
  }

  public async fetchLiveWalletPositions(): Promise<PositionRecord[]> {
    try {
      const url = `https://data-api.polymarket.com/positions?user=${CONFIG.PROXY_WALLET}&sizeThreshold=0`;
      const resp = await fetch(url);
      if (resp.ok) {
        const rawPositions: any = await resp.json();
        if (Array.isArray(rawPositions)) {
          const livePos: PositionRecord[] = rawPositions
            .filter((p: any) => (parseFloat(p.size) || 0) > 0)
            .map((p: any) => ({
              id: p.conditionId || p.asset,
              coin: p.title?.toUpperCase().includes('XRP') ? 'XRP' :
                    p.title?.toUpperCase().includes('SOL') ? 'SOL' :
                    p.title?.toUpperCase().includes('DOGE') ? 'DOGE' : 'CLIMA/WASHY',
              strategy: 'WASHY/LEGACY',
              side: (p.outcome || 'YES').toUpperCase() as any,
              tokenId: p.asset,
              entryPrice: parseFloat(p.avgPrice) || 0,
              shares: parseFloat(p.size) || 0,
              investedUSDC: parseFloat(p.initialValue) || 0,
              currentValueUSDC: parseFloat(p.currentValue) || 0,
              status: 'OPEN',
              entryTimestamp: Date.now(),
              title: p.title
            }));

          // Merge live wallet positions with active local Criptobot SHADOW positions (< 60 mins old)
          const ONE_HOUR_MS = 60 * 60 * 1000;
          const shadowPos = this.positions.filter(p => {
            if (p.id.startsWith('SHADOW_')) {
              return (Date.now() - p.entryTimestamp) < ONE_HOUR_MS;
            }
            return p.id.startsWith('LIVE_');
          });
          this.positions = [...shadowPos, ...livePos];
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
    } catch (err: any) {
      console.warn(`[ExecutionEngine] No se pudo obtener saldo en vivo: ${err.message}`);
    }

    // Calculate in-orders locked capital from active positions
    const openPositions = this.positions.filter(p => p.status === 'OPEN');
    this.inOrdersUSDC = openPositions.reduce((sum, p) => sum + (p.currentValueUSDC || p.investedUSDC), 0);
    this.availableBalanceUSDC = Math.max(0, this.totalBalanceUSDC);

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
    // Refresh live wallet state first
    await this.refreshWalletBalances();

    // Check if free balance is sufficient
    if (this.availableBalanceUSDC < sig.bulletSizeUSDC) {
      console.warn(`[ExecutionEngine] ⚠️ Saldo disponible insuficiente ($${this.availableBalanceUSDC.toFixed(2)} USD) para la bala ($${sig.bulletSizeUSDC.toFixed(2)} USD)`);
      return false;
    }

    // Filter active open positions for this coin in the current 1H cycle
    const currentCyclePositions = this.positions.filter(
      p => p.coin === sig.coin && p.status === 'OPEN' && (Date.now() - p.entryTimestamp) < 60 * 60 * 1000
    );

    const isInsuranceSig = sig.bulletSizeUSDC <= 1.0;

    if (isInsuranceSig) {
      // Max 1 Insurance Bullet per coin per 1H cycle
      const hasInsurance = currentCyclePositions.some(p => p.investedUSDC <= 1.0);
      if (hasInsurance) {
        return false;
      }
    } else {
      // Max 2 Main Directional Bullets ($2.00 each) per coin per 1H cycle
      const mainBulletsCount = currentCyclePositions.filter(p => p.investedUSDC > 1.0).length;
      if (mainBulletsCount >= 2) {
        return false;
      }
    }

    // Cooldown: Minimum 3 minutes gap between any bullet entries on the same coin
    const hasRecentEntry = currentCyclePositions.some(p => (Date.now() - p.entryTimestamp) < 180000);
    if (hasRecentEntry) {
      return false;
    }

    if (this.mode === 'SHADOW') {
      return this.executeShadowFill(sig);
    } else {
      return this.executeLiveFOK(sig);
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

      // Off-chain EIP-712 Order Creation
      const orderResp = await client.createAndPostOrder({
        tokenID: sig.targetTokenId,
        price: sig.targetPrice,
        side: 'BUY' as any,
        size: sig.bulletSizeUSDC / sig.targetPrice,
        feeRateBps: 0
      });

      if (orderResp && orderResp.success) {
        const shares = sig.bulletSizeUSDC / sig.targetPrice;
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
        await this.refreshWalletBalances();

        console.log(`✅ [LIVE FILL] Orden FOK confirmada con éxito. ID: ${pos.id}`);
        this.emit('position_opened', pos);
        return true;
      } else {
        console.warn(`❌ [LIVE REJECTED] Orden FOK rechazada o sin profundidad suficiente.`);
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
