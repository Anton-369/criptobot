import { EventEmitter } from 'events';
import { ClobClient } from '@polymarket/clob-client';
import { Wallet, ethers } from 'ethers';
import { CONFIG } from '../config/environment';
import { OpportunitySignal } from './MomentumDetector';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';

export interface PositionRecord {
  id: string;
  coin: string;
  strategy: string;
  side: 'UP' | 'DOWN';
  tokenId: string;
  entryPrice: number;
  shares: number;
  investedUSDC: number;
  status: 'OPEN' | 'WIN' | 'LOSS' | 'SOLD_TP';
  entryTimestamp: number;
  resolvedTimestamp?: number;
  pnlUSDC?: number;
}

export class ExecutionEngine extends EventEmitter {
  private polyClob: PolymarketClobConnector;
  private mode: 'SHADOW' | 'LIVE';
  private positions: PositionRecord[] = [];
  
  // Real-time wallet tracking
  private totalBalanceUSDC: number = CONFIG.TOTAL_MAX_CAPITAL_USDC;
  private availableBalanceUSDC: number = CONFIG.TOTAL_MAX_CAPITAL_USDC;
  private inOrdersUSDC: number = 0;

  constructor(polyClob: PolymarketClobConnector) {
    super();
    this.polyClob = polyClob;
    this.mode = CONFIG.EXECUTION_MODE;
  }

  public async initialize(): Promise<void> {
    console.log(`[ExecutionEngine] 🚀 Inicializando motor en MODO: ${this.mode}`);
    await this.refreshWalletBalances();
  }

  public async refreshWalletBalances(): Promise<{ total: number; free: number; locked: number }> {
    try {
      if (this.mode === 'LIVE' && CONFIG.PK) {
        const client = this.polyClob.getClobClient();
        if (client) {
          // Query live balance allowance from Polymarket CLOB API
          const balResp: any = await client.getBalanceAllowance();
          if (balResp && typeof balResp.balance !== 'undefined') {
            const rawBal = parseFloat(balResp.balance) / 1e6; // USDC 6 decimals
            if (!isNaN(rawBal) && rawBal > 0) {
              this.totalBalanceUSDC = rawBal;
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[ExecutionEngine] No se pudo obtener saldo en vivo: ${err.message}`);
    }

    // Calculate in-orders locked capital from active positions
    const openPositions = this.positions.filter(p => p.status === 'OPEN');
    this.inOrdersUSDC = openPositions.reduce((sum, p) => sum + p.investedUSDC, 0);
    this.availableBalanceUSDC = Math.max(0, this.totalBalanceUSDC - this.inOrdersUSDC);

    const result = {
      total: this.totalBalanceUSDC,
      free: this.availableBalanceUSDC,
      locked: this.inOrdersUSDC
    };

    this.emit('balance_updated', result);
    return result;
  }

  public async executeSignal(sig: OpportunitySignal): Promise<boolean> {
    // Check if free balance is sufficient
    if (this.availableBalanceUSDC < sig.bulletSizeUSDC) {
      console.warn(`[ExecutionEngine] ⚠️ Saldo disponible insuficiente ($${this.availableBalanceUSDC.toFixed(2)} USD) para la bala ($${sig.bulletSizeUSDC.toFixed(2)} USD)`);
      return false;
    }

    // Prevent duplicate entries on same coin in same minute
    const hasActiveSameCoin = this.positions.some(
      p => p.coin === sig.coin && p.status === 'OPEN' && (Date.now() - p.entryTimestamp) < 180000
    );
    if (hasActiveSameCoin) {
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
      total: this.totalBalanceUSDC,
      free: this.availableBalanceUSDC,
      locked: this.inOrdersUSDC,
      mode: this.mode
    };
  }
}
