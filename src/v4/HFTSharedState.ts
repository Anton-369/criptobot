/**
 * ⚡ HFT SHARED STATE MANAGER (ZERO-GC TYPED ARRAYS)
 * Arquitectura Híbrida V4 - Memoria Contigua en RAM con compilación JIT O(1)
 * 
 * Sin alias 'self' ni variables intermedias. Acceso estático directo a la RAM.
 */

export const ASSET_MAP: Record<string, number> = {
  'SOL': 0,
  'XRP': 1,
  'DOGE': 2,
  'BNB': 3,
  'HYPE': 4
};

export const REVERSE_ASSET_MAP: string[] = ['SOL', 'XRP', 'DOGE', 'BNB', 'HYPE'];

const NUM_ASSETS = 5;

// Buffer de memoria contigua en RAM
// Layout: Prices (0..4), Opens1H (5..9), Opens15M (10..14), Opens5M (15..19), AsksUP (20..24), AsksDOWN (25..29)
const TOTAL_SLOTS = 6;
const memoryBuffer = new ArrayBuffer(NUM_ASSETS * TOTAL_SLOTS * Float64Array.BYTES_PER_ELEMENT);

export class HFTSharedState {
  private static prices = new Float64Array(memoryBuffer, 0, NUM_ASSETS);
  private static opens1H = new Float64Array(memoryBuffer, NUM_ASSETS * 8, NUM_ASSETS);
  private static opens15M = new Float64Array(memoryBuffer, NUM_ASSETS * 16, NUM_ASSETS);
  private static opens5M = new Float64Array(memoryBuffer, NUM_ASSETS * 24, NUM_ASSETS);
  private static polyAsksUP = new Float64Array(memoryBuffer, NUM_ASSETS * 32, NUM_ASSETS);
  private static polyAsksDOWN = new Float64Array(memoryBuffer, NUM_ASSETS * 40, NUM_ASSETS);

  // Actualización instantánea con Klines nativas de Binance
  public static updateNativeKline(coin: string, interval: string, openPrice: number, currentPrice: number): void {
    const idx = ASSET_MAP[coin];
    if (idx === undefined) return;

    HFTSharedState.prices[idx] = currentPrice;

    if (interval === '1h') {
      HFTSharedState.opens1H[idx] = openPrice;
    } else if (interval === '15m') {
      HFTSharedState.opens15M[idx] = openPrice;
    } else if (interval === '5m') {
      HFTSharedState.opens5M[idx] = openPrice;
    }
  }

  // Actualizar precio Ask de Polymarket en RAM
  public static updatePolyAsk(coin: string, side: 'UP' | 'DOWN', askPrice: number): void {
    const idx = ASSET_MAP[coin];
    if (idx === undefined) return;

    if (side === 'UP') {
      HFTSharedState.polyAsksUP[idx] = askPrice;
    } else {
      HFTSharedState.polyAsksDOWN[idx] = askPrice;
    }
  }

  // Lectura directa en nanosegundos (Sin instanciación)
  public static getSpotPrice(coin: string): number {
    const idx = ASSET_MAP[coin];
    return idx !== undefined ? HFTSharedState.prices[idx] : 0;
  }

  public static getDelta1H(coin: string): number {
    const idx = ASSET_MAP[coin];
    if (idx === undefined) return 0;
    const open = HFTSharedState.opens1H[idx];
    const curr = HFTSharedState.prices[idx];
    return open > 0 ? ((curr - open) / open) * 100.0 : 0;
  }

  public static getDelta15M(coin: string): number {
    const idx = ASSET_MAP[coin];
    if (idx === undefined) return 0;
    const open = HFTSharedState.opens15M[idx];
    const curr = HFTSharedState.prices[idx];
    return open > 0 ? ((curr - open) / open) * 100.0 : 0;
  }

  public static getDelta5M(coin: string): number {
    const idx = ASSET_MAP[coin];
    if (idx === undefined) return 0;
    const open = HFTSharedState.opens5M[idx];
    const curr = HFTSharedState.prices[idx];
    return open > 0 ? ((curr - open) / open) * 100.0 : 0;
  }

  public static getPolyAsk(coin: string, side: 'UP' | 'DOWN'): number {
    const idx = ASSET_MAP[coin];
    if (idx === undefined) return 0;
    return side === 'UP' ? HFTSharedState.polyAsksUP[idx] : HFTSharedState.polyAsksDOWN[idx];
  }
}
