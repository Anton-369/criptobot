import { PolymarketClobConnector, Polymarket1HMarket } from './PolymarketClob';
import { BinanceWebsocketEngine } from './BinanceWebsocket';
import { DatabaseManager, MarketSnapshotRecord, SpotPriceRecord, KlineRecord } from '../storage/DatabaseManager';
import { CONFIG } from '../config/environment';

export class PolymarketCollector {
  private polyClob: PolymarketClobConnector;
  private binanceWs?: BinanceWebsocketEngine;
  private dbManager: DatabaseManager;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private isCollecting: boolean = false;

  constructor(polyClob: PolymarketClobConnector, dbManager: DatabaseManager, binanceWs?: BinanceWebsocketEngine) {
    this.polyClob = polyClob;
    this.dbManager = dbManager;
    this.binanceWs = binanceWs;
  }

  public async start(): Promise<void> {
    if (this.isCollecting) return;
    this.isCollecting = true;
    console.log('[PolymarketCollector] 🛰️ Iniciando Colector de Polymarket para 7 monedas (BTC, ETH, XRP, SOL, DOGE, BNB, HYPE)...');

    // 1. Initial market discovery
    await this.discoverActiveMarkets();

    // 2. High-frequency discovery burst trigger between :00:00 and :00:10
    this.discoveryInterval = setInterval(async () => {
      const now = new Date();
      const sec = now.getUTCSeconds();
      const min = now.getUTCMinutes();

      // Trigger high-frequency polling at top of hour (:00:00 to :00:10)
      if (min === 0 && sec <= 10) {
        console.log(`[PolymarketCollector] ⚡ Ráfaga Discovery activa al inicio de hora (:00:${sec.toString().padStart(2, '0')})...`);
        await this.discoverActiveMarkets();
      } else if (sec % 30 === 0) { // Regular background check every 30s
        await this.discoverActiveMarkets();
      }
    }, 1000);

    // 3. Snapshot recording loop every 60 seconds
    this.snapshotInterval = setInterval(async () => {
      await this.recordSnapshots();
    }, 60000);

    // Record initial snapshot immediately
    await this.recordSnapshots();
  }

  public async discoverActiveMarkets(): Promise<Map<string, Polymarket1HMarket>> {
    const markets = await this.polyClob.fetchActive1HMarkets();
    return markets;
  }

  public async recordSnapshots(): Promise<void> {
    const now = new Date();
    // Format ET/Chile timestamp (UTC-4)
    const etOffsetMs = 4 * 60 * 60 * 1000;
    const etDate = new Date(now.getTime() - etOffsetMs);
    const timestampET = etDate.toISOString().replace('T', ' ').slice(0, 19);
    const utcHour = now.getUTCHours();

    for (const pair of CONFIG.PAIRS) {
      const coin = pair.coin;
      const market = this.polyClob.getActiveMarket(coin);

      if (!market) {
        continue;
      }

      try {
        const odds = await this.polyClob.getBestOdds(market.upTokenId, market.downTokenId);

        const yesPrice = odds.upBestAsk < 1.0 ? odds.upBestAsk : (1.0 - odds.downBestAsk);
        const noPrice = odds.downBestAsk < 1.0 ? odds.downBestAsk : (1.0 - odds.upBestAsk);

        const record: MarketSnapshotRecord = {
          timestampET,
          utcHour,
          coin,
          marketId: market.conditionId,
          tokenIdUp: market.upTokenId,
          tokenIdDown: market.downTokenId,
          bestAskUp: odds.upBestAsk,
          bestBidUp: odds.upBestBid,
          bestAskDown: odds.downBestAsk,
          bestBidDown: odds.downBestBid,
          yesPrice: parseFloat(yesPrice.toFixed(4)),
          noPrice: parseFloat(noPrice.toFixed(4)),
          askDepthUp: odds.upAskDepth,
          askDepthDown: odds.downAskDepth
        };

        await this.dbManager.saveSnapshot(record);
      } catch (err: any) {
        console.warn(`[PolymarketCollector] Error registrando snapshot de ${coin}: ${err.message}`);
      }

      // Record spot price tick if Binance WS engine available
      if (this.binanceWs) {
        const ticker = this.binanceWs.getTickerState(`${coin}USDT`.toLowerCase());
        if (ticker && ticker.currentPrice > 0) {
          try {
            const spotRecord: SpotPriceRecord = {
              timestampET,
              utcHour,
              coin,
              price: ticker.currentPrice,
              high1h: ticker.highPrice1H || ticker.currentPrice,
              low1h: ticker.lowPrice1H || ticker.currentPrice,
              open1h: ticker.openPrice1H || ticker.currentPrice,
              deltaPct1h: parseFloat(ticker.deltaPct.toFixed(4))
            };
            await this.dbManager.saveSpotPrice(spotRecord);

            // Also save kline record for AI calibration pipeline (klines_1m table)
            const minuteInHour = now.getUTCMinutes();
            const cycleDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
            const cycleKey = `${cycleDate}_${String(utcHour).padStart(2, '0')}`;
            const openTimeMs = Date.UTC(
              now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
              utcHour, minuteInHour, 0, 0
            );

            const klineRecord: KlineRecord = {
              coin,
              cycleKey,
              minuteInHour,
              openPrice: ticker.openPrice1H || ticker.currentPrice,
              closePrice: ticker.currentPrice,
              openTimeMs
            };
            await this.dbManager.saveKline(klineRecord);
          } catch (e: any) {
            console.warn(`[PolymarketCollector] Error registrando spot/kline de ${coin}: ${e.message}`);
          }
        }
      }
    }
  }

  public stop(): void {
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    if (this.discoveryInterval) clearInterval(this.discoveryInterval);
    this.isCollecting = false;
    console.log('[PolymarketCollector] ⏹️ Colector de Polymarket detenido.');
  }
}
