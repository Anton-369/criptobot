export interface LiquidityResult {
  approved: boolean;
  reject_reason?: string;
  spread: number;
  depth_usd: number;
}

export class LiquidityGuard {
  private static readonly MIN_DEPTH_MULTIPLE = 5.0; // 5x order size
  private static readonly MAX_ALLOWED_SPREAD = 0.035; // 3.5% max spread

  /**
   * Validates orderbook depth and spread for execution safety
   */
  public static validateLiquidity(
    bestAsk: number,
    bestBid: number,
    askDepthUSD: number,
    targetOrderUSD: number = 1.0
  ): LiquidityResult {
    const spread = bestAsk - bestBid;
    const minRequiredDepth = targetOrderUSD * this.MIN_DEPTH_MULTIPLE;

    if (spread > this.MAX_ALLOWED_SPREAD) {
      return {
        approved: false,
        spread,
        depth_usd: askDepthUSD,
        reject_reason: `EXCESSIVE_SPREAD: spread=${(spread * 100).toFixed(2)}% > max=${(this.MAX_ALLOWED_SPREAD * 100).toFixed(2)}%`
      };
    }

    if (askDepthUSD < minRequiredDepth) {
      return {
        approved: false,
        spread,
        depth_usd: askDepthUSD,
        reject_reason: `INSUFFICIENT_DEPTH: askDepth=$${askDepthUSD.toFixed(2)} < required=$${minRequiredDepth.toFixed(2)}`
      };
    }

    return {
      approved: true,
      spread,
      depth_usd: askDepthUSD
    };
  }
}
