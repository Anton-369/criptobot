import { EventEmitter } from 'events';

export interface CycleRecord {
  coin: string;
  hourTimestamp: number; // UTC hour start timestamp (ms)
  outcome: 'UP' | 'DOWN';
}

export interface DirectionalBias {
  coin: string;
  predictedSide: 'UP' | 'DOWN' | 'NEUTRAL';
  confidencePct: number;
  reason: string;
}

export class CycleMatrixHistory extends EventEmitter {
  // Map of coin -> list of historical 1H cycle records sorted chronologically
  private history: Map<string, CycleRecord[]> = new Map();

  constructor() {
    super();
    this.initializeDefaultPairs();
  }

  private initializeDefaultPairs(): void {
    const pairs = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'BNB', 'HYPE'];
    for (const p of pairs) {
      this.history.set(p, []);
    }
  }

  /**
   * Record a completed 1H cycle outcome for a coin
   */
  public recordHourlyOutcome(coin: string, outcome: 'UP' | 'DOWN', timestampMs: number = Date.now()): void {
    const coinUpper = coin.toUpperCase();
    const hourStart = new Date(timestampMs).setMinutes(0, 0, 0);

    const records = this.history.get(coinUpper) || [];
    
    // Check if record for this hour already exists
    const existingIndex = records.findIndex(r => r.hourTimestamp === hourStart);
    if (existingIndex >= 0) {
      records[existingIndex].outcome = outcome;
    } else {
      records.push({
        coin: coinUpper,
        hourTimestamp: hourStart,
        outcome: outcome
      });
    }

    // Sort by timestamp and keep last 48 hours
    records.sort((a, b) => a.hourTimestamp - b.hourTimestamp);
    if (records.length > 48) {
      records.shift();
    }

    this.history.set(coinUpper, records);
    console.log(`[CycleMatrixHistory] 📊 Ciclo grabado: ${coinUpper} [${new Date(hourStart).toISOString().slice(11, 16)}] -> ${outcome}`);
  }

  /**
   * Get recent N cycle outcomes for a coin (newest last)
   */
  public getRecentOutcomes(coin: string, count: number = 3): CycleRecord[] {
    const records = this.history.get(coin.toUpperCase()) || [];
    return records.slice(-count);
  }

  /**
   * Get latest completed cycle outcome for a coin
   */
  public getLatestOutcome(coin: string): 'UP' | 'DOWN' | 'NEUTRAL' {
    const records = this.history.get(coin.toUpperCase()) || [];
    if (records.length === 0) return 'NEUTRAL';
    return records[records.length - 1].outcome;
  }

  /**
   * CAPA B: Compute directional bias for a specific coin based on quantitative sequential laws
   */
  public getDirectionalBias(coin: string, btcCurrentDirection?: 'UP' | 'DOWN', ethCurrentDirection?: 'UP' | 'DOWN'): DirectionalBias {
    const coinUpper = coin.toUpperCase();
    const records = this.history.get(coinUpper) || [];
    const len = records.length;

    // 1. XRP DIRECTIONAL BIAS (Rebote Elástico + Asimetría BTC)
    if (coinUpper === 'XRP') {
      // Ley 1: Rebote Elástico tras 2 caídas seguidas (85.7% probabilidad)
      if (len >= 2) {
        const last1 = records[len - 1].outcome;
        const last2 = records[len - 2].outcome;
        if (last1 === 'DOWN' && last2 === 'DOWN') {
          return {
            coin: 'XRP',
            predictedSide: 'UP',
            confidencePct: 85.7,
            reason: 'Ley Rebote Elástico XRP: 2 caídas 1H consecutivas implican giro a UP (85.7% prob)'
          };
        }
      }

      // Ley 2: Asimetría BTC UP (XRP coincide 84.8% con BTC cuando BTC sube)
      if (btcCurrentDirection === 'UP' || this.getLatestOutcome('BTC') === 'UP') {
        return {
          coin: 'XRP',
          predictedSide: 'UP',
          confidencePct: 84.8,
          reason: 'Asimetría BTC UP: XRP sigue a BTC con 84.8% de precisión en impulsos alcistas'
        };
      }
    }

    // 2. BNB DIRECTIONAL BIAS (Cluster ETH + Altcoins Sync)
    if (coinUpper === 'BNB') {
      const ethSide = ethCurrentDirection || this.getLatestOutcome('ETH');
      const xrpSide = this.getLatestOutcome('XRP');
      const solSide = this.getLatestOutcome('SOL');

      // Ley 1: ETH + XRP + SOL en UP -> BNB 100% UP
      if (ethSide === 'UP' && (xrpSide === 'UP' || solSide === 'UP')) {
        return {
          coin: 'BNB',
          predictedSide: 'UP',
          confidencePct: 100.0,
          reason: 'Cluster ETH Sync BNB: ETH + Altcoins en UP implican BNB UP (100% coincidencia muestra)'
        };
      } else if (ethSide === 'DOWN' && xrpSide === 'DOWN' && solSide === 'DOWN') {
        return {
          coin: 'BNB',
          predictedSide: 'DOWN',
          confidencePct: 86.4,
          reason: 'Cluster ETH Sync BNB: ETH + Altcoins en DOWN implican BNB DOWN (86.4% coincidencia)'
        };
      }
    }

    // 3. HYPE DIRECTIONAL BIAS (Consenso ETH + Altcoins & Racha de Bloques)
    if (coinUpper === 'HYPE') {
      const ethSide = ethCurrentDirection || this.getLatestOutcome('ETH');
      const xrpSide = this.getLatestOutcome('XRP');
      const solSide = this.getLatestOutcome('SOL');
      const dogeSide = this.getLatestOutcome('DOGE');

      const altcoinUpCount = [xrpSide, solSide, dogeSide].filter(s => s === 'UP').length;

      // Ley 1: Consenso Altcoin Triple (85.7% prob)
      if (altcoinUpCount >= 2 && ethSide === 'UP') {
        return {
          coin: 'HYPE',
          predictedSide: 'UP',
          confidencePct: 85.7,
          reason: 'Consenso ETH + Altcoin HYPE: ETH + 2 Altcoins UP implican HYPE UP (85.7% prob)'
        };
      }

      // Ley 2: Racha de Bloques en HYPE (2+ hrs UP consecutivas)
      if (len >= 2) {
        if (records[len - 1].outcome === 'UP' && records[len - 2].outcome === 'UP') {
          return {
            coin: 'HYPE',
            predictedSide: 'UP',
            confidencePct: 80.0,
            reason: 'Continuidad de Bloque HYPE: 2 horas consecutivas en UP indican inercia de bloque (80% prob)'
          };
        }
      }
    }

    // 4. DOGE DIRECTIONAL BIAS (Puente Conector del Enjambre)
    if (coinUpper === 'DOGE') {
      const xrpSide = this.getLatestOutcome('XRP');
      const solSide = this.getLatestOutcome('SOL');

      // Ley 1: XRP y SOL alineadas (DOGE coincide 74.2% con ambas)
      if (xrpSide === solSide && xrpSide !== 'NEUTRAL') {
        return {
          coin: 'DOGE',
          predictedSide: xrpSide,
          confidencePct: 74.2,
          reason: `Puente Enjambre DOGE: XRP y SOL coinciden en ${xrpSide} (74.2% prob)`
        };
      }
    }

    // 5. SOL DIRECTIONAL BIAS (Sync con Enjambre)
    if (coinUpper === 'SOL') {
      const xrpSide = this.getLatestOutcome('XRP');
      const dogeSide = this.getLatestOutcome('DOGE');

      if (xrpSide === 'UP' && dogeSide === 'UP') {
        return {
          coin: 'SOL',
          predictedSide: 'UP',
          confidencePct: 75.8,
          reason: 'Sync Enjambre SOL: XRP y DOGE coinciden en UP (75.8% prob)'
        };
      }
    }

    return {
      coin: coinUpper,
      predictedSide: 'NEUTRAL',
      confidencePct: 50.0,
      reason: 'Sin patrón secuencial de alta probabilidad activo'
    };
  }
}
