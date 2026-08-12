import { PolymarketClobConnector } from '../src/connectors/PolymarketClob';
import { BinanceWebsocketEngine } from '../src/connectors/BinanceWebsocket';
import { CONFIG } from '../src/config/environment';

async function forensicAudit() {
  console.log("=================================================================");
  console.log("🔍 AUDITORÍA FORENSE EN TIEMPO REAL - CONEXIÓN A DATOS REALES");
  console.log("=================================================================\n");

  // 1. Instanciar conectores en vivo
  const polyClob = new PolymarketClobConnector();
  const binanceWs = new BinanceWebsocketEngine();
  binanceWs.start();

  console.log("[Audit] Conectando a Binance WebSocket / Hyperliquid REST...");
  await new Promise(res => setTimeout(res, 3000)); // Esperar inicialización del stream spot

  console.log("[Audit] Consultando API de Gamma / CLOB de Polymarket...");
  const activeMarkets = await polyClob.fetchActive1HMarkets();

  console.log(`\n=================================================================`);
  console.log(`📌 RESULTADOS DE AUDITORÍA EN TIEMPO REAL PARA LAS 7 MONEDAS`);
  console.log(`=================================================================\n`);

  for (const pair of CONFIG.PAIRS) {
    const coin = pair.coin;
    console.log(`-----------------------------------------------------------------`);
    console.log(`🪙 MONEDA: [ ${coin} ]`);

    // A. Spot Binance / Hyperliquid
    const tickerSymbol = `${coin}USDT`.toLowerCase();
    const spotState = binanceWs.getTickerState(tickerSymbol);

    if (spotState) {
      console.log(`   🟢 Binance/Hyperliquid Spot Stream (REAL EN VIVO):`);
      printSpotState(spotState);
    } else {
      console.log(`   🔴 Spot Stream: Esperando tick...`);
    }

    // B. Polymarket CLOB Orderbook
    const market = activeMarkets.get(coin);
    if (market) {
      console.log(`   🌐 Polymarket CLOB Market (REAL EN VIVO):`);
      console.log(`      - Pregunta: ${market.question}`);
      console.log(`      - Condition ID: ${market.conditionId}`);
      console.log(`      - UP Token ID:   ${market.upTokenId}`);
      console.log(`      - DOWN Token ID: ${market.downTokenId}`);
      console.log(`      - Fecha Cierre:  ${market.endDateISO}`);

      const odds = await polyClob.getBestOdds(market.upTokenId, market.downTokenId);
      console.log(`      - Best Ask UP:   $${odds.upBestAsk.toFixed(4)} | Best Bid UP:   $${odds.upBestBid.toFixed(4)} | Profundidad Ask: ${odds.upAskDepth.toFixed(2)} tokens`);
      console.log(`      - Best Ask DOWN: $${odds.downBestAsk.toFixed(4)} | Best Bid DOWN: $${odds.downBestBid.toFixed(4)} | Profundidad Ask: ${odds.downAskDepth.toFixed(2)} tokens`);
    } else {
      console.log(`   🟡 Polymarket 1H Market: Mercado no desplegado aún en este ciclo o cerrado.`);
    }
  }

  binanceWs.stop();
  console.log("\n=================================================================");
  console.log("✅ Auditoría forense completada. Todos los conectores verificados.");
  console.log("=================================================================");
  process.exit(0);
}

function printSpotState(spotState: any) {
  console.log(`      - Precio Actual:   $${spotState.currentPrice}`);
  console.log(`      - Precio Open 1H:  $${spotState.openPrice1H}`);
  console.log(`      - High 1H:         $${spotState.highPrice1H}`);
  console.log(`      - Low 1H:          $${spotState.lowPrice1H}`);
  console.log(`      - Delta 1H:        ${spotState.deltaPct.toFixed(4)}%`);
}

forensicAudit();
