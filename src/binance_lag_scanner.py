#!/usr/bin/env python3
import requests
import json
import sqlite3
import os
import time
from datetime import datetime

DB_PATH = "/home/anton/criptobot/data/criptobot.db"
LOG_PATH = "/home/anton/criptobot/binance_lag.log"

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
        CREATE TABLE IF NOT EXISTS price_discrepancies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            symbol TEXT,
            binance_price REAL,
            market_title TEXT,
            polymarket_yes_price REAL,
            implied_probability REAL,
            discrepancy_pct REAL
        )
    ''')
    conn.commit()
    conn.close()

def get_binance_prices():
    prices = {}
    try:
        r = requests.get("https://api.binance.com/api/v3/ticker/price", timeout=5)
        if r.status_code == 200:
            for item in r.json():
                sym = item.get("symbol")
                for asset, b_sym in BINANCE_SYMBOLS.items():
                    if sym == b_sym:
                        prices[asset] = float(item.get("price", 0))
    except Exception as e:
        log(f"⚠️ Error obteniendo precios de Binance: {e}")
    return prices

def scan_lag_opportunities():
    log("📡 Iniciando Scanner de Descalce Binance vs Polymarket (Fase 1 Estudio)...")
    init_db()
    
    while True:
        try:
            b_prices = get_binance_prices()
            if not b_prices:
                time.sleep(5)
                continue
                
            # Query active 1h and 4h crypto markets from Gamma API
            url = "https://gamma-api.polymarket.com/events?tag_slug=crypto&closed=false&limit=40"
            r = requests.get(url, timeout=5)
            events = r.json() if r.status_code == 200 else []
            
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            
            discrepancies_found = 0
            
            for e in events:
                slug = e.get("slug", "").lower()
                title = e.get("title", "")
                
                # Filter for 1h and 4h markets
                if not ("1h" in slug or "1-hour" in slug or "4h" in slug or "4-hour" in slug or "updown" in slug or "above" in title.lower()):
                    continue
                    
                # Identify asset
                asset_match = None
                for asset in BINANCE_SYMBOLS.keys():
                    if asset.lower() in title.lower() or asset.lower() in slug:
                        asset_match = asset
                        break
                        
                if not asset_match or asset_match not in b_prices:
                    continue
                    
                spot_price = b_prices[asset_match]
                
                for m in e.get("markets", []):
                    outcome_prices = m.get("outcomePrices")
                    if not outcome_prices:
                        continue
                        
                    try:
                        prices_list = json.loads(outcome_prices) if isinstance(outcome_prices, str) else outcome_prices
                        yes_price = float(prices_list[0]) if len(prices_list) > 0 else 0.5
                    except Exception:
                        continue
                        
                    # Calculate simple implied probability indicator
                    # If YES price is significantly lower than 0.5 when spot is moving strongly, or mispriced
                    # Log gaps where YES price < 0.35 or > 0.65 with high activity
                    implied_prob = yes_price
                    discrepancy = abs(implied_prob - 0.5)
                    
                    if 0.10 <= yes_price <= 0.40 or 0.60 <= yes_price <= 0.90:
                        timestamp = datetime.now().isoformat()
                        c.execute('''
                            INSERT INTO price_discrepancies (timestamp, symbol, binance_price, market_title, polymarket_yes_price, implied_probability, discrepancy_pct)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        ''', (timestamp, asset_match, spot_price, title[:80], yes_price, implied_prob, discrepancy))
                        discrepancies_found += 1
                        
            conn.commit()
            conn.close()
            
            if discrepancies_found > 0:
                log(f"🔎 Detectados {discrepancies_found} puntos de descalce entre Binance Spot y Polymarket.")
                
        except Exception as ex:
            log(f"⚠️ Error en scan_lag_opportunities: {ex}")
            
        time.sleep(10)

if __name__ == "__main__":
    scan_lag_opportunities()
