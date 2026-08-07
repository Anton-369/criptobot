#!/usr/bin/env python3
import requests
import json
import sqlite3
import os
import time
from datetime import datetime

DB_PATH = "/home/anton/criptobot/data/criptobot.db"
LOG_PATH = "/home/anton/criptobot/crypto_radar.log"

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
        CREATE TABLE IF NOT EXISTS crypto_whale_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            wallet TEXT,
            market_title TEXT,
            asset_id TEXT,
            side TEXT,
            size_usdc REAL,
            price REAL,
            UNIQUE(timestamp, wallet, asset_id, size_usdc, price) ON CONFLICT IGNORE
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS crypto_whales (
            wallet TEXT PRIMARY KEY,
            total_volume REAL,
            total_trades INTEGER,
            active_positions INTEGER,
            pnl_est REAL,
            last_active TEXT
        )
    ''')
    conn.commit()
    conn.close()

def run_radar_loop():
    log("🚀 Criptobot Radar Daemon iniciado en VPS (Tracking 24/7 de Transacciones Cripto)...")
    init_db()
    
    crypto_keywords = ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "dogecoin", "doge", "dogo", "xrp", "bnb", "hype", "up or down", "up/down", "subir o bajar", "arriba o abajo", "above", "crypto"]
    
    processed_count = 0
    
    while True:
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            
            r = requests.get("https://data-api.polymarket.com/trades?limit=100", timeout=5)
            if r.status_code == 200:
                trades = r.json()
                new_trades_count = 0
                
                for t in trades:
                    title = str(t.get("title", "")).lower()
                    if any(k in title for k in crypto_keywords):
                        wallet = t.get("proxyWallet")
                        if not wallet:
                            continue
                            
                        sz = float(t.get("size", 0))
                        px = float(t.get("price", 0))
                        usdc_val = sz * px
                        side = t.get("side", "BUY")
                        timestamp = str(t.get("timestamp", datetime.now().isoformat()))
                        asset_id = str(t.get("asset", ""))
                        m_title = t.get("title", "")
                        
                        c.execute('''
                            INSERT OR IGNORE INTO crypto_whale_trades (timestamp, wallet, market_title, asset_id, side, size_usdc, price)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        ''', (timestamp, wallet, m_title[:80], asset_id, side, usdc_val, px))
                        
                        if c.rowcount > 0:
                            new_trades_count += 1
                            
                conn.commit()
                processed_count += new_trades_count
                
                if new_trades_count > 0:
                    log(f"📥 Capturados {new_trades_count} nuevos trades cripto en vivo. Total acumulado: {processed_count}")
                    
            conn.close()
        except Exception as e:
            log(f"⚠️ Error en radar loop: {e}")
            
        time.sleep(3)

if __name__ == "__main__":
    run_radar_loop()
