import sqlite3 from 'sqlite3';

export interface SignalRecord {
  id?: number;
  created_at: string;
  hour_bucket: string;
  coin: string;
  market_token_id?: string;
  model_id?: string;
  model_hash?: string;
  x1_raw?: number;
  x2_raw?: number;
  x1_norm?: number;
  x2_norm?: number;
  z?: number;
  p_ia?: number;
  yes_bid?: number;
  yes_ask?: number;
  yes_mid?: number;
  no_bid?: number;
  no_ask?: number;
  no_mid?: number;
  spread?: number;
  depth_usd?: number;
  vwap_ask_target?: number;
  slippage_est?: number;
  edge_gross_yes?: number;
  edge_gross_no?: number;
  edge_net_yes?: number;
  edge_net_no?: number;
  selected_side?: string;
  status: string;
  reject_reason?: string;
  latency_ms?: number;
  data_quality_ok?: number;
  risk_approved?: number;
}

export interface HealthRecord {
  ts: string;
  module: string;
  status: string;
  latency_ms?: number;
  message?: string;
}

export class Repository {
  constructor(private db: sqlite3.Database) {}

  public saveSignal(signal: SignalRecord): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO signals (
          created_at, hour_bucket, coin, market_token_id, model_id, model_hash,
          x1_raw, x2_raw, x1_norm, x2_norm, z, p_ia,
          yes_bid, yes_ask, yes_mid, no_bid, no_ask, no_mid,
          spread, depth_usd, vwap_ask_target, slippage_est,
          edge_gross_yes, edge_gross_no, edge_net_yes, edge_net_no,
          selected_side, status, reject_reason, latency_ms, data_quality_ok, risk_approved
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
      `;
      const params = [
        signal.created_at, signal.hour_bucket, signal.coin, signal.market_token_id || null,
        signal.model_id || null, signal.model_hash || null,
        signal.x1_raw ?? null, signal.x2_raw ?? null, signal.x1_norm ?? null, signal.x2_norm ?? null,
        signal.z ?? null, signal.p_ia ?? null,
        signal.yes_bid ?? null, signal.yes_ask ?? null, signal.yes_mid ?? null,
        signal.no_bid ?? null, signal.no_ask ?? null, signal.no_mid ?? null,
        signal.spread ?? null, signal.depth_usd ?? null, signal.vwap_ask_target ?? null, signal.slippage_est ?? null,
        signal.edge_gross_yes ?? null, signal.edge_gross_no ?? null, signal.edge_net_yes ?? null, signal.edge_net_no ?? null,
        signal.selected_side || null, signal.status, signal.reject_reason || null,
        signal.latency_ms ?? 0, signal.data_quality_ok ?? 1, signal.risk_approved ?? 0
      ];

      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  }

  public logHealth(health: HealthRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO system_health (ts, module, status, latency_ms, message) VALUES (?, ?, ?, ?, ?)`;
      this.db.run(sql, [health.ts, health.module, health.status, health.latency_ms ?? 0, health.message || ''], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  public getRecentSignals(limit: number = 50): Promise<SignalRecord[]> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM signals ORDER BY id DESC LIMIT ?`;
      this.db.all(sql, [limit], (err, rows) => {
        if (err) return reject(err);
        resolve(rows as SignalRecord[]);
      });
    });
  }
}
