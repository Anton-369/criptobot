export interface EarlyExitDecision {
  trigger_exit: boolean;
  type?: 'TAKE_PROFIT' | 'STOP_LOSS';
  reason?: string;
  current_price: number;
  entry_price: number;
  unrealized_pnl_pct: number;
}

export class EarlyExitEngine {
  private static readonly TP_THRESHOLD_PRICE = 0.92; // Take profit at >= $0.92
  private static readonly SL_THRESHOLD_PRICE = 0.35; // Stop loss at <= $0.35

  /**
   * Evaluates an open position for early exit criteria
   */
  public static evaluatePosition(
    currentBidPrice: number,
    entryPrice: number
  ): EarlyExitDecision {
    const pnlPct = ((currentBidPrice - entryPrice) / (entryPrice || 0.5)) * 100;

    // 1. Take Profit Check
    if (currentBidPrice >= this.TP_THRESHOLD_PRICE) {
      return {
        trigger_exit: true,
        type: 'TAKE_PROFIT',
        reason: `TP_TRIGGERED: price=$${currentBidPrice.toFixed(3)} >= target=$${this.TP_THRESHOLD_PRICE.toFixed(2)} (+${pnlPct.toFixed(1)}%)`,
        current_price: currentBidPrice,
        entry_price: entryPrice,
        unrealized_pnl_pct: pnlPct
      };
    }

    // 2. Stop Loss Check
    if (currentBidPrice <= this.SL_THRESHOLD_PRICE) {
      return {
        trigger_exit: true,
        type: 'STOP_LOSS',
        reason: `SL_TRIGGERED: price=$${currentBidPrice.toFixed(3)} <= stop=$${this.SL_THRESHOLD_PRICE.toFixed(2)} (${pnlPct.toFixed(1)}%)`,
        current_price: currentBidPrice,
        entry_price: entryPrice,
        unrealized_pnl_pct: pnlPct
      };
    }

    return {
      trigger_exit: false,
      current_price: currentBidPrice,
      entry_price: entryPrice,
      unrealized_pnl_pct: pnlPct
    };
  }
}
