export class TimingGuard {
  private static readonly TARGET_MINUTE = 15;
  private static readonly OFFSET_MS = 1500; // 1.5s past minute 15 to ensure Binance 1m candle completion

  /**
   * Returns true if current time is within the firing window (:15:01.500 to :15:05.000)
   */
  public static isFiringWindow(nowMs: number = Date.now()): boolean {
    const d = new Date(nowMs);
    const minute = d.getUTCMinutes();
    const second = d.getUTCSeconds();
    const ms = d.getUTCMilliseconds();

    if (minute !== this.TARGET_MINUTE) return false;

    const currentSecondMs = (second * 1000) + ms;
    // Window: 1,500ms to 5,000ms past minute 15
    return currentSecondMs >= this.OFFSET_MS && currentSecondMs <= 5000;
  }

  /**
   * Calculates milliseconds until next :15:01.500 trigger
   */
  public static getMsUntilNextTrigger(nowMs: number = Date.now()): number {
    const d = new Date(nowMs);
    const nextTrigger = new Date(d);

    if (d.getUTCMinutes() > this.TARGET_MINUTE || (d.getUTCMinutes() === this.TARGET_MINUTE && d.getUTCSeconds() >= 5)) {
      nextTrigger.setUTCHours(d.getUTCHours() + 1);
    }

    nextTrigger.setUTCMinutes(this.TARGET_MINUTE, 1, 500);
    return Math.max(0, nextTrigger.getTime() - nowMs);
  }
}
