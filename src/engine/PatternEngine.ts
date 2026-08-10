import * as fs from 'fs';
import * as path from 'path';

export interface CoinPrediction {
  coin: string;
  predictedSide: 'UP' | 'DOWN' | 'NEUTRAL';
  confidencePct: number;
  matchesFound: number;
  upCount: number;
  downCount: number;
  reason: string;
}

interface CycleSnapshot {
  hourTimestamp: number;
  coins: Map<string, 'UP' | 'DOWN'>; // all 7 coins for this completed cycle
}

interface TransitionRecord {
  prevSnapshot: Map<string, 'UP' | 'DOWN'>;
  nextCoin: string;       // which target coin
  nextOutcome: 'UP' | 'DOWN';
}

export class PatternEngine {
  private transitions: TransitionRecord[] = [];
  private allCoins = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'BNB', 'HYPE'];
  private targetCoins = ['XRP', 'SOL', 'DOGE', 'BNB', 'HYPE'];
  private minMatches = 5;        // minimum historical matches to trust
  private minConfidence = 70;    // minimum hit rate %
  private decayThreshold = 60;   // below this, pattern is "decayed"

  constructor(dataDir: string) {
    this.loadHistory(dataDir);
  }

  /** Reload history from disk to pick up newly recorded cycles */
  public reload(dataDir: string): void {
    this.transitions = [];
    this.loadHistory(dataDir);
  }

  /** Load seed + live history and build transition records */
  private loadHistory(dataDir: string): void {
    // 1. Load seed (matrix_seed.json) — chronological snapshots
    const seedPath = path.resolve(dataDir, '../src/engine/matrix_seed.json');
    const snapshots: CycleSnapshot[] = [];

    if (fs.existsSync(seedPath)) {
      const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      for (const row of seedData) {
        const hourMs = Date.UTC(
          parseInt(row.date.split('-')[0]),
          parseInt(row.date.split('-')[1]) - 1,
          parseInt(row.date.split('-')[2]),
          row.hour - 1, 0, 0, 0
        );
        const coins = new Map<string, 'UP' | 'DOWN'>();
        for (const coin of this.allCoins) {
          if (row[coin.toLowerCase()] !== null && row[coin.toLowerCase()] !== undefined) {
            coins.set(coin, row[coin.toLowerCase()]);
          }
        }
        // Only include snapshots with at least 4 coins
        if (coins.size >= 4) {
          snapshots.push({ hourTimestamp: hourMs, coins });
        }
      }
    }

    // 2. Load live history — update snapshots with live outcomes
    const livePath = path.join(dataDir, 'live_history.json');
    if (fs.existsSync(livePath)) {
      const liveData = JSON.parse(fs.readFileSync(livePath, 'utf8'));
      for (const entry of liveData) {
        const ts = entry.hourTimestamp;
        const coin = entry.coin;
        const outcome = entry.outcome as 'UP' | 'DOWN';
        // Find or create snapshot for this hour
        let snapshot = snapshots.find(s => s.hourTimestamp === ts);
        if (!snapshot) {
          snapshot = { hourTimestamp: ts, coins: new Map() };
          snapshots.push(snapshot);
        }
        snapshot.coins.set(coin, outcome);
      }
    }

    // 3. Sort by timestamp
    snapshots.sort((a, b) => a.hourTimestamp - b.hourTimestamp);

    // 4. Build transitions: prev snapshot → next snapshot outcome per coin
    for (let i = 0; i < snapshots.length - 1; i++) {
      const prev = snapshots[i];
      const next = snapshots[i + 1];
      for (const target of this.targetCoins) {
        const nextOutcome = next.coins.get(target);
        if (nextOutcome) {
          this.transitions.push({
            prevSnapshot: prev.coins,
            nextCoin: target,
            nextOutcome
          });
        }
      }
    }

    console.log(`[PatternEngine] 📊 Cargadas ${snapshots.length} horas → ${this.transitions.length} transiciones`);
  }

  /** How many coins match between two snapshots */
  private matchCount(current: Map<string, 'UP' | 'DOWN'>, historical: Map<string, 'UP' | 'DOWN'>): number {
    let matches = 0;
    for (const [coin, dir] of current) {
      if (historical.get(coin) === dir) matches++;
    }
    return matches;
  }

  /** Predict direction for a single coin based on current cycle state */
  public predict(coin: string, currentState: Map<string, 'UP' | 'DOWN'>): CoinPrediction {
    const relevant = this.transitions.filter(t => {
      if (t.nextCoin !== coin) return false;
      return this.matchCount(currentState, t.prevSnapshot) >= 4; // at least 4 coins match
    });

    const upCount = relevant.filter(t => t.nextOutcome === 'UP').length;
    const downCount = relevant.filter(t => t.nextOutcome === 'DOWN').length;
    const total = upCount + downCount;
    const maxSide = upCount >= downCount ? 'UP' : 'DOWN';
    const maxCount = Math.max(upCount, downCount);
    const confidence = total >= this.minMatches ? (maxCount / total) * 100 : 0;

    let predictedSide: 'UP' | 'DOWN' | 'NEUTRAL' = 'NEUTRAL';
    let reason = '';

    if (total >= this.minMatches && confidence >= this.minConfidence) {
      predictedSide = maxSide;
      reason = `Patrón: ${total} configs similares → ${coin} ${maxSide} ${maxCount}/${total} (${confidence.toFixed(0)}%)`;
    } else if (total >= 3) {
      predictedSide = maxSide;
      reason = `Señal débil: ${total} configs → ${coin} ${maxSide} ${maxCount}/${total} (${confidence.toFixed(0)}%) — <${this.minMatches} matches`;
    } else {
      reason = `Sin datos suficientes (${total} configs coincidentes < ${this.minMatches})`;
    }

    return {
      coin,
      predictedSide,
      confidencePct: Math.round(confidence),
      matchesFound: total,
      upCount,
      downCount,
      reason
    };
  }

  /** Predict all 5 target coins */
  public predictAll(currentState: Map<string, 'UP' | 'DOWN'>): CoinPrediction[] {
    return this.targetCoins.map(coin => this.predict(coin, currentState));
  }

  /** Get summary of predictions for logging */
  public summary(predictions: CoinPrediction[]): string {
    const lines: string[] = [];
    for (const p of predictions) {
      const icon = p.predictedSide === 'UP' ? '🟢' : p.predictedSide === 'DOWN' ? '🔴' : '⚪';
      lines.push(`${icon} ${p.coin}: ${p.predictedSide} (${p.confidencePct}%, n=${p.matchesFound})`);
    }
    return lines.join('\n');
  }
}
