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
      const coinPerformance = await this.getCoinPerformanceStats();

      res.json({
        success: true,
        timestamp: Date.now(),
        mode: CONFIG.EXECUTION_MODE,
        balances,
        tickers,
        positions,
        coinPerformance,
        simpleHistory: this.matrixCollector ? this.matrixCollector.getSimpleHistory() : [],
        deepHistory: this.matrixCollector ? this.matrixCollector.getDeepHistory() : []
      });
    });
  }

  private lastCoinPerformanceCache: any[] = [];
  private lastCoinPerformanceFetchTime: number = 0;

  // Cache for Polymarket odds to avoid 7 req/s hammering the CLOB orderbook
  private oddsCache: Map<string, { upBestAsk: number; downBestAsk: number; fetchedAt: number }> = new Map();
  private ODDS_CACHE_TTL_MS = 5000; // Refresh odds every 5 seconds max

  private async getCoinPerformanceStats(): Promise<any[]> {
    const now = Date.now();
    if (this.lastCoinPerformanceCache.length > 0 && (now - this.lastCoinPerformanceFetchTime < 15000)) {
      return this.lastCoinPerformanceCache;
    }

    try {
      const wallet = CONFIG.PROXY_WALLET || '0xe57Ef37c17df560084fF3C1EB7bb3e9fdcCfA300';
      const response = await fetch(`https://data-api.polymarket.com/activity?user=${wallet}&limit=150`);
      if (!response.ok) return this.lastCoinPerformanceCache;
      const data: any = await response.json();

      const aug9Trades = data.filter((t: any) => t.type === 'TRADE' && (t.timestamp || 0) >= 1786248000);
      const slugGroupMap: { [slug: string]: any[] } = {};

      for (const t of aug9Trades) {
        if (!t.slug) continue;
        if (!slugGroupMap[t.slug]) slugGroupMap[t.slug] = [];
        slugGroupMap[t.slug].push(t);
      }

      const coinStatsMap: { [coin: string]: { coin: string, events: number, wins: number, losses: number, active: number, invested: number, payout: number } } = {
        XRP: { coin: 'XRP', events: 0, wins: 0, losses: 0, active: 0, invested: 0, payout: 0 },
        BNB: { coin: 'BNB', events: 0, wins: 0, losses: 0, active: 0, invested: 0, payout: 0 },
        HYPE: { coin: 'HYPE', events: 0, wins: 0, losses: 0, active: 0, invested: 0, payout: 0 },
        SOL: { coin: 'SOL', events: 0, wins: 0, losses: 0, active: 0, invested: 0, payout: 0 },
        DOGE: { coin: 'DOGE', events: 0, wins: 0, losses: 0, active: 0, invested: 0, payout: 0 }
      };

      for (const slug of Object.keys(slugGroupMap)) {
        const mTrades = slugGroupMap[slug];
        const title = mTrades[0].title || '';
        let coin = 'OTHER';
        if (title.includes('XRP')) coin = 'XRP';
        else if (title.includes('BNB')) coin = 'BNB';
        else if (title.includes('HYPE')) coin = 'HYPE';
        else if (title.includes('Solana') || title.includes('SOL')) coin = 'SOL';
        else if (title.includes('Dogecoin') || title.includes('DOGE')) coin = 'DOGE';

        if (!coinStatsMap[coin]) {
          coinStatsMap[coin] = { coin, events: 0, wins: 0, losses: 0, active: 0, invested: 0, payout: 0 };
        }

        const usdc = mTrades.reduce((sum: number, t: any) => sum + (t.usdcSize || 0), 0);
        const shares = mTrades.reduce((sum: number, t: any) => sum + (t.size || 0), 0);
        const side = mTrades[0].outcome || 'Up';

        try {
          // 3-second timeout to prevent Gamma API hang from crashing the process
          const fetchWithTimeout = (url: string, timeoutMs: number) =>
            Promise.race([
              fetch(url),
              new Promise<Response>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
              )
            ]) as Promise<Response>;

          const gRes = await fetchWithTimeout(`https://gamma-api.polymarket.com/events?slug=${slug}`, 3000);
          if (gRes.ok) {
            const gData: any = await gRes.json();
            if (gData && gData[0] && gData[0].markets && gData[0].markets[0]) {
              const market = gData[0].markets[0];
              const outcomes = JSON.parse(market.outcomes || '[]');
              const outcomePrices = JSON.parse(market.outcomePrices || '[]');
              const sideIdx = side.toUpperCase() === (outcomes[0] || '').toUpperCase() ? 0 : 1;
              const price = parseFloat(outcomePrices[sideIdx] || '0.5');

              coinStatsMap[coin].events += 1;
              coinStatsMap[coin].invested += usdc;

              if (price >= 0.95) {
                coinStatsMap[coin].wins += 1;
                coinStatsMap[coin].payout += shares * 1.0;
              } else if (price <= 0.05) {
                coinStatsMap[coin].losses += 1;
              } else {
                coinStatsMap[coin].active += 1;
                coinStatsMap[coin].payout += shares * price;
              }
            }
          }
        } catch (e) {
          // ignore soft errors
        }
      }

      const resultList = Object.values(coinStatsMap).map(c => {
        const wr = (c.wins + c.losses) > 0 ? (c.wins / (c.wins + c.losses)) * 100 : 0;
        const netPnL = c.payout - c.invested;
        const roiPct = c.invested > 0 ? (netPnL / c.invested) * 100 : 0;
        return {
          ...c,
          winRatePct: wr,
          netPnL,
          roiPct
        };
      }).sort((a, b) => b.netPnL - a.netPnL);

      this.lastCoinPerformanceCache = resultList;
      this.lastCoinPerformanceFetchTime = Date.now();
      return resultList;
    } catch (err) {
      console.error("Error fetching coin performance stats:", err);
      return this.lastCoinPerformanceCache;
    }
  }

  private async getTickersWithTelemetry() {
    const btcTicker = this.binanceWs.getTickerState('BTCUSDT');
    const ethTicker = this.binanceWs.getTickerState('ETHUSDT');
    const btcDir: 'UP' | 'DOWN' = (btcTicker?.deltaPct || 0) >= 0 ? 'UP' : 'DOWN';
    const ethDir: 'UP' | 'DOWN' = (ethTicker?.deltaPct || 0) >= 0 ? 'UP' : 'DOWN';
    const now = Date.now();

    return Promise.all(
      this.binanceWs.getAllTickerStates().map(async (t) => {
        const m = this.polyClob.getActiveMarket(t.coin);
        const pairConfig = CONFIG.PAIRS.find(p => p.coin === t.coin);

        // Use cached odds if fresh (< 5s old), otherwise fetch and cache
        let polyOdds = { upBestAsk: 1.0, downBestAsk: 1.0 };
        if (m) {
          const cacheKey = `${m.upTokenId}_${m.downTokenId}`;
          const cached = this.oddsCache.get(cacheKey);
          if (cached && (now - cached.fetchedAt) < this.ODDS_CACHE_TTL_MS) {
            polyOdds = { upBestAsk: cached.upBestAsk, downBestAsk: cached.downBestAsk };
          } else {
            try {
              polyOdds = await this.polyClob.getBestOdds(m.upTokenId, m.downTokenId);
              this.oddsCache.set(cacheKey, { ...polyOdds, fetchedAt: now });
            } catch (e) {
              // Keep last cached value on error
              if (cached) polyOdds = { upBestAsk: cached.upBestAsk, downBestAsk: cached.downBestAsk };
            }
          }
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
    const coinPerformance = await this.getCoinPerformanceStats();

    ws.send(JSON.stringify({
      type: 'SNAPSHOT',
      timestamp: Date.now(),
      mode: CONFIG.EXECUTION_MODE,
      balances,
      tickers,
      positions,
      coinPerformance,
      simpleHistory: this.matrixCollector ? this.matrixCollector.getSimpleHistory() : [],
      deepHistory: this.matrixCollector ? this.matrixCollector.getDeepHistory() : []
    }));
  }

  private async broadcastTelemetry(): Promise<void> {
    if (this.wss.clients.size === 0) return;

    const balances = this.execEngine.getBalances();
    const positions = this.execEngine.getPositions();
    const tickersWithOdds = await this.getTickersWithTelemetry();
    const coinPerformance = await this.getCoinPerformanceStats();

    const payload = JSON.stringify({
      type: 'TELEMETRY',
      timestamp: Date.now(),
      mode: CONFIG.EXECUTION_MODE,
      balances,
      tickers: tickersWithOdds,
      positions,
      coinPerformance,
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
