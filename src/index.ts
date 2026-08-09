import { BinanceWebsocketEngine } from './connectors/BinanceWebsocket';
import { PolymarketClobConnector } from './connectors/PolymarketClob';
import { MomentumDetector, OpportunitySignal } from './engine/MomentumDetector';
import { ExecutionEngine } from './engine/ExecutionEngine';
import { DashboardServer } from './dashboard/server';
import { MatrixCollector } from './analytics/MatrixCollector';
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

  // 3b. Initialize Matrix Analytics Collector (Simple & Deep Matrices for 7 coins)
  const matrixCollector = new MatrixCollector();
  binanceWs.on('ticker', (t) => {
    matrixCollector.processTick(t);
  });

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

  // 5. Periodic 60-second refresh to auto-bind new hourly market cycles & 1H open prices
  let lastHour = new Date().getHours();
  setInterval(async () => {
    try {
      await polyClob.fetchActive1HMarkets();
      await binanceWs.fetch1HOpenPrices();

      const currentHour = new Date().getHours();
      if (currentHour !== lastHour) {
        console.log(`[Main] ⏰ Cambio de ciclo de hora detectado (${lastHour}:00 -> ${currentHour}:00). Finalizando registros de matrices...`);
        matrixCollector.finalizeHourCycle(binanceWs.getAllTickerStates());
        lastHour = currentHour;
      }
    } catch (e: any) {
      console.error(`[Main] Error refrescando mercados de 1H: ${e.message}`);
    }
  }, 60000);

  // 5b. Periodic 10-second wallet reconciliation loop (Syncs manual web trades & live USDC cash)
  setInterval(async () => {
    try {
      await execEngine.refreshWalletBalances();
    } catch (e: any) {
      // Soft ignore RPC errors
    }
  }, 10000);

  // 6. Start Real-time Web Control Dashboard with Matrix Collector & Momentum Detector
  const dashboard = new DashboardServer(binanceWs, polyClob, execEngine, 8506, matrixCollector, detector);
  dashboard.start();

  console.log("\n🚀 Criptobot v2.0 funcionando en segundo plano. Esperando gatillos de latencia...");
}

main().catch(err => {
  console.error("❌ Error crítico en inicio de Criptobot v2.0:", err);
});
