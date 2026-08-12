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
      // 1. Load seed FIRST — this is the base layer
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
            btc: s.btc,
            eth: s.eth,
            xrp: s.xrp,
            sol: s.sol,
            doge: s.doge,
            bnb: s.bnb,
            hype: s.hype,
            swarmConsensus,
            btcAltDivergence
          };
        });
        this.simpleHistory = seededRecords;
      }

      // 2. Load persistence file (live data from previous runs)
      // Only add records with timestamps NOT already in simpleHistory (dedup by date+hour)
      const simplePath = path.join(this.storageDir, 'tabla_simple_1h.json');
      if (fs.existsSync(simplePath)) {
        const liveData: SimpleMatrixRecord[] = JSON.parse(fs.readFileSync(simplePath, 'utf8'));
        const existingKeys = new Set(
          this.simpleHistory.map(r => `${new Date(r.timestampISO).toISOString().slice(0,13)}`)
        );
        for (const lr of liveData) {
          const key = new Date(lr.timestampISO).toISOString().slice(0,13); // date+hour key
          if (!existingKeys.has(key)) {
            this.simpleHistory.push(lr);
            existingKeys.add(key);
          }
        }
      }

      // 3. Sort newest first
      this.simpleHistory.sort((a, b) => new Date(b.timestampISO).getTime() - new Date(a.timestampISO).getTime());
      this.saveHistory();

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
    // ET/Chile = UTC-4 — store the COMPLETED cycle's ET hour
    const completedHour = ((now.getUTCHours() - 5) + 24) % 24; // -5 because -4 for ET, -1 for completed cycle
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
          hour: completedHour,
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

    // Guard: all 7 coins must be present — skip record if any missing
    const requiredCoins = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'BNB', 'HYPE'];
    if (requiredCoins.some(c => !coinDirections[c])) {
      return; // incomplete data — do not fabricate
    }

    const btcDir = coinDirections['BTC']!;
    const btcAltDivergence = btcDir !== swarmConsensus && swarmConsensus !== 'MIXED';

    const simpleRecord: SimpleMatrixRecord = {
      hour: completedHour,
      timestampISO: isoString,
      btc: btcDir,
      eth: coinDirections['ETH']!,
      xrp: coinDirections['XRP']!,
      sol: coinDirections['SOL']!,
      doge: coinDirections['DOGE']!,
      bnb: coinDirections['BNB']!,
      hype: coinDirections['HYPE']!,
      swarmConsensus,
      btcAltDivergence
    };

    // Dedup: replace existing record for this UTC hour instead of adding duplicate
    const existingIdx = this.simpleHistory.findIndex(r => {
      const rDate = new Date(r.timestampISO);
      return rDate.getUTCHours() === completedHour &&
             rDate.toISOString().slice(0,10) === now.toISOString().slice(0,10);
    });
    if (existingIdx >= 0) {
      this.simpleHistory[existingIdx] = simpleRecord; // update with live data
    } else {
      this.simpleHistory.unshift(simpleRecord);
    }

    // Keep max 500 simple records (~3 days of 7-coin hourly data) and 1500 deep records
    if (this.simpleHistory.length > 500) this.simpleHistory.pop();
    if (this.deepHistory.length > 1500) this.deepHistory.pop();

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
