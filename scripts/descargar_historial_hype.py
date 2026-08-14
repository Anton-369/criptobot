#!/usr/bin/env python3
"""
TAREA 1.5 -- Descargar Historial de HYPE desde la API publica de Hyperliquid (candleSnapshot)
"""

import time
import json
import requests
import pandas as pd
from datetime import datetime, timedelta

API_URL = "https://api.hyperliquid.xyz/info"

def fetch_hyperliquid_candles(coin="HYPE", interval="1h", start_time_ms=None, end_time_ms=None):
    payload = {
        "type": "candleSnapshot",
        "req": {
            "coin": coin,
            "interval": interval,
            "startTime": int(start_time_ms),
            "endTime": int(end_time_ms)
        }
    }
    headers = {"Content-Type": "application/json"}
    resp = requests.post(API_URL, json=payload, headers=headers, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    else:
        print(f"Error {resp.status_code}: {resp.text}")
        return []

def main():
    print("=" * 80)
    print("TAREA 1.5 -- INVESTIGACION DE API HYPERLIQUID PARA HYPE/USD HISTORICO")
    print("=" * 80)

    now = datetime.utcnow()
    # 90 dias atras (3 meses)
    three_months_ago = now - timedelta(days=90)

    start_ms = int(three_months_ago.timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    print(f"Solicitando klines 1h para HYPE desde {three_months_ago.strftime('%Y-%m-%d')} hasta {now.strftime('%Y-%m-%d')}...")

    candles = fetch_hyperliquid_candles("HYPE", "1h", start_ms, end_ms)

    if not candles or not isinstance(candles, list):
        print("❌ BLOQUEANTE: La API de Hyperliquid no retorno datos validos para HYPE.")
        return

    print(f"✅ ÉXITO: Se obtuvieron {len(candles)} velas historicas de 1H para HYPE.")

    rows = []
    for c in candles:
        # Hyperliquid candle structure: {t: open_time, T: close_time, s: coin, i: interval, o: open, c: close, h: high, l: low, v: volume, n: num_trades}
        open_time = datetime.utcfromtimestamp(c['t'] / 1000.0)
        open_p = float(c['o'])
        close_p = float(c['c'])
        high_p = float(c['h'])
        low_p = float(c['l'])
        vol = float(c['v'])
        direction = "UP" if close_p >= open_p else "DOWN"

        rows.append({
            "symbol": "HYPEUSDT",
            "open_time": open_time.isoformat() + "Z",
            "open": open_p,
            "high": high_p,
            "low": low_p,
            "close": close_p,
            "volume": vol,
            "direction": direction
        })

    df = pd.DataFrame(rows)
    print("\nPrimeras 5 filas:")
    print(df.head())
    print("\nUltimas 5 filas:")
    print(df.tail())

    # Guardar en ./data/hype_klines_1h.csv
    df.to_csv("./data/hype_klines_1h.csv", index=False)
    print(f"\nSaved {len(df)} rows to ./data/hype_klines_1h.csv")

if __name__ == "__main__":
    main()
