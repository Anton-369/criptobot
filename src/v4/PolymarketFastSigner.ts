/**
 * 🔐 POLYMARKET FAST SIGNER & OFFICIAL CLOB CLIENT CONNECTOR
 * Arquitectura Híbrida V4 - Ejecución de Órdenes FOK usando @polymarket/clob-client
 */

import { CONFIG } from '../config/environment';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';
import { Side, OrderType } from '@polymarket/clob-client';

export interface FOKOrderParams {
  tokenId: string;
  price: number;
  amountUsdc: number;
  side: 'BUY' | 'SELL';
  coin: string;
}

export class PolymarketFastSigner {
  private clobConnector: PolymarketClobConnector;

  constructor() {
    this.clobConnector = new PolymarketClobConnector();
  }

  /**
   * Ejecutar Orden FOK usando el cliente oficial EIP-712 de Polymarket
   */
  public async executeFOKOrder(params: FOKOrderParams): Promise<{ success: boolean; orderId?: string; error?: string }> {
    const startTime = Date.now();
    const shares = Math.floor(params.amountUsdc / params.price);

    if (CONFIG.EXECUTION_MODE !== 'LIVE') {
      console.log(`[FastSigner] 🛡️ [MODO SHADOW] SIMULACIÓN DE DISPARO FOK: ${params.coin} ${params.side} @ $${params.price} (${params.amountUsdc} USDC, ${shares} acciones) | TokenID: ${params.tokenId.substring(0, 15)}...`);
      return { success: true, orderId: `SHADOW_SIM_${Date.now()}` };
    }

    try {
      const client = this.clobConnector.getClobClient();
      if (!client) {
        console.error('[FastSigner] ❌ Cliente CLOB no autenticado. Verifique PK / Credenciales en environment.');
        return { success: false, error: 'CLOB_CLIENT_NOT_AUTHENTICATED' };
      }

      console.log(`[FastSigner] ⚡ ENVIANDO ORDEN FOK REAL: ${params.coin} ${params.side} ${shares} acc @ $${params.price} ($${params.amountUsdc} USDC)...`);

      const unsignedOrder = await client.createOrder({
        tokenID: params.tokenId,
        price: params.price,
        side: params.side === 'BUY' ? Side.BUY : Side.SELL,
        size: shares,
        feeRateBps: 0
      });

      const resp: any = await client.postOrder(unsignedOrder, OrderType.FOK);
      const latency = Date.now() - startTime;

      if (resp && (resp.success || resp.orderID || resp.orderId)) {
        const orderId = resp.orderID || resp.orderId || `FOK_${Date.now()}`;
        console.log(`[FastSigner] ⚡ ✅ ORDEN FOK REAL EJECUTADA EN ${latency}ms | OrderID: ${orderId}`);
        return { success: true, orderId };
      } else {
        const errorMsg = JSON.stringify(resp);
        console.error(`[FastSigner] ❌ Rechazo CLOB en ${latency}ms: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    } catch (err: any) {
      const latency = Date.now() - startTime;
      console.error(`[FastSigner] ❌ Error ejecutando FOK (${latency}ms): ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
