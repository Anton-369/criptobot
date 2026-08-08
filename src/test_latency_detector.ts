import { BinanceWebsocketEngine } from './connectors/BinanceWebsocket';
import { PolymarketClobConnector } from './connectors/PolymarketClob';
import { MomentumDetector, OpportunitySignal } from './engine/MomentumDetector';

console.log("=================================================================");
console.log("🎯 CRIPTOBOT v2.0 - PRUEBA EN VIVO FASE 2: DETECTOR DE LATENCIA");
console.log("=================================================================\n");

const binanceWs = new BinanceWebsocketEngine();
const polyClob = new PolymarketClobConnector();
const detector = new MomentumDetector(binanceWs, polyClob);

let signalsDetected = 0;

detector.on('opportunity', (sig: OpportunitySignal) => {
  signalsDetected++;
  const timeStr = new Date(sig.timestamp).toLocaleTimeString('es-CL', { hour12: false });
  
  console.log(`\n🚨 [${timeStr}] OPORTUNIDAD DETECTADA (#${signalsDetected})`);
  console.log(`   Coin:      ${sig.coin}`);
  console.log(`   Estrategia:${sig.strategy}`);
  console.log(`   Lado:      ${sig.targetSide}`);
  console.log(`   Precio:    $${sig.targetPrice.toFixed(3)}`);
  console.log(`   Bala:      $${sig.bulletSizeUSDC.toFixed(2)} USDC`);
  console.log(`   Spot Delta:${sig.spotDeltaPct > 0 ? '+' : ''}${sig.spotDeltaPct.toFixed(2)}%`);
  console.log(`   Minuto:    Min ${sig.cycleMinute}`);
  console.log(`   Razón:     ${sig.reason}`);
});

async function main() {
  console.log("[Phase2] Consultando mercados de 1 Hora activos en Polymarket...");
  const markets = await polyClob.fetchActive1HMarkets();
  
  console.log(`[Phase2] Mercados activos de 1H encontrados: ${markets.size}`);
  for (const [coin, m] of markets.entries()) {
    console.log(`   - ${coin}: ${m.question} (ConditionId: ${m.conditionId.substring(0, 10)}...)`);
  }

  // Start Binance Stream and Latency Detector
  binanceWs.start();
  detector.start(2000);

  // Monitor for 20 seconds
  setTimeout(() => {
    console.log("\n=================================================================");
    console.log(`✅ FASE 2 COMPLETADA CON ÉXITO: Mercado consultado y ${signalsDetected} señales evaluadas.`);
    console.log("=================================================================");
    detector.stop();
    binanceWs.stop();
    process.exit(0);
  }, 20000);
}

main().catch(err => console.error("Error en test de Fase 2:", err));
