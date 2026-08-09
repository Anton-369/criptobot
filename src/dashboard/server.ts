import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import path from 'path';
import fs from 'fs';
import { BinanceWebsocketEngine } from '../connectors/BinanceWebsocket';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';
import { ExecutionEngine } from '../engine/ExecutionEngine';
import { CONFIG } from '../config/environment';

import { MatrixCollector } from '../analytics/MatrixCollector';

import { MomentumDetector } from '../engine/MomentumDetector';
import { DirectionalBias } from '../engine/CycleMatrixHistory';

export class DashboardServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocket.Server;
  private port: number;

  private binanceWs: BinanceWebsocketEngine;
  private polyClob: PolymarketClobConnector;
  private execEngine: ExecutionEngine;
  private matrixCollector?: MatrixCollector;
  private detector?: MomentumDetector;

  constructor(
    binanceWs: BinanceWebsocketEngine,
    polyClob: PolymarketClobConnector,
    execEngine: ExecutionEngine,
    port: number = 8505,
    matrixCollector?: MatrixCollector,
    detector?: MomentumDetector
  ) {
    this.binanceWs = binanceWs;
    this.polyClob = polyClob;
    this.execEngine = execEngine;
    this.port = port;
    this.matrixCollector = matrixCollector;
    this.detector = detector;

    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });

    this.setupRoutes();
    this.setupWebSockets();
  }

  private setupRoutes(): void {
    const publicDir = fs.existsSync(path.join(__dirname, 'public'))
      ? path.join(__dirname, 'public')
      : path.resolve(__dirname, '../../src/dashboard/public');
    this.app.use(express.static(publicDir));

    this.app.get('/api/status', async (req, res) => {
      const balances = this.execEngine.getBalances();
      const positions = this.execEngine.getPositions();
      const tickers = await this.getTickersWithTelemetry();

      res.json({
        success: true,
        timestamp: Date.now(),
        mode: CONFIG.EXECUTION_MODE,
        balances,
        tickers,
        positions,
        simpleHistory: this.matrixCollector ? this.matrixCollector.getSimpleHistory() : [],
        deepHistory: this.matrixCollector ? this.matrixCollector.getDeepHistory() : []
      });
    });
  }

  private async getTickersWithTelemetry() {
    const btcTicker = this.binanceWs.getTickerState('BTCUSDT');
    const ethTicker = this.binanceWs.getTickerState('ETHUSDT');
    const btcDir: 'UP' | 'DOWN' = (btcTicker?.deltaPct || 0) >= 0 ? 'UP' : 'DOWN';
    const ethDir: 'UP' | 'DOWN' = (ethTicker?.deltaPct || 0) >= 0 ? 'UP' : 'DOWN';

    return Promise.all(
      this.binanceWs.getAllTickerStates().map(async (t) => {
        const m = this.polyClob.getActiveMarket(t.coin);
        let polyOdds = { upBestAsk: 1.0, downBestAsk: 1.0 };
        const pairConfig = CONFIG.PAIRS.find(p => p.coin === t.coin);

        if (m) {
          polyOdds = await this.polyClob.getBestOdds(m.upTokenId, m.downTokenId);
        }

        let bias = { coin: t.coin, predictedSide: 'NEUTRAL', confidencePct: 50.0, reason: 'Sin patrón activo' };
        if (this.detector) {
          bias = this.detector.getMatrixHistory().getDirectionalBias(t.coin, btcDir, ethDir);
        }

        return {
          ...t,
          role: pairConfig ? pairConfig.role : 'TRADABLE',
          polyMarketQuestion: m ? m.question : 'No activo',
          upBestAsk: polyOdds.upBestAsk,
          downBestAsk: polyOdds.downBestAsk,
          directionalBias: bias
        };
      })
    );
  }

  private setupWebSockets(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      this.sendSnapshot(ws);
    });

    setInterval(() => {
      this.broadcastTelemetry();
    }, 1000);
  }

  private async sendSnapshot(ws: WebSocket): Promise<void> {
    if (ws.readyState !== WebSocket.OPEN) return;

    const balances = this.execEngine.getBalances();
    const positions = this.execEngine.getPositions();
    const tickers = await this.getTickersWithTelemetry();

    ws.send(JSON.stringify({
      type: 'SNAPSHOT',
      timestamp: Date.now(),
      mode: CONFIG.EXECUTION_MODE,
      balances,
      tickers,
      positions,
      simpleHistory: this.matrixCollector ? this.matrixCollector.getSimpleHistory() : [],
      deepHistory: this.matrixCollector ? this.matrixCollector.getDeepHistory() : []
    }));
  }

  private async broadcastTelemetry(): Promise<void> {
    if (this.wss.clients.size === 0) return;

    const balances = this.execEngine.getBalances();
    const positions = this.execEngine.getPositions();
    const tickersWithOdds = await this.getTickersWithTelemetry();

    const payload = JSON.stringify({
      type: 'TELEMETRY',
      timestamp: Date.now(),
      mode: CONFIG.EXECUTION_MODE,
      balances,
      tickers: tickersWithOdds,
      positions,
      simpleHistory: this.matrixCollector ? this.matrixCollector.getSimpleHistory() : [],
      deepHistory: this.matrixCollector ? this.matrixCollector.getDeepHistory() : []
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  public start(): void {
    this.server.listen(this.port, () => {
      console.log(`[Dashboard] 🌐 Control Dashboard en vivo disponible en: http://localhost:${this.port}`);
    });
  }
}
