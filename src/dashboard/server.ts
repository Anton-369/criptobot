import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import path from 'path';
import { BinanceWebsocketEngine } from '../connectors/BinanceWebsocket';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';
import { ExecutionEngine } from '../engine/ExecutionEngine';
import { CONFIG } from '../config/environment';

export class DashboardServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocket.Server;
  private port: number;

  private binanceWs: BinanceWebsocketEngine;
  private polyClob: PolymarketClobConnector;
  private execEngine: ExecutionEngine;

  constructor(
    binanceWs: BinanceWebsocketEngine,
    polyClob: PolymarketClobConnector,
    execEngine: ExecutionEngine,
    port: number = 8505
  ) {
    this.binanceWs = binanceWs;
    this.polyClob = polyClob;
    this.execEngine = execEngine;
    this.port = port;

    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });

    this.setupRoutes();
    this.setupWebSockets();
  }

  private setupRoutes(): void {
    const publicDir = path.join(__dirname, 'public');
    this.app.use(express.static(publicDir));

    this.app.get('/api/status', async (req, res) => {
      const balances = this.execEngine.getBalances();
      const positions = this.execEngine.getPositions();
      const tickers = this.binanceWs.getAllTickerStates();

      res.json({
        success: true,
        timestamp: Date.now(),
        mode: CONFIG.EXECUTION_MODE,
        balances,
        tickers,
        positions
      });
    });
  }

  private setupWebSockets(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      // Send initial snapshot
      this.sendSnapshot(ws);
    });

    // Broadcast live telemetry every 1000ms
    setInterval(() => {
      this.broadcastTelemetry();
    }, 1000);
  }

  private async sendSnapshot(ws: WebSocket): Promise<void> {
    if (ws.readyState !== WebSocket.OPEN) return;

    const balances = this.execEngine.getBalances();
    const positions = this.execEngine.getPositions();
    const tickers = this.binanceWs.getAllTickerStates();

    ws.send(JSON.stringify({
      type: 'SNAPSHOT',
      timestamp: Date.now(),
      mode: CONFIG.EXECUTION_MODE,
      balances,
      tickers,
      positions
    }));
  }

  private async broadcastTelemetry(): Promise<void> {
    if (this.wss.clients.size === 0) return;

    const balances = this.execEngine.getBalances();
    const positions = this.execEngine.getPositions();
    
    // Combine tickers with Polymarket odds
    const tickersWithOdds = await Promise.all(
      this.binanceWs.getAllTickerStates().map(async (t) => {
        const m = this.polyClob.getActiveMarket(t.coin);
        let polyOdds = { upBestAsk: 1.0, downBestAsk: 1.0 };

        if (m) {
          polyOdds = await this.polyClob.getBestOdds(m.upTokenId, m.downTokenId);
        }

        return {
          ...t,
          polyMarketQuestion: m ? m.question : 'No activo',
          upBestAsk: polyOdds.upBestAsk,
          downBestAsk: polyOdds.downBestAsk
        };
      })
    );

    const payload = JSON.stringify({
      type: 'TELEMETRY',
      timestamp: Date.now(),
      mode: CONFIG.EXECUTION_MODE,
      balances,
      tickers: tickersWithOdds,
      positions
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
