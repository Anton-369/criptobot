import './logger'; // Timestamps on all console output
import { BinanceWebsocketEngine } from './connectors/BinanceWebsocket';
import { PolymarketClobConnector } from './connectors/PolymarketClob';
import { MomentumDetector, OpportunitySignal } from './engine/MomentumDetector';
import { ExecutionEngine } from './engine/ExecutionEngine';
import { DashboardServer } from './dashboard/server';
import { MatrixCollector } from './analytics/MatrixCollector';
import { CONFIG } from './config/environment';
import { PatternEngine, CoinPrediction } from './engine/PatternEngine';
import { DatabaseManager } from './storage/DatabaseManager';
import { PolymarketCollector } from './connectors/PolymarketCollector';
import * as path from 'path';
import { exec } from 'child_process';

async function main() {
  console.log("=================================================================");
  console.log("⚡ CRIPTOBOT v3.0 - ULTRA-FAST LATENCY SNIPER BOT ENGINE");
  console.log(`📌 Modo de Ejecución: ${CONFIG.EXECUTION_MODE}`);
  console.log("=================================================================\n");

  // 0. Initialize SQLite Database & Polymarket 24/7 Collector
  const dbManager = new DatabaseManager();

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

  // 3. Start 24/7 Polymarket Collector (Discovery bursts at :00 + 1-min snapshots + Spot prices + Klines)
  const polyCollector = new PolymarketCollector(polyClob, dbManager, binanceWs);
  await polyCollector.start();

  // 4. Initialize Execution Engine & Wallet Reconciliation
  const execEngine = new ExecutionEngine(polyClob);
  await execEngine.initialize();

  // 5. Initialize Pattern Engine (Oracle — predicts direction from historical cycles)
  const patternEngine = new PatternEngine(path.resolve(__dirname, '../data'));
  let currentOracle: CoinPrediction[] = [];

  // 6. Initialize Matrix Analytics Collector (Simple & Deep Matrices for 7 coins)
  const matrixCollector = new MatrixCollector();
  binanceWs.on('ticker', (t) => {
    matrixCollector.processTick(t);
  });

  // 7. Initialize Momentum Detector & Signal Handler
  const detector = new MomentumDetector(binanceWs, polyClob);
  
  detector.on('opportunity', async (sig: OpportunitySignal) => {
    console.log(`\n🎯 [GATILLO DE LATENCIA] Señal recibida para ${sig.coin} (${sig.strategy})`);
    console.log(`   Razón: ${sig.reason}`);

    // LOG PREDICTION TO SQLITE (FIX CRÍTICO: predicciones_log estaba vacía)
    const now = new Date();
    const etOffsetMs = 4 * 60 * 60 * 1000;
    const etDate = new Date(now.getTime() - etOffsetMs);
    const timestampET = etDate.toISOString().replace('T', ' ').slice(0, 19);
    try {
      await dbManager.logPrediction({
        timestampET,
        utcHour: now.getUTCHours(),
        coin: sig.coin,
        pUpEstimado: sig.targetSide === 'UP' ? (1.0 - sig.targetPrice) : sig.targetPrice,
        reglaActiva: sig.strategy,
        yesPriceAlDisparo: sig.targetPrice,
        disparoRealizado: true,
        pnlResultado: undefined,
        status: 'EJECUTADO'
      });
      console.log(`   📝 Predicción registrada en SQLite (predicciones_log).`);
    } catch (e: any) {
      console.warn(`   ⚠️ Error registrando predicción: ${e.message}`);
    }
    
    // Execute FOK Order (Shadow or Live)
    const success = await execEngine.executeSignal(sig);
    if (success) {
      console.log(`   ✅ Ejecución completada exitosamente.`);
    }
  });

  detector.start(2000);

  // Initial Oracle Prediction Log to SQLite on startup (5s after WS stream connects)
  setTimeout(async () => {
    try {
      const tickerStates = binanceWs.getAllTickerStates();
      if (tickerStates.length > 0) {
        const currentState = new Map<string, 'UP' | 'DOWN'>();
        for (const ts of tickerStates) {
          const dir = ts.deltaPct >= 0 ? 'UP' as const : 'DOWN' as const;
          currentState.set(ts.coin, dir);
        }
        currentOracle = patternEngine.predictAll(currentState);
        detector.setOracle(currentOracle);
        console.log(`[Oracle] 🔮 Predicciones iniciales de Oráculo cargadas y registradas en SQLite:`);
        console.log(patternEngine.summary(currentOracle));

        const now = new Date();
        const etOffsetMs = 4 * 60 * 60 * 1000;
        const etDate = new Date(now.getTime() - etOffsetMs);
        const timestampET = etDate.toISOString().replace('T', ' ').slice(0, 19);

        for (const pred of currentOracle) {
          if (pred.predictedSide !== 'NEUTRAL') {
            await dbManager.logPrediction({
              timestampET,
              utcHour: now.getUTCHours(),
              coin: pred.coin,
              pUpEstimado: pred.predictedSide === 'UP' ? (pred.confidencePct / 100) : (1.0 - pred.confidencePct / 100),
              reglaActiva: `ORACLE_${pred.predictedSide}_CONF_${pred.confidencePct}%`,
              disparoRealizado: false,
              status: 'PENDIENTE'
            });
          }
        }
      }
    } catch (e: any) {
      console.warn(`[Main] Error en predicciones iniciales: ${e.message}`);
    }
  }, 5000);

  // Event-Driven Market Binding & Open Price Retry Loop (runs at top of hour until confirmed)
  async function bindNewCycleMarketsWithRetry(maxAttempts: number = 6, delayMs: number = 5000): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[Main] 🔄 Vinculando mercados 1H e iniciando reintento de precios (${attempt}/${maxAttempts})...`);
        const activeMarkets = await polyClob.fetchActive1HMarkets();
        await binanceWs.fetch1HOpenPrices();
        if (activeMarkets.size >= 5) {
          console.log(`[Main] ✅ Reintento exitoso: ${activeMarkets.size} mercados cripto 1H vinculados en intento ${attempt}.`);
          break;
        }
      } catch (e: any) {
        console.warn(`[Main] ⚠️ Intento ${attempt} fallido vinculando mercados: ${e.message}`);
      }
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  // Event-Driven Prediction PnL Reconciliation (liquidates completed cycle predictions)
  async function reconcileCompletedCycleOutcomes(): Promise<void> {
    try {
      const logs = await dbManager.getPredictionLogs(50);
      const pendingLogs = logs.filter((l: any) => l.status === 'PENDIENTE' || l.status === 'EJECUTADO');
      if (pendingLogs.length === 0) return;

      console.log(`[Main] ⚖️ Reconciliando PnL/Resultados para ${pendingLogs.length} predicciones pendientes...`);
      for (const log of pendingLogs) {
        const pair = CONFIG.PAIRS.find((p: any) => p.coin === log.coin);
        if (!pair) continue;
        const ticker = binanceWs.getTickerState(pair.symbol);
        if (ticker && ticker.currentPrice > 0 && ticker.openPrice1H > 0) {
          const outcome = ticker.currentPrice >= ticker.openPrice1H ? 'UP' : 'DOWN';
          const predictedSide = (log.regla_activa && (log.regla_activa.includes('UP') || log.regla_activa.includes('up'))) ? 'UP' : 'DOWN';
          const won = outcome === predictedSide;
          const status = won ? 'GANADO' : 'PERDIDO';
          const pnl = won ? (log.yes_price_al_disparo ? (1.0 - log.yes_price_al_disparo) : 0.60) : -0.40;
          await dbManager.updatePredictionStatus(log.id, status, pnl);
          console.log(`   ⚖️ Predicción #${log.id} (${log.coin}): ${status} (PnL Est: $${pnl.toFixed(2)})`);
        }
      }
    } catch (e: any) {
      console.warn(`[Main] Error reconciliando predicciones: ${e.message}`);
    }
  }

  // 8. Periodic refresh loop with Event-Driven logic
  let lastHour = new Date().getUTCHours();
  let hasBoundThisHour = false;

  setInterval(async () => {
    try {
      const now = new Date();
      const currentHour = now.getUTCHours();
      const currentMinute = now.getUTCMinutes();

      // Autonomous AI Trigger: Run Python calibration script every hour at :05 UTC
      if (currentMinute === 5 && now.getUTCSeconds() <= 60) {
        console.log(`[AI Brain] 🤖 Ejecutando calibración autónoma NVIDIA Nemotron (calibrar_etapa1.py)...`);
        exec(`python3 ${path.resolve(__dirname, '../scripts/backtest_calibration.py')}`, (err, stdout, stderr) => {
          if (err) {
            console.warn(`[AI Brain] ⚠️ Error en calibración autónoma: ${err.message}`);
          } else {
            console.log(`[AI Brain] ✅ Calibración autónoma completada exitosamente.`);
          }
        });
      }

      // Event-driven UTC Hour Transition
      if (currentHour !== lastHour) {
        console.log(`[Main] ⏰ Cambio de ciclo UTC (${lastHour}:00 -> ${currentHour}:00).`);
        detector.recordHourOutcomes();
        matrixCollector.finalizeHourCycle(binanceWs.getAllTickerStates());
        hasBoundThisHour = false;

        // Reconcile completed hour predictions
        await reconcileCompletedCycleOutcomes();

        // Reload pattern engine with fresh data, then predict
        patternEngine.reload(path.resolve(__dirname, '../data'));
        const tickerStates = binanceWs.getAllTickerStates();
        const currentState = new Map<string, 'UP' | 'DOWN'>();
        for (const ts of tickerStates) {
          const dir = ts.deltaPct >= 0 ? 'UP' as const : 'DOWN' as const;
          currentState.set(ts.coin, dir);
        }
        currentOracle = patternEngine.predictAll(currentState);
        detector.setOracle(currentOracle);
        console.log(`[Oracle] 🔮 Predicciones para ciclo ${currentHour}:00 UTC:`);
        console.log(patternEngine.summary(currentOracle));

        // Log Oracle predictions to SQLite predicciones_log table
        const etOffsetMs = 4 * 60 * 60 * 1000;
        const etDate = new Date(now.getTime() - etOffsetMs);
        const timestampET = etDate.toISOString().replace('T', ' ').slice(0, 19);

        for (const pred of currentOracle) {
          if (pred.predictedSide !== 'NEUTRAL') {
            try {
              await dbManager.logPrediction({
                timestampET,
                utcHour: currentHour,
                coin: pred.coin,
                pUpEstimado: pred.predictedSide === 'UP' ? (pred.confidencePct / 100) : (1.0 - pred.confidencePct / 100),
                reglaActiva: `ORACLE_${pred.predictedSide}_CONF_${pred.confidencePct}%`,
                disparoRealizado: false,
                status: 'PENDIENTE'
              });
            } catch (e: any) {
              console.warn(`[Main] ⚠️ Error logueando predicción de Oráculo: ${e.message}`);
            }
          }
        }

        lastHour = currentHour;
      }

      // Smart Event-Driven Market Binding: retry during minutes 0-2 until bound, then stop REST spam
      if (!hasBoundThisHour && currentMinute <= 2) {
        await bindNewCycleMarketsWithRetry(3, 3000);
        hasBoundThisHour = true;
      }

    } catch (e: any) {
      console.error(`[Main] Error en ciclo de refresco: ${e.message}`);
    }
  }, 60000);

  // 9. Periodic 10-second wallet reconciliation loop
  setInterval(async () => {
    try {
      await execEngine.refreshWalletBalances();
    } catch (e: any) {
      // Soft ignore RPC errors
    }
  }, 10000);

  // 10. Start Real-time Web Control Dashboard
  const dashboard = new DashboardServer(binanceWs, polyClob, execEngine, 8506, matrixCollector, detector);
  dashboard.start();

  console.log("\n🚀 Criptobot v3.0 funcionando en segundo plano. Motor IA + Recolección SQLite 24/7 activos.");
}

main().catch(err => {
  console.error("❌ Error crítico en inicio de Criptobot v3.0:", err);
});

