/**
 * 🔐 POLYMARKET FAST SIGNER & OFFICIAL CLOB CLIENT CONNECTOR
 * Arquitectura Híbrida V4 - Ejecución de Órdenes FOK usando execute_live_order.js (ClobClient v2 + SOCKS5)
 */

import { CONFIG } from '../config/environment';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';
import { execSync } from 'child_process';

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
   * Ejecutar Orden FOK usando el conector probado execute_live_order.js
   */
  public async executeFOKOrder(params: FOKOrderParams): Promise<{ success: boolean; orderId?: string; error?: string }> {
    const startTime = Date.now();
    const shares = Math.floor(params.amountUsdc / params.price);

    if (CONFIG.EXECUTION_MODE !== 'LIVE') {
      console.log(`[FastSigner] 🛡️ [MODO SHADOW] SIMULACIÓN DE DISPARO FOK: ${params.coin} ${params.side} @ $${params.price} (${params.amountUsdc} USDC, ${shares} acciones) | TokenID: ${params.tokenId.substring(0, 15)}...`);
      return { success: true, orderId: `SHADOW_SIM_${Date.now()}` };
    }

    try {
      console.log(`[FastSigner] ⚡ ENVIANDO ORDEN FOK REAL EN VIVO: ${params.coin} ${params.side} ${shares} acc @ $${params.price} ($${params.amountUsdc} USDC)...`);

      const cmd = `NODE_PATH=/home/anton/criptobot/node_modules node /home/anton/oraculo-cripto/execute_live_order.js '${params.tokenId}' ${params.price} ${params.amountUsdc}`;
      const rawRes = execSync(cmd, { encoding: 'utf-8', timeout: 12000 });
      const latency = Date.now() - startTime;

      console.log(`[FastSigner] 💥 Respuesta Raw Exec: ${rawRes.trim()}`);

      let parsed: any;
      try {
        parsed = JSON.parse(rawRes.trim());
      } catch (e) {
        parsed = { success: false, error: rawRes };
      }

      if (parsed && parsed.success) {
        const orderId = parsed.response?.orderID || parsed.response?.orderId || `FOK_${Date.now()}`;
        console.log(`[FastSigner] ⚡ ✅ ORDEN FOK REAL MATCHED EN POLYMARKET EN ${latency}ms | OrderID: ${orderId}`);
        return { success: true, orderId };
      } else {
        const errorMsg = parsed.error || JSON.stringify(parsed);
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
