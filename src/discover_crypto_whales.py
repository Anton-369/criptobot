#!/usr/bin/env python3
import requests
import json
import sqlite3
import os
from collections import defaultdict
from datetime import datetime

DB_PATH = "/home/anton/criptobot/data/criptobot.db"

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS crypto_markets (
            id TEXT PRIMARY KEY,
            title TEXT,
            slug TEXT,
            timeframe TEXT,
            volume REAL,
            liquidity REAL,
            condition_id TEXT,
            created_at TEXT
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS crypto_whale_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            wallet TEXT,
            market_title TEXT,
            asset_id TEXT,
            side TEXT,
            size_usdc REAL,
            price REAL
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

def fetch_crypto_markets():
    print("🔎 Buscando mercados cripto en Gamma API...")
    url = "https://gamma-api.polymarket.com/events?tag_slug=crypto&closed=false&limit=100"
    r = requests.get(url, timeout=10)
    events = r.json() if r.status_code == 200 else []
    
    # Also fetch short/medium term updown markets
    r2 = requests.get("https://gamma-api.polymarket.com/events?query=updown&closed=false&limit=50", timeout=10)
    if r2.status_code == 200:
        events.extend(r2.json())
        
    markets_found = []
    seen_ids = set()
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    for e in events:
        e_id = e.get("id")
        if e_id in seen_ids:
            continue
        seen_ids.add(e_id)
        
        title = e.get("title", "")
        slug = e.get("slug", "")
        vol = float(e.get("volume", 0))
        liq = float(e.get("liquidity", 0))
        
        # Categorize timeframe
        tf = "General"
        slug_l = slug.lower()
        if "5m" in slug_l or "5-min" in slug_l:
            tf = "5m"
        elif "15m" in slug_l or "15-min" in slug_l:
            tf = "15m"
        elif "1h" in slug_l or "1-hour" in slug_l or "1-hora" in slug_l:
            tf = "1h"
        elif "4h" in slug_l or "4-hour" in slug_l or "4-horas" in slug_l:
            tf = "4h"
        elif "daily" in slug_l or "diario" in slug_l or "august" in slug_l:
            tf = "Diario"

        for m in e.get("markets", []):
            m_id = m.get("id")
            cond_id = m.get("conditionId", "")
            clob_ids = json.loads(m.get("clobTokenIds", "[]")) if isinstance(m.get("clobTokenIds"), str) else m.get("clobTokenIds", [])
            
            c.execute('''
                INSERT OR REPLACE INTO crypto_markets (id, title, slug, timeframe, volume, liquidity, condition_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ''', (m_id, title, slug, tf, vol, liq, cond_id))
            
            markets_found.append({
                "market_id": m_id,
                "title": title,
                "slug": slug,
                "timeframe": tf,
                "clob_ids": clob_ids,
                "condition_id": cond_id
            })
            
    conn.commit()
    conn.close()
    print(f"✅ {len(markets_found)} mercados cripto indexados en DB.")
    return markets_found

def analyze_crypto_whales(markets):
    print("\n🔍 Analizando trades en vivo de Polymarket para detectar bots y ballenas cripto...")
    wallet_stats = defaultdict(lambda: {"volume": 0.0, "trades": 0, "markets": set(), "last_timestamp": ""})
    
    crypto_keywords = ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "dogecoin", "doge", "xrp", "bnb", "up or down", "crypto"]
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # 1. Fetch general recent trades from Data API
    try:
        r = requests.get("https://data-api.polymarket.com/trades?limit=500", timeout=10)
        trades = r.json() if r.status_code == 200 else []
        print(f"📥 Obtenidos {len(trades)} trades generales en vivo.")
        
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
                timestamp = t.get("timestamp", datetime.now().isoformat())
                asset_id = str(t.get("asset", ""))
                m_title = t.get("title", "")
                
                wallet_stats[wallet]["volume"] += usdc_val
                wallet_stats[wallet]["trades"] += 1
                wallet_stats[wallet]["markets"].add(m_title)
                wallet_stats[wallet]["last_timestamp"] = timestamp
                
                c.execute('''
                    INSERT INTO crypto_whale_trades (timestamp, wallet, market_title, asset_id, side, size_usdc, price)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (timestamp, wallet, m_title[:80], asset_id, side, usdc_val, px))
    except Exception as ex:
        print("Error fetching general trades:", ex)

    # 2. Fetch specific market trades from indexed clobTokenIds
    for m in markets[:40]:
        clob_ids = m.get("clob_ids")
        if not clob_ids:
            continue
        if isinstance(clob_ids, str):
            try:
                clob_ids = json.loads(clob_ids)
            except Exception:
                continue
                
        for token_id in clob_ids:
            try:
                r = requests.get(f"https://data-api.polymarket.com/trades?market={token_id}&limit=50", timeout=3)
                if r.status_code != 200:
                    continue
                trades = r.json()
                if not isinstance(trades, list):
                    continue
                    
                for t in trades:
                    wallet = t.get("proxyWallet")
                    if not wallet:
                        continue
                        
                    sz = float(t.get("size", 0))
                    px = float(t.get("price", 0))
                    usdc_val = sz * px
                    side = t.get("side", "BUY")
                    timestamp = t.get("timestamp", datetime.now().isoformat())
                    
                    wallet_stats[wallet]["volume"] += usdc_val
                    wallet_stats[wallet]["trades"] += 1
                    wallet_stats[wallet]["markets"].add(m["title"])
                    wallet_stats[wallet]["last_timestamp"] = timestamp
                    
                    c.execute('''
                        INSERT INTO crypto_whale_trades (timestamp, wallet, market_title, asset_id, side, size_usdc, price)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (timestamp, wallet, m["title"][:80], str(token_id), side, usdc_val, px))
            except Exception:
                pass
                
    conn.commit()
    
    print(f"\n📊 Analizadas {len(wallet_stats)} billeteras únicas operando en Cripto.")
    
    top_wallets = sorted(wallet_stats.items(), key=lambda x: (x[1]["trades"], x[1]["volume"]), reverse=True)
    
    print("\n🏆 Top 10 Billeteras / Bots Cripto Identificados:")
    print("=" * 75)
    
    top_rankings = []
    for rank, (wallet, data) in enumerate(top_wallets[:15], 1):
        pnl_est = 0.0
        active_pos_count = 0
        try:
            r_pos = requests.get(f"https://data-api.polymarket.com/positions?user={wallet}", timeout=4)
            if r_pos.status_code == 200:
                positions = r_pos.json()
                active_pos_count = len(positions)
                for p in positions:
                    cur_val = float(p.get("currentValue", 0))
                    init_val = float(p.get("initialValue", 0))
                    pnl_est += (cur_val - init_val)
        except Exception:
            pass

        c.execute('''
            INSERT OR REPLACE INTO crypto_whales (wallet, total_volume, total_trades, active_positions, pnl_est, last_active)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (wallet, data["volume"], data["trades"], active_pos_count, pnl_est, data["last_timestamp"]))
        
        top_rankings.append({
            "rank": rank,
            "wallet": wallet,
            "trades": data["trades"],
            "volume": data["volume"],
            "positions": active_pos_count,
            "pnl": pnl_est,
            "markets_count": len(data["markets"])
        })
        
        print(f"#{rank:02d} | Billetera: {wallet[:10]}...{wallet[-6:]}")
        print(f"     Trades Registrados : {data['trades']:d} ops en {len(data['markets'])} mercados")
        print(f"     Volumen Estimado  : ${data['volume']:,.2f} USDC")
        print(f"     Posiciones Activas: {active_pos_count} | PnL Est: ${pnl_est:+,.2f} USDC\n")
        
    conn.commit()
    conn.close()
    return top_rankings

if __name__ == "__main__":
    init_db()
    mkts = fetch_crypto_markets()
    analyze_crypto_whales(mkts)

