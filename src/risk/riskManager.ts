import { Repository } from '../db/repository';

export interface RiskCheckResult {
  approved: boolean;
  reject_reason?: string;
  active_exposure_usd: number;
  daily_pnl_usd: number;
  consecutive_losses: number;
  is_kill_switch_active: boolean;
}

export class RiskManager {
  private static readonly MAX_EXPOSURE_USD = 10.0;    // Max active exposure $10 USD
  private static readonly MAX_DAILY_LOSS_USD = -5.0;  // Kill switch if daily loss <= -$5.00 USD
  private static readonly MAX_CONSECUTIVE_LOSSES = 3; // Pause 2h if 3 consecutive losses
  private static readonly MAX_POSITIONS_PER_COIN = 1; // 1 position per coin per cycle

  private activeExposureUSD: number = 0;
  private dailyPnLUSD: number = 0;
  private consecutiveLosses: number = 0;
  private isKillSwitchActive: boolean = false;
  private killSwitchReason: string = '';
  private pausedUntilMs: number = 0;

  constructor(initialExposure: number = 0, initialDailyPnL: number = 0) {
    this.activeExposureUSD = initialExposure;
    this.dailyPnLUSD = initialDailyPnL;
  }

  /**
   * Restores state from SQLite to guarantee persistence across process restarts
   */
  public async syncFromDatabase(repo: Repository): Promise<void> {
    try {
      const now = new Date();
      const todayStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)).toISOString();

      this.activeExposureUSD = await repo.getActiveExposureUSD();
      this.dailyPnLUSD = await repo.getDailyPnLUSD(todayStartIso);

      console.log(`[RiskManager] 🔄 State synced from SQLite. Active Exposure: $${this.activeExposureUSD.toFixed(2)} | Daily PnL: $${this.dailyPnLUSD.toFixed(2)}`);

      if (this.dailyPnLUSD <= RiskManager.MAX_DAILY_LOSS_USD) {
        this.isKillSwitchActive = true;
        this.killSwitchReason = `DAILY_DRAWDOWN_EXCEEDED (Restored from DB): Daily PnL=$${this.dailyPnLUSD.toFixed(2)} <= -$5.00`;
        console.error(`[RiskManager] 🚨 RESTORED KILL SWITCH FROM DB! ${this.killSwitchReason}`);
      }
    } catch (err: any) {
      console.error(`[RiskManager] ⚠️ Error syncing state from DB:`, err.message);
    }
  }

  /**
   * Resets daily PnL counter at 00:00 UTC
   */
  public resetDailyStats(): void {
    console.log(`[RiskManager] 🌅 Resetting daily PnL stats. Previous Daily PnL: $${this.dailyPnLUSD.toFixed(2)}`);
    this.dailyPnLUSD = 0;
    this.consecutiveLosses = 0;
    this.isKillSwitchActive = false;
    this.killSwitchReason = '';
  }

  /**
   * Updates state after a trade settles
   */
  public recordTradeOutcome(pnlUSD: number, coin: string): void {
    this.dailyPnLUSD += pnlUSD;

    if (pnlUSD < 0) {
      this.consecutiveLosses++;
      console.warn(`[RiskManager] ⚠️ Loss recorded for ${coin}: $${pnlUSD.toFixed(2)}. Consecutive losses: ${this.consecutiveLosses}`);
    } else {
      this.consecutiveLosses = 0;
      console.log(`[RiskManager] ✅ Win recorded for ${coin}: +$${pnlUSD.toFixed(2)}. Streak reset to 0.`);
    }

    // Check Daily Drawdown Kill Switch
    if (this.dailyPnLUSD <= RiskManager.MAX_DAILY_LOSS_USD) {
      this.isKillSwitchActive = true;
      this.killSwitchReason = `DAILY_DRAWDOWN_EXCEEDED: Daily PnL=$${this.dailyPnLUSD.toFixed(2)} <= max loss=$${RiskManager.MAX_DAILY_LOSS_USD.toFixed(2)}`;
      console.error(`[RiskManager] 🚨 GLOBAL KILL SWITCH ACTIVATED! ${this.killSwitchReason}`);
    }

    // Check Consecutive Losses Guard (Pause trading for 2 hours)
    if (this.consecutiveLosses >= RiskManager.MAX_CONSECUTIVE_LOSSES) {
      this.pausedUntilMs = Date.now() + (2 * 60 * 60 * 1000); // 2 hours pause
      console.warn(`[RiskManager] ⏸️ 3 Consecutive losses reached. Trading paused for 2 hours until ${new Date(this.pausedUntilMs).toISOString()}`);
    }
  }

  /**
   * Validates if a new trade of targetOrderUSD is safe to execute
   */
  public validateTrade(
    coin: string,
    targetOrderUSD: number = 1.0,
    openPositionsCountForCoin: number = 0,
    currentTotalExposureUSD?: number
  ): RiskCheckResult {
    if (currentTotalExposureUSD !== undefined) {
      this.activeExposureUSD = currentTotalExposureUSD;
    }

    // 1. Check Global Kill Switch
    if (this.isKillSwitchActive) {
      return {
        approved: false,
        reject_reason: `KILL_SWITCH_ACTIVE: ${this.killSwitchReason}`,
        active_exposure_usd: this.activeExposureUSD,
        daily_pnl_usd: this.dailyPnLUSD,
        consecutive_losses: this.consecutiveLosses,
        is_kill_switch_active: true
      };
    }

    // 2. Check Pause Timer
    if (Date.now() < this.pausedUntilMs) {
      const remainingMin = Math.ceil((this.pausedUntilMs - Date.now()) / 60000);
      return {
        approved: false,
        reject_reason: `CONSECUTIVE_LOSS_PAUSE: Trading paused for ${remainingMin} more minutes`,
        active_exposure_usd: this.activeExposureUSD,
        daily_pnl_usd: this.dailyPnLUSD,
        consecutive_losses: this.consecutiveLosses,
        is_kill_switch_active: false
      };
    }

    // 3. Check Active Exposure Limit
    if (this.activeExposureUSD + targetOrderUSD > RiskManager.MAX_EXPOSURE_USD) {
      return {
        approved: false,
        reject_reason: `MAX_EXPOSURE_EXCEEDED: current=$${this.activeExposureUSD.toFixed(2)} + order=$${targetOrderUSD.toFixed(2)} > max=$${RiskManager.MAX_EXPOSURE_USD.toFixed(2)}`,
        active_exposure_usd: this.activeExposureUSD,
        daily_pnl_usd: this.dailyPnLUSD,
        consecutive_losses: this.consecutiveLosses,
        is_kill_switch_active: false
      };
    }

    // 4. Check Open Positions per Coin limit
    if (openPositionsCountForCoin >= RiskManager.MAX_POSITIONS_PER_COIN) {
      return {
        approved: false,
        reject_reason: `COIN_POSITION_LIMIT_REACHED: ${coin} already has ${openPositionsCountForCoin} active position(s)`,
        active_exposure_usd: this.activeExposureUSD,
        daily_pnl_usd: this.dailyPnLUSD,
        consecutive_losses: this.consecutiveLosses,
        is_kill_switch_active: false
      };
    }

    return {
      approved: true,
      active_exposure_usd: this.activeExposureUSD,
      daily_pnl_usd: this.dailyPnLUSD,
      consecutive_losses: this.consecutiveLosses,
      is_kill_switch_active: false
    };
  }
}
