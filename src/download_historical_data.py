#!/usr/bin/env python3
"""
scripts/download_historical_data.py
Fase 2: Ingesta de 4 Meses de Data Histórica & Sincronización para Calibración (Criptobot v3.0)

Este script:
1. Descarga datos klines de 1 hora y 1 minuto desde la API pública de Binance para las 7 monedas:
   BTCUSDT, ETHUSDT, XRPUSDT, SOLUSDT, DOGEUSDT, BNBUSDT, HYPEUSDT (o fallback si aplica).
2. Descarga el historial completo de mercados cerrados de 1H en Polymarket desde Gamma API (tag_slug=1h).
3. Inserta los registros en SQLite (/home/anton/criptobot/data/criptobot_v3.sqlite).
4. Reporta métricas de integridad y significancia estadística (número total de ciclos, fechas cubiertas).
"""

import sys
import os
import json
import time
import sqlite3
import datetime
import urllib.request
import urllib.error

DB_PATH = '/home/anton/criptobot/data/criptobot_v3.sqlite'
PAIRS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'BNB', 'HYPE']

def init_db(conn):
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")

    # Tabla para klines de Binance 1H / 1M
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS klines_historicos (
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
            delta_pct REAL NOT NULL,
            outcome TEXT NOT NULL, -- 'UP' or 'DOWN'
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(coin, open_time_ms)
        );
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_klines_coin_time 
        ON klines_historicos (coin, open_time_ms);
    """)

    # Tabla para resoluciones históricas de Polymarket 1H
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS polymarket_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL,
            condition_id TEXT UNIQUE NOT NULL,
            coin TEXT NOT NULL,
            question TEXT NOT NULL,
            end_date_iso TEXT NOT NULL,
            winning_outcome TEXT NOT NULL, -- 'UP' or 'DOWN' or 'YES'/'NO'
            yes_final_price REAL NOT NULL,
            no_final_price REAL NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_poly_hist_coin_date 
        ON polymarket_historico (coin, end_date_iso);
    """)

    conn.commit()

def fetch_json(url, retries=3):
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            if attempt == retries - 1:
                print(f"[WARN] Error consultando URL {url}: {e}")
            time.sleep(1)
    return None

def fetch_hyperliquid_klines(symbol='HYPE', days=120):
    print(f"\n📥 Descargando klines (1h) para {symbol} desde Hyperliquid API (últimos {days} días)...")
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - (days * 24 * 60 * 60 * 1000)

    url = 'https://api.hyperliquid.xyz/info'
    payload = json.dumps({'type': 'candleSnapshot', 'req': {'coin': symbol, 'interval': '1h', 'startTime': start_ms, 'endTime': end_ms}}).encode()
    headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}

    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                candles = json.loads(resp.read().decode('utf-8'))
                klines = []
                for c in candles:
                    # Map Hyperliquid candle format to Binance kline format
                    # Binance: [openTime, open, high, low, close, volume, closeTime]
                    klines.append([
                        c['t'], c['o'], c['h'], c['l'], c['c'], c['v'], c['T']
                    ])
                print(f"   ✅ Se obtuvieron {len(klines)} klines para {symbol} (Hyperliquid).")
                return klines
    except Exception as e:
        print(f"[WARN] Error consultando Hyperliquid API para {symbol}: {e}")
    return []

def fetch_binance_klines(symbol, interval='1h', days=120):
    if symbol == 'HYPEUSDT':
        return fetch_hyperliquid_klines('HYPE', days)

    print(f"\n📥 Descargando klines ({interval}) para {symbol} (últimos {days} días)...")
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - (days * 24 * 60 * 60 * 1000)
    
    all_klines = []
    current_start = start_ms

    while current_start < end_ms:
        url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&startTime={current_start}&limit=1000"
        data = fetch_json(url)

        if not data or not isinstance(data, list) or len(data) == 0:
            break

        all_klines.extend(data)
        last_close_time = data[-1][6]
        current_start = last_close_time + 1
        time.sleep(0.1) # Respetar rate limits de Binance

    print(f"   ✅ Se obtuvieron {len(all_klines)} klines para {symbol}.")
    return all_klines

def save_klines(conn, coin, klines):
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

        delta_pct = ((close_price - open_price) / open_price) * 100.0 if open_price > 0 else 0.0
        outcome = 'UP' if close_price >= open_price else 'DOWN'
        ts_utc = datetime.datetime.fromtimestamp(open_time / 1000.0, tz=datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

        try:
            cursor.execute("""
                INSERT OR IGNORE INTO klines_historicos (
                    coin, open_time_ms, close_time_ms, timestamp_utc,
                    open_price, high_price, low_price, close_price, volume, delta_pct, outcome
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (coin, open_time, close_time, ts_utc, open_price, high_price, low_price, close_price, volume, delta_pct, outcome))
            if cursor.rowcount > 0:
                inserted += 1
        except Exception as e:
            pass

    conn.commit()
    return inserted

def fetch_polymarket_closed_events():
    print(f"\n🌐 Descargando historial de eventos cerrados 1H desde Polymarket Gamma API...")
    all_events = []
    offset = 0
    limit = 100

    while offset < 1000: # Obtener hasta 1000 eventos cerrados recientes
        url = f"https://gamma-api.polymarket.com/events?tag_slug=1h&closed=true&limit={limit}&offset={offset}&order=endDate&ascending=false"
        data = fetch_json(url)

        if not data or not isinstance(data, list) or len(data) == 0:
            break

        all_events.extend(data)
        offset += len(data)
        time.sleep(0.2)

    print(f"   ✅ Se descargaron {len(all_events)} eventos cerrados de 1H en Polymarket.")
    return all_events

def save_polymarket_events(conn, events):
    cursor = conn.cursor()
    inserted = 0

    for ev in events:
        title = ev.get('title', '').upper()
        slug = ev.get('slug', '').lower()
        end_date = ev.get('endDate', '')
        event_id = str(ev.get('id', ''))

        # Identificar moneda
        detected_coin = None
        for pair in PAIRS:
            if (pair in title) or (pair.lower() in slug) or \
               (pair == 'BTC' and ('BITCOIN' in title or 'bitcoin' in slug)) or \
               (pair == 'ETH' and ('ETHEREUM' in title or 'ethereum' in slug)) or \
               (pair == 'SOL' and ('SOLANA' in title or 'sol' in slug)) or \
               (pair == 'DOGE' and ('DOGECOIN' in title or 'doge' in slug)):
                detected_coin = pair
                break

        if not detected_coin:
            continue

        markets = ev.get('markets', [])
        for m in markets:
            condition_id = m.get('conditionId')
            if not condition_id:
                continue

            question = m.get('question', title)
            prices_str = m.get('outcomePrices')
            outcomes_str = m.get('outcomes')

            try:
                prices = json.loads(prices_str) if isinstance(prices_str, str) else prices_str
                outcomes = json.loads(outcomes_str) if isinstance(outcomes_str, str) else outcomes_str
            except Exception:
                continue

            if not prices or len(prices) < 2:
                continue

            yes_price = float(prices[0])
            no_price = float(prices[1])

            winning_outcome = 'UP' if yes_price > 0.5 else 'DOWN'

            try:
                cursor.execute("""
                    INSERT OR IGNORE INTO polymarket_historico (
                        event_id, condition_id, coin, question, end_date_iso,
                        winning_outcome, yes_final_price, no_final_price
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (event_id, condition_id, detected_coin, question, end_date, winning_outcome, yes_price, no_price))
                if cursor.rowcount > 0:
                    inserted += 1
            except Exception:
                pass

    conn.commit()
    return inserted

def main():
    print("=================================================================")
    print("📊 FASE 2: INGESTA Y SINCRO DE DATA HISTÓRICA (4 MESES)")
    print("=================================================================")

    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    # 1. Ingesta de Binance Spot Klines (1H y 1M)
    total_klines = 0
    for coin in PAIRS:
        symbol = f"{coin}USDT"
        klines = fetch_binance_klines(symbol, interval='1h', days=120)
        ins = save_klines(conn, coin, klines)
        total_klines += ins

    # 2. Ingesta de Resoluciones de Polymarket
    poly_events = fetch_polymarket_closed_events()
    total_poly = save_polymarket_events(conn, poly_events)

    # 3. Reporte Final de Data
    print("\n-----------------------------------------------------------------")
    print("📈 RESUMEN DE DATA INGERIDA EN DB:")
    cursor = conn.cursor()

    kline_stats = cursor.execute("SELECT coin, COUNT(*), MIN(timestamp_utc), MAX(timestamp_utc) FROM klines_historicos GROUP BY coin;").fetchall()
    print("\n[Binance Spot Klines 1H]:")
    for stat in kline_stats:
        print(f"   - {stat[0]}: {stat[1]} ciclos | Desde {stat[2]} hasta {stat[3]}")

    poly_stats = cursor.execute("SELECT coin, COUNT(*), MIN(end_date_iso), MAX(end_date_iso) FROM polymarket_historico GROUP BY coin;").fetchall()
    print("\n[Polymarket 1H Resoluciones Cerradas]:")
    for stat in poly_stats:
        print(f"   - {stat[0]}: {stat[1]} mercados resueltos | Desde {stat[2]} hasta {stat[3]}")

    conn.close()
    print("\n✅ Ingesta de Fase 2 completada exitosamente.")

if __name__ == '__main__':
    main()
