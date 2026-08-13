export interface HypeMetrics {
  velocity_1m_pct: number;
  velocity_3m_pct: number;
  hype_score: number; // Normalized -1.0 (bearish burst) to +1.0 (bullish burst)
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
}

export class HypeSignalEngine {
  /**
   * Calculates HYPE micro-momentum velocity from 1m candles
   */
  public static calculateHype(candles1m: { open: number; close: number; [key: string]: any }[]): HypeMetrics {
    if (!candles1m || candles1m.length < 3) {
      return { velocity_1m_pct: 0, velocity_3m_pct: 0, hype_score: 0, direction: 'NEUTRAL' };
    }

    const currentClose = candles1m[candles1m.length - 1].close;
    const prev1mClose = candles1m[candles1m.length - 2].close;
    const prev3mClose = candles1m[Math.max(0, candles1m.length - 4)].close;

    const vel1m = ((currentClose - prev1mClose) / (prev1mClose || 1)) * 100;
    const vel3m = ((currentClose - prev3mClose) / (prev3mClose || 1)) * 100;

    // HYPE score combining 1m velocity (60% weight) and 3m velocity (40% weight)
    const rawScore = (vel1m * 0.6) + (vel3m * 0.4);

    // Normalize between -1.0 and +1.0 using tanh scaling
    const hypeScore = Math.tanh(rawScore / 0.5);

    let direction: 'UP' | 'DOWN' | 'NEUTRAL' = 'NEUTRAL';
    if (hypeScore >= 0.3) {
      direction = 'UP';
    } else if (hypeScore <= -0.3) {
      direction = 'DOWN';
    }

    return {
      velocity_1m_pct: vel1m,
      velocity_3m_pct: vel3m,
      hype_score: hypeScore,
      direction
    };
  }
}
