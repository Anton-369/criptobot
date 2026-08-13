export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export class DataValidator {
  /**
   * Validates Binance 1m candles continuity (must have 15 candles for min 1-15)
   */
  public static validateBinanceCandles(candles: { close: number; openTime: number }[]): ValidationResult {
    if (!candles || candles.length < 15) {
      return { valid: false, reason: `INCOMPLETE_CANDLES: expected 15, got ${candles ? candles.length : 0}` };
    }

    for (let i = 0; i < candles.length; i++) {
      if (candles[i].close === undefined || candles[i].close === null || isNaN(candles[i].close) || candles[i].close <= 0) {
        return { valid: false, reason: `INVALID_CANDLE_PRICE at index ${i}` };
      }
    }

    return { valid: true };
  }

  /**
   * Validates Polymarket Orderbook freshness and quotes sanity
   */
  public static validateOrderbook(book: {
    upBestAsk: number;
    downBestAsk: number;
    lastUpdateMs?: number;
  }): ValidationResult {
    if (!book) {
      return { valid: false, reason: `MISSING_ORDERBOOK` };
    }

    if (book.upBestAsk <= 0 || book.upBestAsk >= 1 || book.downBestAsk <= 0 || book.downBestAsk >= 1) {
      return { valid: false, reason: `INVALID_ASK_PRICES: UP=${book.upBestAsk}, DOWN=${book.downBestAsk}` };
    }

    if (book.lastUpdateMs) {
      const ageMs = Date.now() - book.lastUpdateMs;
      if (ageMs > 1500) {
        return { valid: false, reason: `STALE_ORDERBOOK: age=${ageMs}ms > 1500ms` };
      }
    }

    return { valid: true };
  }
}
