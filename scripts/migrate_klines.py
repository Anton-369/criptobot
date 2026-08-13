#!/usr/bin/env python3
"""
Migra datos existentes de precios_subyacente a klines_1m para que los scripts de IA funcionen.
"""
import sqlite3
from datetime import datetime, timezone

DB_PATH = '/home/anton/criptobot/data/criptobot_v3.sqlite'

def migrate():
    conn = sqlite3.connect(DB_PATH)
    
    # Create table if not exists
    conn.execute('''
        CREATE TABLE IF NOT EXISTS klines_1m (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            coin TEXT NOT NULL,
            cycle_key TEXT NOT NULL,
            minute_in_hour INTEGER NOT NULL,
            open_price REAL NOT NULL,
            close_price REAL NOT NULL,
            open_time_ms INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_klines_unique ON klines_1m (coin, cycle_key, minute_in_hour)')
    
    rows = conn.execute('''
        SELECT timestamp_et, utc_hour, coin, price, open_1h 
        FROM precios_subyacente 
        ORDER BY id ASC
    ''').fetchall()
    
    inserted = 0
    for row in rows:
        ts_et, utc_hour, coin, price, open_1h = row
        try:
            # Parse timestamp to get minute
            dt = datetime.strptime(ts_et, '%Y-%m-%d %H:%M:%S')
            minute_in_hour = dt.minute
            cycle_date = dt.strftime('%Y-%m-%d')
            # Adjust to UTC: add 4 hours back
            utc_dt = datetime(dt.year, dt.month, dt.day, (dt.hour + 4) % 24, dt.minute, 0)
            cycle_key = f"{utc_dt.strftime('%Y-%m-%d')}_{str(utc_hour).zfill(2)}"
            open_time_ms = int(utc_dt.replace(tzinfo=timezone.utc).timestamp() * 1000)
            
            conn.execute('''
                INSERT OR REPLACE INTO klines_1m (coin, cycle_key, minute_in_hour, open_price, close_price, open_time_ms)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (coin, cycle_key, minute_in_hour, open_1h, price, open_time_ms))
            inserted += 1
        except Exception as e:
            pass
    
    conn.commit()
    total = conn.execute('SELECT COUNT(*) FROM klines_1m').fetchone()[0]
    coins = conn.execute('SELECT DISTINCT coin FROM klines_1m').fetchall()
    conn.close()
    
    print(f'✅ Migración completada: {inserted} registros insertados en klines_1m.')
    print(f'   Total registros en klines_1m: {total}')
    print(f'   Monedas: {[c[0] for c in coins]}')

if __name__ == '__main__':
    migrate()
