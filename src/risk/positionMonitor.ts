import { PolymarketClobConnector } from '../connectors/PolymarketClob';
import { Repository } from '../db/repository';
import { RiskManager } from '../risk/riskManager';
import { EarlyExitEngine } from '../risk/earlyExit';

export class PositionMonitor {
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(
    private polyClob: PolymarketClobConnector,
    private repository: Repository,
    private riskManager: RiskManager
  ) {}

  public start(intervalMs: number = 5000): void {
    console.log(`[PositionMonitor] 🛡️ Starting active 5-second Position & Early Exit Monitor...`);
    if (this.monitorInterval) clearInterval(this.monitorInterval);
    this.monitorInterval = setInterval(() => this.checkOpenPositions(), intervalMs);
  }

  public stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  public async checkOpenPositions(): Promise<void> {
    try {
      const openPositions = await this.repository.getActivePositions();
      if (openPositions.length === 0) return;

      for (const pos of openPositions) {
        if (!pos.id || !pos.market_token_id) continue;

        // Fetch current best odds for this token
        const odds = await this.polyClob.getBestOdds(pos.market_token_id, pos.market_token_id);
        if (!odds) continue;

        // Current Bid is what we can sell for immediately
        const currentBid = pos.side === 'YES' || pos.side === 'UP' ? odds.upBestBid : odds.downBestBid;
        if (currentBid <= 0) continue;

        const decision = EarlyExitEngine.evaluatePosition(currentBid, pos.entry_price);

        if (decision.trigger_exit && decision.type) {
          console.log(`[PositionMonitor] ⚡ ${decision.reason} for ${pos.coin} (ID: ${pos.id})`);

          // Calculate exit USD and PnL
          const exitUSD = pos.qty * currentBid;
          const pnlUSD = exitUSD - pos.entry_usd;

          // Update position status in SQLite
          const exitStatus = decision.type === 'TAKE_PROFIT' ? 'CLOSED_TP' : 'CLOSED_SL';
          await this.repository.updatePositionStatus(
            pos.id,
            exitStatus,
            currentBid,
            exitUSD,
            pnlUSD,
            decision.reason || ''
          );

          // Update RiskManager PnL & streaks
          this.riskManager.recordTradeOutcome(pnlUSD, pos.coin);

          console.log(`[PositionMonitor] ✅ Position #${pos.id} closed (${exitStatus}). Realized PnL: $${pnlUSD.toFixed(2)}`);
        }
      }
    } catch (err: any) {
      console.error(`[PositionMonitor] ⚠️ Error checking open positions:`, err.message);
    }
  }
}
