import { BinanceWebsocketEngine, BinanceTickerState } from './connectors/BinanceWebsocket';

console.log("=================================================================");
console.log("🚀 CRIPTOBOT v2.0 - PRUEBA DE LATENCIA DE STREAMING BINANCE SPOT");
console.log("=================================================================\n");

const engine = new BinanceWebsocketEngine();

let tickCount = 0;

engine.on('ticker', (state: BinanceTickerState) => {
  tickCount++;
  const timeStr = new Date().toLocaleTimeString('es-CL', { hour12: false });
  const sign = state.deltaPct >= 0 ? '+' : '';
  
  console.log(
    `[${timeStr}] ⚡ Tic #${tickCount.toString().padStart(4, '0')} | ` +
    `Coin: ${state.coin.padEnd(5)} | ` +
    `Spot: $${state.currentPrice.toFixed(4).padStart(8)} | ` +
    `1H Open: $${state.openPrice1H.toFixed(4).padStart(8)} | ` +
    `Delta: ${sign}${state.deltaPct.toFixed(2)}% | ` +
    `Trend: ${state.trend.padEnd(7)} | ` +
    `Latencia: ${state.latencyMs}ms`
  );
});

engine.start();

// Run for 15 seconds then exit cleanly
setTimeout(() => {
  console.log("\n=================================================================");
  console.log(`✅ FASE 1 COMPLETADA CON ÉXITO: ${tickCount} tics procesados.`);
  console.log("=================================================================");
  engine.stop();
  process.exit(0);
}, 15000);
