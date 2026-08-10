import * as fs from 'fs';
import * as path from 'path';

export interface PersistedFill {
  coin: string;
  side: string;
  investedUSDC: number;
  timestamp: number;
  txHash?: string;
}

export interface PersistedState {
  cycleFills: PersistedFill[];
  recentExecutions: PersistedFill[];
  lastSaved: number;
  dailyPnL: number;
  dailyTrades: number;
  lastDailyReset: number; // UTC day start timestamp
}

export class StateManager {
  private statePath: string;
  private state: PersistedState;

  constructor(dataDir: string) {
    this.statePath = path.join(dataDir, 'bot_state.json');
    this.state = this.load();
  }

  private load(): PersistedState {
    try {
      if (fs.existsSync(this.statePath)) {
        const raw = fs.readFileSync(this.statePath, 'utf8');
        const parsed = JSON.parse(raw) as PersistedState;
        return {
          cycleFills: parsed.cycleFills || [],
          recentExecutions: parsed.recentExecutions || [],
          lastSaved: parsed.lastSaved || 0,
          dailyPnL: parsed.dailyPnL || 0,
          dailyTrades: parsed.dailyTrades || 0,
          lastDailyReset: parsed.lastDailyReset || 0,
        };
      }
    } catch (e) {
      console.warn('[StateManager] Could not load state, starting fresh:', (e as Error).message);
    }
    return this.emptyState();
  }

  private emptyState(): PersistedState {
    return {
      cycleFills: [],
      recentExecutions: [],
      lastSaved: 0,
      dailyPnL: 0,
      dailyTrades: 0,
      lastDailyReset: this.todayUtcStart(),
    };
  }

  private todayUtcStart(): number {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);
  }

  private save(): void {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.state.lastSaved = Date.now();
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {
      console.warn('[StateManager] Could not save state:', (e as Error).message);
    }
  }

  /** Clean fills older than a given timestamp, save, return active ones */
  public cleanCycleFills(olderThanMs: number): PersistedFill[] {
    this.state.cycleFills = this.state.cycleFills.filter(f => f.timestamp >= olderThanMs);
    this.save();
    return this.state.cycleFills;
  }

  /** Clean recent executions older than 5 minutes */
  public cleanRecentExecutions(olderThanMs: number): PersistedFill[] {
    this.state.recentExecutions = this.state.recentExecutions.filter(f => f.timestamp >= olderThanMs);
    this.save();
    return this.state.recentExecutions;
  }

  /** Add a new fill and save */
  public addFill(fill: PersistedFill): void {
    this.state.cycleFills.push(fill);
    this.state.recentExecutions.push(fill);
    this.save();
  }

  /** Get current cycle fills (active) */
  public getCycleFills(): PersistedFill[] {
    return this.state.cycleFills;
  }

  /** Get recent executions */
  public getRecentExecutions(): PersistedFill[] {
    return this.state.recentExecutions;
  }

  /** Daily PnL tracking */
  public resetDailyIfNeeded(): void {
    const today = this.todayUtcStart();
    if (this.state.lastDailyReset < today) {
      this.state.dailyPnL = 0;
      this.state.dailyTrades = 0;
      this.state.lastDailyReset = today;
      this.save();
    }
  }

  public addDailyTrade(pnlUSDC: number): void {
    this.resetDailyIfNeeded();
    this.state.dailyPnL += pnlUSDC;
    this.state.dailyTrades += 1;
    this.save();
  }

  public addDailyInvested(amountUSDC: number): void {
    this.resetDailyIfNeeded();
    this.state.dailyPnL += amountUSDC; // reused field for daily invested tracking
    this.save();
  }

  public getDailyInvested(): number {
    this.resetDailyIfNeeded();
    return this.state.dailyPnL;
  }

  public getDailyPnL(): number {
    this.resetDailyIfNeeded();
    return this.state.dailyPnL;
  }

  public getDailyTrades(): number {
    return this.state.dailyTrades;
  }
}
