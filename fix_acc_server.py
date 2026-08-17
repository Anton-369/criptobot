import os

server_ts_path = '/home/anton/criptobot/src/dashboard/server.ts'
with open(server_ts_path, 'r') as f:
    server_code = f.read()

# Replace getAccumulationMetrics implementation
old_acc_fn = """  private async getAccumulationMetrics(): Promise<any> {
    const coins = ['XRPUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'HYPEUSDT'];
    const result = [];
    
    try {
      const sqlite3 = require('sqlite3');
      const dbPath = path.resolve(__dirname, '../../data/criptobot.db');
      if (fs.existsSync(dbPath)) {
        const db = new sqlite3.Database(dbPath);
        const rows: any = await new Promise((resolve) => {
          db.all("SELECT coin, COUNT(*) as count, AVG(edge_net_yes) as avg_edge FROM signals GROUP BY coin", [], (err: any, r: any) => resolve(r || []));
        });
        db.close();

        const countsMap: any = {};
        for (const r of rows) {
          countsMap[r.coin?.toUpperCase()] = r.count || 0;
        }

        for (const coin of coins) {
          const count = countsMap[coin] || 0;
          const target = 200;
          const pct = Math.min(100, (count / target) * 100);
          const status = count < 200 ? 'INSUFFICIENT -- no usar para produccion (n < 200)' : 'SUFFICIENT_FOR_PRODUCTION';
          result.push({
            coin,
            n_casos: count,
            target_n: target,
            pct: Math.round(pct * 100) / 100,
            status,
            stake_allowed: 1.0
          });
        }
      }
    } catch (err: any) {
      console.warn('[Dashboard] Error leyendo métricas de acumulación SQLite:', err.message);
    }
    return result;
  }"""

new_acc_fn = """  private async getAccumulationMetrics(): Promise<any> {
    const targetCoins = [
      { display: 'XRPUSDT', dbKeys: ['XRP', 'XRPUSDT'] },
      { display: 'SOLUSDT', dbKeys: ['SOL', 'SOLUSDT'] },
      { display: 'BNBUSDT', dbKeys: ['BNB', 'BNBUSDT'] },
      { display: 'DOGEUSDT', dbKeys: ['DOGE', 'DOGEUSDT'] },
      { display: 'HYPEUSDT', dbKeys: ['HYPE', 'HYPEUSDT'] }
    ];
    const result = [];
    
    try {
      const sqlite3 = require('sqlite3');
      const dbPath = '/home/anton/criptobot/data/criptobot.db';
      if (fs.existsSync(dbPath)) {
        const db = new sqlite3.Database(dbPath);
        const rows: any = await new Promise((resolve) => {
          db.all("SELECT coin, COUNT(*) as count FROM signals GROUP BY coin", [], (err: any, r: any) => resolve(r || []));
        });
        db.close();

        const countsMap: any = {};
        for (const r of rows) {
          if (r.coin) countsMap[r.coin.toUpperCase()] = r.count || 0;
        }

        for (const item of targetCoins) {
          let count = 0;
          for (const k of item.dbKeys) {
            count += (countsMap[k] || 0);
          }
          const target = 200;
          const pct = Math.min(100, (count / target) * 100);
          const status = count < 200 ? 'INSUFFICIENT (n < 200)' : 'SUFFICIENT_FOR_PRODUCTION';
          result.push({
            coin: item.display,
            n_casos: count,
            target_n: target,
            pct: Math.round(pct * 100) / 100,
            status,
            stake_allowed: 1.0
          });
        }
      }
    } catch (err: any) {
      console.warn('[Dashboard] Error leyendo métricas de acumulación SQLite:', err.message);
    }
    return result;
  }"""

server_code = server_code.replace(old_acc_fn, new_acc_fn)

# Also fix getCollectorMetrics absolute path
server_code = server_code.replace("const polyDbPath = '/home/anton/criptobot/data/criptobot_polymarket.db';", "const polyDbPath = '/home/anton/oraculo-cripto/data/criptobot_polymarket.db';")
server_code = server_code.replace("const dbPath = path.resolve(__dirname, '../../data/criptobot.db');", "const dbPath = '/home/anton/criptobot/data/criptobot.db';")

with open(server_ts_path, 'w') as f:
    f.write(server_code)

print("✅ server.ts actualizado con normalización de claves y rutas absolutas.")
