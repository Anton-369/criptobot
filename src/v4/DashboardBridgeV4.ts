/**
 * 🖥️ V4 DASHBOARD BRIDGE & WEBSOCKET BROADCASTER
 * Arquitectura Híbrida V4 - Puente del Dashboard de Control HFT
 * 
 * Transmite el estado de la memoria RAM (Float64Array), la Matriz de 30 Parámetros,
 * el estado de la Wallet USDC y las latencias al Dashboard HTML en tiempo real.
 */

import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import path from 'path';
import { HFTSharedState, REVERSE_ASSET_MAP } from './HFTSharedState';
import { CALIBRATED_RULES } from './HFTReactiveEngine';
import { CONFIG } from '../config/environment';
import { PolymarketClobConnector } from '../connectors/PolymarketClob';

export class DashboardBridgeV4 {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocket.Server;
  private port: number;
  private polyClob: PolymarketClobConnector;

  constructor(port: number = 8507) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.polyClob = new PolymarketClobConnector();

    this.setupRoutes();
    this.startBroadcasting();
  }

  private setupRoutes(): void {
    const publicPath = path.resolve(__dirname, '../../src/dashboard/public');
    this.app.use(express.static(publicPath));

    this.app.get('/api/v4/state', (req, res) => {
      res.json(this.generateFullState());
    });
  }

  private startBroadcasting(): void {
    setInterval(() => {
      if (this.wss.clients.size === 0) return;
      const state = JSON.stringify({ type: 'V4_RAM_UPDATE', payload: this.generateFullState() });
      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(state);
        }
      });
    }, 250);
  }

  public generateFullState(): any {
    const matrix: Record<string, any> = {};

    for (const coin of REVERSE_ASSET_MAP) {
      const spotPrice = HFTSharedState.getSpotPrice(coin);
      const delta1H = HFTSharedState.getDelta1H(coin);
      const delta15M = HFTSharedState.getDelta15M(coin);
      const delta5M = HFTSharedState.getDelta5M(coin);
      const askUP_15 = HFTSharedState.getPolyAsk(coin, 'UP', '15M');
      const askUP_1H = HFTSharedState.getPolyAsk(coin, 'UP', '1H');
      const askUP_5M = HFTSharedState.getPolyAsk(coin, 'UP', '5M');
      const askUP = askUP_15 > 0 ? askUP_15 : (askUP_1H > 0 ? askUP_1H : askUP_5M);

      const askDN_15 = HFTSharedState.getPolyAsk(coin, 'DOWN', '15M');
      const askDN_1H = HFTSharedState.getPolyAsk(coin, 'DOWN', '1H');
      const askDN_5M = HFTSharedState.getPolyAsk(coin, 'DOWN', '5M');
      const askDOWN = askDN_15 > 0 ? askDN_15 : (askDN_1H > 0 ? askDN_1H : askDN_5M);

      const rules = (CALIBRATED_RULES as any)[coin];

      matrix[coin] = {
        spotPrice,
        delta1H: delta1H.toFixed(2),
        delta15M: delta15M.toFixed(2),
        delta5M: delta5M.toFixed(2),
        askUP: askUP > 0 ? askUP.toFixed(3) : 'N/A',
        askDOWN: askDOWN > 0 ? askDOWN.toFixed(3) : 'N/A',
        rule1H_UP_Triggered: rules && rules['1H'] ? delta1H >= rules['1H'].deltaUpTrigger : false,
        rule1H_DOWN_Triggered: rules && rules['1H'] ? delta1H <= rules['1H'].deltaDownTrigger : false,
        rule15M_UP_Triggered: rules && rules['15M'] ? delta15M >= rules['15M'].deltaUpTrigger : false,
        rule15M_DOWN_Triggered: rules && rules['15M'] ? delta15M <= rules['15M'].deltaDownTrigger : false,
        filter5MState: delta5M > 0 ? 'BULLISH' : delta5M < 0 ? 'BEARISH' : 'NEUTRAL'
      };
    }

    return {
      timestamp: Date.now(),
      executionMode: CONFIG.EXECUTION_MODE,
      proxyWallet: CONFIG.PROXY_WALLET,
      matrix
    };
  }

  public start(): void {
    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[Dashboard V4] ⚠️ Puerto ${this.port} ocupado, cambiando automáticamente a ${this.port + 1}...`);
        this.port += 1;
        this.server.listen(this.port);
      }
    });

    this.server.listen(this.port, () => {
      console.log(`[Dashboard V4] 🖥️ Dashboard HFT V4 activo en http://localhost:${this.port}`);
    });
  }
}
