#!/usr/bin/env python3
"""
scripts/download_1m_data.py
Fase 2-3: Ingesta de Klines de 1 Minuto para Eliminación de Lookahead Bias (Criptobot v3.0)

Este script descarga klines de 1 minuto para las 7 monedas (BTC, ETH, XRP, SOL, DOGE, BNB, HYPE)
durante los últimos 30 días para evaluar la velocidad de movimiento intra-hora en las ventanas 0..15m.
"""

import sys
import os
import json
import time
import sqlite3
import datetime
import urllib.request

DB_PATH = '/home/anton/criptobot/data/criptobot_v3.sqlite'
PAIRS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'BNB', 'HYPE']

def init_1m_table(conn):
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS klines_1m (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            coin TEXT NOT NULL,
            open_time_ms INTEGER NOT NULL,
            close_time_ms INTEGER NOT NULL,
            timestamp_utc TEXT NOT NULL,
            open_price REAL NOT NULL,
            high_price REAL NOT NULL,
            low_price REAL NOT NULL,
            close_price REAL NOT NULL,
            volume REAL NOT NULL,
            cycle_key TEXT NOT NULL,
            minute_in_hour INTEGER NOT NULL,
            UNIQUE(coin, open_time_ms)
        );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_klines_1m_coin_cycle ON klines_1m (coin, cycle_key);")
    conn.commit()

def fetch_json(url):
    headers = {'User-Agent': 'Mozilla/5.0'}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status == 200:
            return json.loads(resp.read().decode('utf-8'))
    return None

def fetch_1m_binance(symbol, days=30):
    print(f"📥 Descargando 1m klines para {symbol} ({days} días)...")
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - (days * 24 * 3600 * 1000)

    klines = []
    curr = start_ms
    while curr < end_ms:
        url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval=1m&startTime={curr}&limit=1000"
        try:
            data = fetch_json(url)
            if not data: break
            klines.extend(data)
            curr = data[-1][6] + 1
            time.sleep(0.05)
        except Exception as e:
            print(f"[WARN] Error fetching {symbol} 1m: {e}")
            break

    print(f"   ✅ Se obtuvieron {len(klines)} klines de 1m para {symbol}.")
    return klines

def fetch_1m_hyperliquid(symbol='HYPE', days=30):
    print(f"📥 Descargando 1m klines para {symbol} desde Hyperliquid ({days} días)...")
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - (days * 24 * 3600 * 1000)

    url = 'https://api.hyperliquid.xyz/info'
    payload = json.dumps({'type': 'candleSnapshot', 'req': {'coin': symbol, 'interval': '1m', 'startTime': start_ms, 'endTime': end_ms}}).encode()
    headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}

    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                candles = json.loads(resp.read().decode('utf-8'))
                klines = []
                for c in candles:
                    klines.append([c['t'], c['o'], c['h'], c['l'], c['c'], c['v'], c['T']])
                print(f"   ✅ Se obtuvieron {len(klines)} klines de 1m para {symbol}.")
                return klines
    except Exception as e:
        print(f"[WARN] Error fetching HYPE 1m: {e}")
    return []

def save_1m_klines(conn, coin, klines):
    cursor = conn.cursor()
    inserted = 0
    for k in klines:
        open_time = int(k[0])
        close_time = int(k[6])
        open_price = float(k[1])
        high_price = float(k[2])
        low_price = float(k[3])
        close_price = float(k[4])
        volume = float(k[5])

        dt = datetime.datetime.fromtimestamp(open_time / 1000.0, tz=datetime.timezone.utc)
        ts_utc = dt.strftime('%Y-%m-%d %H:%M:%S')
        cycle_key = dt.strftime('%Y-%m-%d %H:00')
        minute_in_hour = dt.minute

        try:
            cursor.execute("""
                INSERT OR IGNORE INTO klines_1m (
                    coin, open_time_ms, close_time_ms, timestamp_utc,
                    open_price, high_price, low_price, close_price, volume, cycle_key, minute_in_hour
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (coin, open_time, close_time, ts_utc, open_price, high_price, low_price, close_price, volume, cycle_key, minute_in_hour))
            if cursor.rowcount > 0:
                inserted += 1
        except Exception:
            pass

    conn.commit()
    return inserted

def main():
    conn = sqlite3.connect(DB_PATH)
    init_1m_table(conn)

    for coin in PAIRS:
        symbol = f"{coin}USDT"
        if coin == 'HYPE':
            klines = fetch_1m_hyperliquid('HYPE', days=30)
        else:
            klines = fetch_1m_binance(symbol, days=30)

        ins = save_1m_klines(conn, coin, klines)

    conn.close()
    print("✅ Ingesta de Klines de 1 Minuto completada.")

if __name__ == '__main__':
    main()
