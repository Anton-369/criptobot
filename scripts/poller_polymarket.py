#!/usr/bin/env python3
"""
poller_polymarket.py — Colector Autónomo de Mercado Real de Polymarket (Fase 3)
--------------------------------------------------------------------------------
Monitorea la API Gamma de Polymarket en tiempo real para las 5 monedas activas:
XRP, SOL (Solana), DOGE (Dogecoin), BNB, HYPE (Hyperliquid).

Almacena snapshots de mercado (yes_price, no_price, volumen, timestamps) en
SQLite: /home/anton/oraculo-cripto/data/criptobot_polymarket.db
"""

import os
import sys
import time
import json
import sqlite3
import argparse
import urllib.request
from datetime import datetime, timezone

DB_PATH = '/home/anton/oraculo-cripto/data/criptobot_polymarket.db'
GAMMA_API_URL = 'https://gamma-api.polymarket.com/events?order=startDate&ascending=false&limit=150&active=true'

COIN_MAPPINGS = {
    'xrp': 'XRPUSDT',
    'solana': 'SOLUSDT',
    'sol': 'SOLUSDT',
    'dogecoin': 'DOGEUSDT',
    'doge': 'DOGEUSDT',
    'bnb': 'BNBUSDT',
    'hyperliquid': 'HYPEUSDT',
    'hype': 'HYPEUSDT'
}

def init_database():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS snapshots_mercado (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            symbol TEXT NOT NULL,
            event_title TEXT,
            market_question TEXT,
            market_slug TEXT,
            clob_token_id_yes TEXT,
            clob_token_id_no TEXT,
            yes_price REAL,
            no_price REAL,
            volume REAL,
            active INTEGER,
            start_date TEXT,
            end_date TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS resultados_ciclos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cycle_key TEXT NOT NULL,
            symbol TEXT NOT NULL,
            market_slug TEXT,
            open_price REAL,
            close_price REAL,
            outcome_up INTEGER,
            created_at TEXT NOT NULL
        )
    ''')

    conn.commit()
    conn.close()

def match_symbol(title, question, slug):
    combined = f"{title} {question} {slug}".lower()
    
    # Priority matching
    if 'hyperliquid' in combined or 'hype' in combined:
        return 'HYPEUSDT'
    if 'dogecoin' in combined or 'doge' in combined:
        return 'DOGEUSDT'
    if 'solana' in combined or 'sol ' in combined or 'sol-' in combined:
        return 'SOLUSDT'
    if 'xrp' in combined:
        return 'XRPUSDT'
    if 'bnb' in combined:
        return 'BNBUSDT'
        
    return None

def fetch_polymarket_events():
    req = urllib.request.Request(GAMMA_API_URL, headers={'User-Agent': 'Mozilla/5.0 (Criptobot/3.0)'})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            if res.status == 200:
                data = json.loads(res.read().decode('utf-8'))
                return data
    except Exception as ex:
        print(f"❌ Error al consultar Polymarket Gamma API: {ex}")
    return []

def poll_once():
    init_database()
    now_utc = datetime.now(timezone.utc).isoformat()
    events = fetch_polymarket_events()

    if not events:
        print("⚠️ No se obtuvieron eventos de Polymarket.")
        return 0

    inserted_count = 0
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    for event in events:
        title = event.get('title', '')
        slug = event.get('slug', '')
        start_date = event.get('startDate', '')
        end_date = event.get('endDate', '')
        markets = event.get('markets', [])

        for m in markets:
            question = m.get('question', '')
            symbol = match_symbol(title, question, slug)

            if not symbol:
                continue

            # Parse prices
            outcome_prices = m.get('outcomePrices')
            yes_price = None
            no_price = None

            if outcome_prices:
                try:
                    prices = json.loads(outcome_prices) if isinstance(outcome_prices, str) else outcome_prices
                    if len(prices) >= 2:
                        yes_price = float(prices[0])
                        no_price = float(prices[1])
                except (ValueError, TypeError):
                    pass

            if yes_price is None and m.get('bestAsk') is not None:
                try:
                    yes_price = float(m.get('bestAsk'))
                    no_price = 1.0 - yes_price if yes_price else None
                except ValueError:
                    pass

            clob_tokens = m.get('clobTokenIds')
            token_yes = None
            token_no = None

            if clob_tokens:
                try:
                    tokens = json.loads(clob_tokens) if isinstance(clob_tokens, str) else clob_tokens
                    if len(tokens) >= 2:
                        token_yes = str(tokens[0])
                        token_no = str(tokens[1])
                except Exception:
                    pass

            volume = float(m.get('volume', 0.0) or 0.0)
            active = 1 if m.get('active', True) else 0

            cursor.execute('''
                INSERT INTO snapshots_mercado (
                    timestamp, symbol, event_title, market_question, market_slug,
                    clob_token_id_yes, clob_token_id_no, yes_price, no_price, volume,
                    active, start_date, end_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                now_utc, symbol, title, question, m.get('slug', slug),
                token_yes, token_no, yes_price, no_price, volume,
                active, start_date, end_date
            ))

            inserted_count += 1

    conn.commit()
    conn.close()

    print(f"✅ [{now_utc[:19]}] Snapshot guardado: {inserted_count} mercados activos capturados en SQLite ({DB_PATH})")
    return inserted_count

def run_loop(interval_sec):
    print(f"🚀 Iniciando Poller de Polymarket en modo continuo (intervalo: {interval_sec}s)...")
    while True:
        try:
            poll_once()
        except Exception as ex:
            print(f"❌ Error en ciclo de recolección: {ex}")
        time.sleep(interval_sec)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Poller de Polymarket (Criptobot v3.0 - Fase 3)")
    parser.add_argument('--once', action='store_true', help="Ejecutar una sola captura de snapshot y salir")
    parser.add_argument('--loop', type=int, default=180, help="Segundos entre capturas en modo continuo (default: 180)")

    args = parser.parse_args()

    if args.once:
        poll_once()
    else:
        run_loop(args.loop)
