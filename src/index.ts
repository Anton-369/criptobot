import { BinanceWebsocketEngine } from './connectors/BinanceWebsocket';
import { PolymarketClobConnector } from './connectors/PolymarketClob';
import { MomentumDetector, OpportunitySignal } from './engine/MomentumDetector';
import { ExecutionEngine } from './engine/ExecutionEngine';
import { DashboardServer } from './dashboard/server';
import { CONFIG } from './config/environment';

async function main() {
  console.log("=================================================================");
  console.log("⚡ CRIPTOBOT v2.0 - ULTRA-FAST LATENCY SNIPER BOT ENGINE");
  console.log(`📌 Modo de Ejecución: ${CONFIG.EXECUTION_MODE}`);
  console.log("=================================================================\n");

  // 1. Initialize Polymarket CLOB Connector
  const polyClob = new PolymarketClobConnector();
  console.log("[Main] Consultando mercados de 1 Hora activos en Polymarket...");
  const activeMarkets = await polyClob.fetchActive1HMarkets();
  console.log(`[Main] ✅ Mercados cripto activos vinculados: ${activeMarkets.size}`);
  for (const [coin, m] of activeMarkets.entries()) {
    console.log(`   - ${coin}: ${m.question}`);
  }

  // 2. Initialize Binance Spot Stream Engine
  const binanceWs = new BinanceWebsocketEngine();
  binanceWs.start();

  // 3. Initialize Execution Engine & Wallet Reconciliation
  const execEngine = new ExecutionEngine(polyClob);
  await execEngine.initialize();

  // 4. Initialize Momentum Detector & Signal Handler
  const detector = new MomentumDetector(binanceWs, polyClob);
  
  detector.on('opportunity', async (sig: OpportunitySignal) => {
    console.log(`\n🎯 [GATILLO DE LATENCIA] Señal recibida para ${sig.coin} (${sig.strategy})`);
    console.log(`   Razón: ${sig.reason}`);
    
    // Execute FOK Order (Shadow or Live)
    const success = await execEngine.executeSignal(sig);
    if (success) {
      console.log(`   ✅ Ejecución completada exitosamente.`);
    }
  });

  detector.start(2000);

  // 5. Start Real-time Web Control Dashboard
  const dashboard = new DashboardServer(binanceWs, polyClob, execEngine, 8505);
  dashboard.start();

  console.log("\n🚀 Criptobot v2.0 funcionando en segundo plano. Esperando gatillos de latencia...");
}

main().catch(err => {
  console.error("❌ Error crítico en inicio de Criptobot v2.0:", err);
});
