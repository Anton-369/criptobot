/**
 * ⚡ CRIPTOBOT V4 HFT - MAIN ENTRY POINT
 * Arquitectura Híbrida V4 - Dynamic Token Discovery, Pre-Warmed Sockets & Native Klines
 * 
 * Corre de manera totalmente aislada sin modificar ni tocar V3.
 */

import { CONFIG } from '../config/environment';
import { LocalOrderbookManager, TokenMapping } from './LocalOrderbook';
import { HFTReactiveEngine } from './HFTReactiveEngine';
import { BinanceMultiFrameWS } from './BinanceMultiFrameWS';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';
import { DashboardBridgeV4 } from './DashboardBridgeV4';

async function startV4Engine() {
  console.log("=================================================================");
  console.log("⚡ CRIPTOBOT v4.0 - HYBRID HFT REACTIVE ENGINE");
  console.log(`📌 Modo de Ejecución: ${CONFIG.EXECUTION_MODE} (100% SEGURO)`);
  console.log(`🔐 Wallet Proxy: ${CONFIG.PROXY_WALLET}`);
  console.log("=================================================================\n");

  // 0. Inicializar Servidor de Dashboard V4 (Puerto 8507 para no colisionar con V3)
  const dashboardBridge = new DashboardBridgeV4(8507);
  dashboardBridge.start();

  // 1. Discovery Dinámico de Tokens Reales de Polymarket
  const polyClob = new PolymarketClobConnector();
  console.log("[Main V4] 🔍 Obteniendo Token IDs reales de 77 dígitos desde Polymarket...");
  const activeMarkets = await polyClob.fetchActive1HMarkets();

  const tokenMappings: TokenMapping[] = [];
  for (const [coin, market] of activeMarkets.entries()) {
    if (market.upTokenId) {
      tokenMappings.push({ tokenId: market.upTokenId, coin, side: 'UP', timeframe: '1H' });
    }
    if (market.downTokenId) {
      tokenMappings.push({ tokenId: market.downTokenId, coin, side: 'DOWN', timeframe: '1H' });
    }
  }

  console.log(`[Main V4] ✅ Mapeados ${tokenMappings.length} Token IDs reales dinámicos.`);

  // 2. Inicializar Reconstructor del Libro Local
  const orderbook = new LocalOrderbookManager();
  orderbook.registerTokens(tokenMappings);
  orderbook.start();

  // 3. Inicializar Motor Reactivo en RAM
  const engine = new HFTReactiveEngine(orderbook);

  // 4. Conectar Streams Nativos Multiplexados de Binance (1H, 15M, 5M)
  const binanceMultiWs = new BinanceMultiFrameWS();
  binanceMultiWs.start();

  console.log('[Main V4] 🚀 Motor V4 HFT en RAM iniciado exitosamente.');
}

startV4Engine().catch((err) => {
  console.error('[Main V4] ❌ Error crítico iniciando V4:', err);
});
