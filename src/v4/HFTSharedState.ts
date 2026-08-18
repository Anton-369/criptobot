

export const REVERSE_ASSET_MAP: string[] = ['SOL', 'XRP', 'DOGE', 'BNB', 'HYPE'];
export const ASSET_MAP: Record<string, number> = { 'SOL': 0, 'XRP': 1, 'DOGE': 2, 'BNB': 3, 'HYPE': 4 };

const NUM_ASSETS = 5;
const TOTAL_SLOTS = 10; // Prices, Opens(1H,15M,5M), Asks(1H_UP,1H_DN,15M_UP,15M_DN,5M_UP,5M_DN)
const memoryBuffer = new ArrayBuffer(NUM_ASSETS * TOTAL_SLOTS * Float64Array.BYTES_PER_ELEMENT);

export class HFTSharedState {
  private static prices = new Float64Array(memoryBuffer, 0, NUM_ASSETS);
  private static opens1H = new Float64Array(memoryBuffer, NUM_ASSETS * 8, NUM_ASSETS);
  private static opens15M = new Float64Array(memoryBuffer, NUM_ASSETS * 16, NUM_ASSETS);
  private static opens5M = new Float64Array(memoryBuffer, NUM_ASSETS * 24, NUM_ASSETS);

  // Dedicated Ask prices per timeframe (1H, 15M, 5M) to prevent memory corruption
  private static asks1H_UP = new Float64Array(memoryBuffer, NUM_ASSETS * 32, NUM_ASSETS);
  private static asks1H_DN = new Float64Array(memoryBuffer, NUM_ASSETS * 40, NUM_ASSETS);
  private static asks15M_UP = new Float64Array(memoryBuffer, NUM_ASSETS * 48, NUM_ASSETS);
  private static asks15M_DN = new Float64Array(memoryBuffer, NUM_ASSETS * 56, NUM_ASSETS);
  private static asks5M_UP = new Float64Array(memoryBuffer, NUM_ASSETS * 64, NUM_ASSETS);
  private static asks5M_DN = new Float64Array(memoryBuffer, NUM_ASSETS * 72, NUM_ASSETS);

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

  public static updatePolyAsk(coin: string, side: 'UP' | 'DOWN', timeframe: '1H' | '15M' | '5M', askPrice: number): void {
    const idx = ASSET_MAP[coin];
    if (idx === undefined) return;

    if (timeframe === '1H') {
      if (side === 'UP') HFTSharedState.asks1H_UP[idx] = askPrice;
      else HFTSharedState.asks1H_DN[idx] = askPrice;
    } else if (timeframe === '15M') {
      if (side === 'UP') HFTSharedState.asks15M_UP[idx] = askPrice;
      else HFTSharedState.asks15M_DN[idx] = askPrice;
    } else if (timeframe === '5M') {
      if (side === 'UP') HFTSharedState.asks5M_UP[idx] = askPrice;
      else HFTSharedState.asks5M_DN[idx] = askPrice;
    }
  }

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

  public static getPolyAsk(coin: string, side: 'UP' | 'DOWN', timeframe: '1H' | '15M' | '5M' = '15M'): number {
    const idx = ASSET_MAP[coin];
    if (idx === undefined) return 0;
    if (timeframe === '1H') return side === 'UP' ? HFTSharedState.asks1H_UP[idx] : HFTSharedState.asks1H_DN[idx];
    if (timeframe === '15M') return side === 'UP' ? HFTSharedState.asks15M_UP[idx] : HFTSharedState.asks15M_DN[idx];
    if (timeframe === '5M') return side === 'UP' ? HFTSharedState.asks5M_UP[idx] : HFTSharedState.asks5M_DN[idx];
    return 0;
  }
}
