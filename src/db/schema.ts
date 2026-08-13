import sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export const DB_PATH = path.resolve(__dirname, '../../data/criptobot.db');

export function initDatabase(): Promise<sqlite3.Database> {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('[DB] ❌ Error opening SQLite database:', err);
        return reject(err);
      }
      console.log(`[DB] 🗄️ SQLite database initialized at ${DB_PATH}`);

      db.exec(CREATE_SCHEMA_SQL, (schemaErr) => {
        if (schemaErr) {
          console.error('[DB] ❌ Error creating 5-table schema:', schemaErr);
          return reject(schemaErr);
        }
        console.log('[DB] ✅ 5-table relational schema verified/created successfully.');
        resolve(db);
      });
    });
  });
}

const CREATE_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Table 1: Signals
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  hour_bucket TEXT NOT NULL,
  coin TEXT NOT NULL,
  market_token_id TEXT,
  model_id TEXT,
  model_hash TEXT,
  x1_raw REAL,
  x2_raw REAL,
  x1_norm REAL,
  x2_norm REAL,
  z REAL,
  p_ia REAL,
  yes_bid REAL,
  yes_ask REAL,
  yes_mid REAL,
  no_bid REAL,
  no_ask REAL,
  no_mid REAL,
  spread REAL,
  depth_usd REAL,
  vwap_ask_target REAL,
  slippage_est REAL,
  edge_gross_yes REAL,
  edge_gross_no REAL,
  edge_net_yes REAL,
  edge_net_no REAL,
  selected_side TEXT,
  status TEXT,
  reject_reason TEXT,
  latency_ms INTEGER,
  data_quality_ok INTEGER,
  risk_approved INTEGER,
  UNIQUE(hour_bucket, coin, market_token_id)
);

-- Table 2: Orders
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id INTEGER,
  client_order_id TEXT UNIQUE,
  exchange_order_id TEXT,
  market_token_id TEXT,
  side TEXT,
  order_type TEXT,
  status TEXT,
  price_limit REAL,
  qty REAL,
  filled_qty REAL,
  avg_fill_price REAL,
  created_at TEXT,
  updated_at TEXT,
  error_message TEXT,
  FOREIGN KEY(signal_id) REFERENCES signals(id)
);

-- Table 3: Positions
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id INTEGER,
  order_id INTEGER,
  coin TEXT,
  market_token_id TEXT,
  side TEXT,
  status TEXT,
  entry_price REAL,
  exit_price REAL,
  qty REAL,
  entry_usd REAL,
  exit_usd REAL,
  fees REAL,
  slippage REAL,
  pnl REAL,
  opened_at TEXT,
  closed_at TEXT,
  exit_reason TEXT,
  FOREIGN KEY(signal_id) REFERENCES signals(id),
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

-- Table 4: Reconciliations
CREATE TABLE IF NOT EXISTS reconciliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hour_bucket TEXT,
  coin TEXT,
  market_token_id TEXT,
  final_spot_price REAL,
  expected_outcome TEXT,
  actual_outcome TEXT,
  pnl REAL,
  status TEXT,
  reconciled_at TEXT,
  notes TEXT
);

-- Table 5: System Health & Audit
CREATE TABLE IF NOT EXISTS system_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  module TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  message TEXT
);
`;
