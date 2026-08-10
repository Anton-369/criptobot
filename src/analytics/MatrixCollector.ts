import fs from 'fs';
import path from 'path';
import { BinanceTickerState } from '../connectors/BinanceWebsocket';

export interface SimpleMatrixRecord {
  hour: number;          // 1 to 24
  timestampISO: string;
  btc: 'UP' | 'DOWN';
  eth: 'UP' | 'DOWN';
  xrp: 'UP' | 'DOWN';
  sol: 'UP' | 'DOWN';
  doge: 'UP' | 'DOWN';
  bnb: 'UP' | 'DOWN';
  hype: 'UP' | 'DOWN';
  swarmConsensus: 'UP' | 'DOWN' | 'MIXED';
  btcAltDivergence: boolean;
}

export interface DeepMatrixRecord {
  hour: number;
  timestampISO: string;
  coin: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  rangePct: number;
  dipMinSec: string;     // e.g. "14:22"
  peakMinSec: string;    // e.g. "42:15"
  direction: 'UP' | 'DOWN';
  cheapWindowActive: boolean; // True if odds were <= $0.42
}

export class MatrixCollector {
  private simpleHistory: SimpleMatrixRecord[] = [];
  private deepHistory: DeepMatrixRecord[] = [];
  private currentHourTickStats: Map<string, {
    coin: string;
    openPrice: number;
    highPrice: number;
    lowPrice: number;
    dipTimeMs: number;
    peakTimeMs: number;
    hourStartMs: number;
  }> = new Map();

  private storageDir: string;

  constructor() {
    this.storageDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.loadHistory();
  }

  private loadHistory(): void {
    try {
      const simplePath = path.join(this.storageDir, 'tabla_simple_1h.json');
      if (fs.existsSync(simplePath)) {
        this.simpleHistory = JSON.parse(fs.readFileSync(simplePath, 'utf8'));
      }

      const seedPath = path.resolve(__dirname, '../engine/matrix_seed.json');
      if (fs.existsSync(seedPath)) {
        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        const seededRecords: SimpleMatrixRecord[] = seedData.map((s: any) => {
          const tradables = ['xrp', 'sol', 'doge', 'bnb', 'hype'];
          let upCount = 0;
          let downCount = 0;
          tradables.forEach(c => {
            if (s[c] === 'UP') upCount++;
            else if (s[c] === 'DOWN') downCount++;
          });
          let swarmConsensus: 'UP' | 'DOWN' | 'MIXED' = 'MIXED';
          if (upCount >= 4) swarmConsensus = 'UP';
          if (downCount >= 4) swarmConsensus = 'DOWN';
          const btcDir = s.btc || 'UP';
          const btcAltDivergence = btcDir !== swarmConsensus && swarmConsensus !== 'MIXED';

          const hourNum = parseInt(s.hour, 10);
          const isoString = new Date(`${s.date}T${String(hourNum - 1).padStart(2, '0')}:00:00.000Z`).toISOString();
          return {
            hour: hourNum,
            timestampISO: isoString,
            btc: s.btc || 'UP',
            eth: s.eth || 'UP',
            xrp: s.xrp || 'UP',
            sol: s.sol || 'UP',
            doge: s.doge || 'UP',
            bnb: s.bnb || 'UP',
            hype: s.hype || 'UP',
            swarmConsensus,
            btcAltDivergence
          };
        });

        const existingTimestamps = new Set(this.simpleHistory.map(r => r.timestampISO));
        for (const sr of seededRecords) {
          if (!existingTimestamps.has(sr.timestampISO)) {
            this.simpleHistory.push(sr);
          }
        }
        this.simpleHistory.sort((a, b) => new Date(b.timestampISO).getTime() - new Date(a.timestampISO).getTime());
        this.saveHistory();
      }

      const deepPath = path.join(this.storageDir, 'tabla_profunda_1h.json');
      if (fs.existsSync(deepPath)) {
        this.deepHistory = JSON.parse(fs.readFileSync(deepPath, 'utf8'));
      }
    } catch (e) {
      console.warn('[MatrixCollector] ⚠️ No se pudo cargar historial preexistente:', e);
    }
  }

  public processTick(ticker: BinanceTickerState): void {
    const nowMs = Date.now();
    const symbol = ticker.symbol.toUpperCase();

    let stat = this.currentHourTickStats.get(symbol);
    if (!stat) {
      stat = {
        coin: ticker.coin,
        openPrice: ticker.openPrice1H || ticker.currentPrice,
        highPrice: ticker.currentPrice,
        lowPrice: ticker.currentPrice,
        dipTimeMs: nowMs,
        peakTimeMs: nowMs,
        hourStartMs: nowMs
      };
      this.currentHourTickStats.set(symbol, stat);
    }

    // Update highs and lows
    if (ticker.currentPrice > stat.highPrice) {
      stat.highPrice = ticker.currentPrice;
      stat.peakTimeMs = nowMs;
    }
    if (ticker.currentPrice < stat.lowPrice) {
      stat.lowPrice = ticker.currentPrice;
      stat.dipTimeMs = nowMs;
    }
  }

  public finalizeHourCycle(allTickers: BinanceTickerState[]): void {
    const now = new Date();
    // IMPORTANT: Store UTC hour to be timezone-agnostic.
    // ET/Chile (UTC-4) display: utcHour - 4. Dashboard converts on display.
    const currentHour = now.getUTCHours(); // 0 to 23 UTC
    const isoString = now.toISOString();

    const coinDirections: Record<string, 'UP' | 'DOWN'> = {};

    allTickers.forEach(t => {
      const coin = t.coin.toUpperCase();
      const dir = t.deltaPct >= 0 ? 'UP' : 'DOWN';
      coinDirections[coin] = dir;

      const stat = this.currentHourTickStats.get(t.symbol.toUpperCase());
      if (stat) {
        const dipOffsetMs = stat.dipTimeMs - stat.hourStartMs;
        const peakOffsetMs = stat.peakTimeMs - stat.hourStartMs;

        const dipMinSec = `${Math.floor(dipOffsetMs / 60000)}:${Math.floor((dipOffsetMs % 60000) / 1000).toString().padStart(2, '0')}`;
        const peakMinSec = `${Math.floor(peakOffsetMs / 60000)}:${Math.floor((peakOffsetMs % 60000) / 1000).toString().padStart(2, '0')}`;

        const rangePct = stat.openPrice > 0 ? ((stat.highPrice - stat.lowPrice) / stat.openPrice) * 100 : 0;

        const deepRecord: DeepMatrixRecord = {
          hour: currentHour,
          timestampISO: isoString,
          coin,
          openPrice: stat.openPrice,
          closePrice: t.currentPrice,
          highPrice: stat.highPrice,
          lowPrice: stat.lowPrice,
          rangePct: parseFloat(rangePct.toFixed(2)),
          dipMinSec,
          peakMinSec,
          direction: dir,
          cheapWindowActive: t.deltaPct <= -0.15 // Dip opportunity
        };

        this.deepHistory.unshift(deepRecord);
      }
    });

    // Determine Swarm Consensus across 5 tradable coins (XRP, SOL, DOGE, BNB, HYPE)
    const tradables = ['XRP', 'SOL', 'DOGE', 'BNB', 'HYPE'];
    let upCount = 0;
    let downCount = 0;

    tradables.forEach(c => {
      if (coinDirections[c] === 'UP') upCount++;
      else if (coinDirections[c] === 'DOWN') downCount++;
    });

    let swarmConsensus: 'UP' | 'DOWN' | 'MIXED' = 'MIXED';
    if (upCount >= 4) swarmConsensus = 'UP';
    if (downCount >= 4) swarmConsensus = 'DOWN';

    const btcDir = coinDirections['BTC'] || 'UP';
    const btcAltDivergence = btcDir !== swarmConsensus && swarmConsensus !== 'MIXED';

    const simpleRecord: SimpleMatrixRecord = {
      hour: currentHour,
      timestampISO: isoString,
      btc: coinDirections['BTC'] || 'UP',
      eth: coinDirections['ETH'] || 'UP',
      xrp: coinDirections['XRP'] || 'UP',
      sol: coinDirections['SOL'] || 'UP',
      doge: coinDirections['DOGE'] || 'UP',
      bnb: coinDirections['BNB'] || 'UP',
      hype: coinDirections['HYPE'] || 'UP',
      swarmConsensus,
      btcAltDivergence
    };

    this.simpleHistory.unshift(simpleRecord);

    // Keep max 200 records
    if (this.simpleHistory.length > 200) this.simpleHistory.pop();
    if (this.deepHistory.length > 500) this.deepHistory.pop();

    this.saveHistory();
    this.currentHourTickStats.clear();
  }

  private saveHistory(): void {
    try {
      fs.writeFileSync(path.join(this.storageDir, 'tabla_simple_1h.json'), JSON.stringify(this.simpleHistory, null, 2));
      fs.writeFileSync(path.join(this.storageDir, 'tabla_profunda_1h.json'), JSON.stringify(this.deepHistory, null, 2));
    } catch (e) {
      console.error('[MatrixCollector] ❌ Error guardando historial de tablas:', e);
    }
  }

  public getSimpleHistory(): SimpleMatrixRecord[] {
    return this.simpleHistory;
  }

  public getDeepHistory(): DeepMatrixRecord[] {
    return this.deepHistory;
  }
}
