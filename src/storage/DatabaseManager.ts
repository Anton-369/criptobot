import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

export interface MarketSnapshotRecord {
  timestampET: string;
  utcHour: number;
  coin: string;
  marketId: string;
  tokenIdUp: string;
  tokenIdDown: string;
  bestAskUp: number;
  bestBidUp: number;
  bestAskDown: number;
  bestBidDown: number;
  yesPrice: number;
  noPrice: number;
  askDepthUp: number;
  askDepthDown: number;
}

export interface SpotPriceRecord {
  timestampET: string;
  utcHour: number;
  coin: string;
  price: number;
  high1h: number;
  low1h: number;
  open1h: number;
  deltaPct1h: number;
}

export interface PredictionLogRecord {
  timestampET: string;
  utcHour: number;
  coin: string;
  pUpEstimado: number;
  reglaActiva: string;
  yesPriceAlDisparo?: number;
  disparoRealizado: boolean;
  pnlResultado?: number;
  status: 'PENDIENTE' | 'EJECUTADO' | 'CANCELADO' | 'GANADO' | 'PERDIDO';
}

export class DatabaseManager {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor() {
    const dataDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'criptobot_v3.sqlite');
    this.db = new sqlite3.Database(this.dbPath);
    this.initTables();
  }

  private initTables(): void {
    this.db.serialize(() => {
      // HFT SQLite Pragmas: WAL mode for concurrent non-blocking reads/writes, 5s busy timeout
      this.db.run(`PRAGMA journal_mode = WAL;`);
      this.db.run(`PRAGMA synchronous = NORMAL;`);
      this.db.run(`PRAGMA busy_timeout = 5000;`);

      // Table 1: snapshots_mercado (1-minute snapshots of Polymarket orderbooks & yes_price)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS snapshots_mercado (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp_et TEXT NOT NULL,
          utc_hour INTEGER NOT NULL,
          coin TEXT NOT NULL,
          market_id TEXT NOT NULL,
          token_id_up TEXT NOT NULL,
          token_id_down TEXT NOT NULL,
          best_ask_up REAL NOT NULL,
          best_bid_up REAL NOT NULL,
          best_ask_down REAL NOT NULL,
          best_bid_down REAL NOT NULL,
          yes_price REAL NOT NULL,
          no_price REAL NOT NULL,
          ask_depth_up REAL NOT NULL,
          ask_depth_down REAL NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Index for fast query on coin and timestamp
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_snapshots_coin_time 
        ON snapshots_mercado (coin, timestamp_et);
      `);

      // Table 2: precios_subyacente (Spot price stream from Binance for 7 coins)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS precios_subyacente (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp_et TEXT NOT NULL,
          utc_hour INTEGER NOT NULL,
          coin TEXT NOT NULL,
          price REAL NOT NULL,
          high_1h REAL NOT NULL,
          low_1h REAL NOT NULL,
          open_1h REAL NOT NULL,
          delta_pct_1h REAL NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_subyacente_coin_time 
        ON precios_subyacente (coin, timestamp_et);
      `);

      // Table 3: predicciones_log (Layer 5 logging of Oracle predictions and executions)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS predicciones_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp_et TEXT NOT NULL,
          utc_hour INTEGER NOT NULL,
          coin TEXT NOT NULL,
          p_up_estimado REAL NOT NULL,
          regla_activa TEXT NOT NULL,
          yes_price_al_disparo REAL,
          disparo_realizado INTEGER DEFAULT 0,
          pnl_resultado REAL,
          status TEXT DEFAULT 'PENDIENTE',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);
    });
    console.log(`[DatabaseManager] 🗄️ Base de datos SQLite (WAL HFT Mode) inicializada en: ${this.dbPath}`);
  }

  public saveSnapshot(rec: MarketSnapshotRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO snapshots_mercado (
          timestamp_et, utc_hour, coin, market_id, token_id_up, token_id_down,
          best_ask_up, best_bid_up, best_ask_down, best_bid_down,
          yes_price, no_price, ask_depth_up, ask_depth_down
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      this.db.run(sql, [
        rec.timestampET, rec.utcHour, rec.coin, rec.marketId, rec.tokenIdUp, rec.tokenIdDown,
        rec.bestAskUp, rec.bestBidUp, rec.bestAskDown, rec.bestBidDown,
        rec.yesPrice, rec.noPrice, rec.askDepthUp, rec.askDepthDown
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public saveSpotPrice(rec: SpotPriceRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO precios_subyacente (
          timestamp_et, utc_hour, coin, price, high_1h, low_1h, open_1h, delta_pct_1h
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      this.db.run(sql, [
        rec.timestampET, rec.utcHour, rec.coin, rec.price,
        rec.high1h, rec.low1h, rec.open1h, rec.deltaPct1h
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public logPrediction(rec: PredictionLogRecord): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO predicciones_log (
          timestamp_et, utc_hour, coin, p_up_estimado, regla_activa,
          yes_price_al_disparo, disparo_realizado, pnl_resultado, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      this.db.run(sql, [
        rec.timestampET, rec.utcHour, rec.coin, rec.pUpEstimado, rec.reglaActiva,
        rec.yesPriceAlDisparo || null, rec.disparoRealizado ? 1 : 0, rec.pnlResultado || null, rec.status
      ], function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  public getRecentSnapshots(coin: string, limit: number = 60): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM snapshots_mercado 
        WHERE coin = ? 
        ORDER BY id DESC 
        LIMIT ?
      `;
      this.db.all(sql, [coin, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  public getPredictionLogs(limit: number = 50): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM predicciones_log 
        ORDER BY id DESC 
        LIMIT ?
      `;
      this.db.all(sql, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  public close(): void {
    this.db.close();
  }
}
