import express from 'express';
import http from 'http';
import path from 'path';
import sqlite3 from 'sqlite3';
import { CONFIG } from './config/environment';
import { LocalOrderbookManager } from './v4/LocalOrderbook';
import { HFTReactiveEngine } from './v4/HFTReactiveEngine';
import { BinanceMultiFrameWS } from './v4/BinanceMultiFrameWS';
import { PolymarketClobConnector } from './connectors/PolymarketClob';
import { HFTSharedState } from './v4/HFTSharedState';

async function startV4Engine() {
  console.log('=================================================================');
  console.log('⚡ CRIPTOBOT v4.0 - HYBRID HFT REACTIVE ENGINE (EXCLUSIVO V4)');
  console.log(`📌 Modo de Ejecución: ${CONFIG.EXECUTION_MODE} (100% SEGURO)`);
  console.log(`🔐 Wallet Proxy: ${CONFIG.PROXY_WALLET}`);
  console.log('=================================================================\n');

  // 1. Discovery Dinámico de Tokens Reales de Polymarket (1H, 15M, 5M)
  const polyClob = new PolymarketClobConnector();
  console.log('[Main V4] 🔍 Obteniendo Token IDs reales desde Polymarket...');
  const tokenMappings = await polyClob.fetchActiveAllMarkets();
  console.log(`[Main V4] ✅ Mapeados ${tokenMappings.length} Token IDs reales dinámicos.`);

  // 2. Inicializar Reconstructor del Libro Local
  const orderbook = new LocalOrderbookManager();
  orderbook.registerTokens(tokenMappings);
  orderbook.start();

  // 3. Inicializar Motor Reactivo en RAM (25 Reglas Aprobadas)
  const engine = new HFTReactiveEngine(orderbook);

  // 4. Conectar Streams Nativos Multiplexados de Binance (1H, 15M, 5M)
  const binanceMultiWs = new BinanceMultiFrameWS();
  await binanceMultiWs.start();

  // 5. Bucle de Evaluación HFT cada 100ms para las 25 Reglas
  setInterval(() => {
    for (const coin of ['SOL', 'XRP', 'DOGE', 'BNB', 'HYPE']) {
      engine.evaluateTick(coin);
    }
  }, 100);

  // 6. Auto-rotación HFT automática de tokens cada 3s (1H, 15M, 5M)
  setInterval(async () => {
    try {
      const freshMappings = await polyClob.fetchActiveAllMarkets();
      orderbook.registerAndSubscribeTokens(freshMappings);
    } catch (e: any) {}
  }, 3000);

  // 7. Servidor HTTP Dashboard V4 en Puerto 8506
  const app = express();
  const server = http.createServer(app);
  const dbPath = path.resolve(__dirname, '../data/criptobot_v4.sqlite');
  const db = new sqlite3.Database(dbPath);

  const publicPath = path.resolve(__dirname, 'dashboard/public');
  app.use(express.static(publicPath));

  app.get('/api/v4/state', (req, res) => {
    const coins = ['SOL', 'XRP', 'DOGE', 'BNB', 'HYPE'];
    const matrix: Record<string, any> = {};

    for (const coin of coins) {
      const spot = HFTSharedState.getSpotPrice(coin);
      const d1H = HFTSharedState.getDelta1H(coin);
      const d15M = HFTSharedState.getDelta15M(coin);
      const d5M = HFTSharedState.getDelta5M(coin);

      const getAskPrice = (c: string, side: 'UP' | 'DOWN', tf: '1H' | '15M' | '5M'): number => {
        const tok = orderbook.getRealTokenId(c, side, tf);
        const obAsk = tok ? orderbook.getBestAsk(tok) : 0;
        if (obAsk > 0) return obAsk;

        const sharedSpecific = HFTSharedState.getPolyAsk(c, side, tf);
        if (sharedSpecific > 0) return sharedSpecific;

        // Fallback across timeframes if orderbook for specific tf hasn't ticked yet
        const sharedAny = HFTSharedState.getPolyAsk(c, side, '15M') || HFTSharedState.getPolyAsk(c, side, '1H') || HFTSharedState.getPolyAsk(c, side, '5M');
        return sharedAny > 0 ? sharedAny : 0;
      };

      const ask5M_UP = getAskPrice(coin, 'UP', '5M');
      const ask5M_DN = getAskPrice(coin, 'DOWN', '5M');

      const ask15M_UP = getAskPrice(coin, 'UP', '15M');
      const ask15M_DN = getAskPrice(coin, 'DOWN', '15M');

      const ask1H_UP = getAskPrice(coin, 'UP', '1H');
      const ask1H_DN = getAskPrice(coin, 'DOWN', '1H');

      matrix[coin] = {
        spotPrice: spot.toFixed(2),
        delta1H: d1H.toFixed(2),
        delta15M: d15M.toFixed(2),
        delta5M: d5M.toFixed(2),
        filter5MState: d5M > 0.05 ? 'BULLISH' : d5M < -0.05 ? 'BEARISH' : 'NEUTRAL',
        ask5M: (ask5M_UP > 0 ? ask5M_UP.toFixed(3) : '—') + ' | ' + (ask5M_DN > 0 ? ask5M_DN.toFixed(3) : '—'),
        ask15M: (ask15M_UP > 0 ? ask15M_UP.toFixed(3) : '—') + ' | ' + (ask15M_DN > 0 ? ask15M_DN.toFixed(3) : '—'),
        ask1H: (ask1H_UP > 0 ? ask1H_UP.toFixed(3) : '—') + ' | ' + (ask1H_DN > 0 ? ask1H_DN.toFixed(3) : '—')
      };
    }
    res.json({ success: true, timestamp: Date.now(), mode: CONFIG.EXECUTION_MODE, matrix });
  });

  app.get('/api/v4/disparos', (req, res) => {
    db.all('SELECT * FROM v4_disparos_log ORDER BY id DESC LIMIT 50;', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, disparos: rows || [] });
    });
  });

  app.get('/api/v4/positions', (req, res) => {
    db.all('SELECT * FROM v4_positions ORDER BY id DESC LIMIT 50;', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, positions: rows || [] });
    });
  });

  const PORT = 8506;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Main V4] 🌐 Dashboard V4 Activo en http://0.0.0.0:${PORT}`);
  });

  console.log('[Main V4] 🚀 Motor V4 HFT en RAM e Interfaz Web iniciados exitosamente. (Puerto 8506 Activo)');
}

startV4Engine().catch((err) => {
  console.error('[Main V4] ❌ Error crítico iniciando V4:', err);
});
