#!/usr/bin/env python3
import requests
import json
import sqlite3
import os
import time
from datetime import datetime

DB_PATH = "/home/anton/criptobot/data/criptobot.db"
LOG_PATH = "/home/anton/criptobot/high_freq_ticks.log"

BINANCE_SYMBOLS = {
    "BTC": "BTCUSDT",
    "ETH": "ETHUSDT",
    "SOL": "SOLUSDT",
    "XRP": "XRPUSDT",
    "DOGE": "DOGEUSDT",
    "BNB": "BNBUSDT"
}

def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line)
    try:
        with open(LOG_PATH, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS high_freq_ticks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            symbol TEXT,
            binance_spot REAL,
            market_title TEXT,
            polymarket_yes REAL,
            polymarket_no REAL,
            price_change_5s REAL,
            is_anomaly INTEGER DEFAULT 0
        )
    ''')
    c.execute("CREATE INDEX IF NOT EXISTS idx_ticks_ts ON high_freq_ticks(timestamp)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_ticks_sym ON high_freq_ticks(symbol)")
    conn.commit()
    conn.close()

def get_binance_prices():
    prices = {}
    try:
        r = requests.get("https://api.binance.com/api/v3/ticker/price", timeout=3)
        if r.status_code == 200:
            for item in r.json():
                sym = item.get("symbol")
                for asset, b_sym in BINANCE_SYMBOLS.items():
                    if sym == b_sym:
                        prices[asset] = float(item.get("price", 0))
    except Exception:
        pass
    return prices

def run_high_freq_collector():
    log("🚀 Colector de Ticks de Alta Frecuencia (Captura cada 5s) iniciado en VPS...")
    init_db()
    
    prev_prices = {}
    
    while True:
        start_t = time.time()
        try:
            b_prices = get_binance_prices()
            if not b_prices:
                time.sleep(2)
                continue
                
            url = "https://gamma-api.polymarket.com/events?tag_slug=crypto&closed=false&limit=30"
            r = requests.get(url, timeout=3)
            events = r.json() if r.status_code == 200 else []
            
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            ts_str = datetime.now().isoformat()
            
            tick_count = 0
            anomaly_count = 0
            
            for e in events:
                slug = e.get("slug", "").lower()
                title = e.get("title", "")
                
                asset_match = None
                for asset in BINANCE_SYMBOLS.keys():
                    if asset.lower() in title.lower() or asset.lower() in slug:
                        asset_match = asset
                        break
                        
                if not asset_match or asset_match not in b_prices:
                    continue
                    
                spot_price = b_prices[asset_match]
                
                for m in e.get("markets", []):
                    m_title = m.get("question", title)
                    outcome_prices = m.get("outcomePrices")
                    if not outcome_prices:
                        continue
                        
                    try:
                        prices_list = json.loads(outcome_prices) if isinstance(outcome_prices, str) else outcome_prices
                        yes_price = float(prices_list[0]) if len(prices_list) > 0 else 0.5
                        no_price = float(prices_list[1]) if len(prices_list) > 1 else (1.0 - yes_price)
                    except Exception:
                        continue
                        
                    key = f"{asset_match}_{m.get('id')}"
                    last_price = prev_prices.get(key, yes_price)
                    price_change = yes_price - last_price
                    prev_prices[key] = yes_price
                    
                    is_anomaly = 1 if abs(price_change) >= 0.05 else 0
                    if is_anomaly:
                        anomaly_count += 1
                        
                    c.execute('''
                        INSERT INTO high_freq_ticks (timestamp, symbol, binance_spot, market_title, polymarket_yes, polymarket_no, price_change_5s, is_anomaly)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (ts_str, asset_match, spot_price, m_title[:80], yes_price, no_price, price_change, is_anomaly))
                    tick_count += 1
                    
            conn.commit()
            conn.close()
            
            if anomaly_count > 0:
                log(f"🚨 ANOMALÍA DETECTADA: {anomaly_count} saltos bruscos de precio (>5% en 5s) registrados!")
                
        except Exception as ex:
            log(f"⚠️ Error en tick collector: {ex}")
            
        time.sleep(max(0.5, 5.0 - (time.time() - start_t)))

if __name__ == "__main__":
    run_high_freq_collector()
