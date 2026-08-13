#!/usr/bin/env python3
"""
Descarga historial OHLC de Binance para XRP, SOL, DOGE, BNB (objetivos de disparo)
+ BTC, ETH (referencia macro) en timeframes 1h, 15m y 5m.

Usa los archivos bulk oficiales de Binance (data.binance.vision), no la API REST
con rate limits -- por eso baja meses de datos en segundos.

Uso:
    pip install pandas requests
    python3 descargar_historial_binance.py --meses 6

Salida:
    ./data/klines_1h.csv
    ./data/klines_15m.csv
    ./data/klines_5m.csv

Cada CSV tiene columnas: symbol, open_time, open, high, low, close, volume, direction (UP/DOWN)
"""

import argparse
import io
import zipfile
from datetime import datetime, timedelta

import pandas as pd
import requests

SYMBOLS = ["BTCUSDT", "ETHUSDT", "XRPUSDT", "SOLUSDT", "DOGEUSDT", "BNBUSDT"]
INTERVALS = ["1h", "15m", "5m"]
COLUMNS = [
    "open_time", "open", "high", "low", "close", "volume",
    "close_time", "quote_asset_volume", "trades",
    "taker_buy_base", "taker_buy_quote", "ignore",
]

BASE_URL = "https://data.binance.vision/data/spot/monthly/klines"


def meses_a_descargar(n_meses: int):
    """Genera lista de (year, month) desde hoy hacia atrás."""
    hoy = datetime.utcnow()
    meses = []
    y, m = hoy.year, hoy.month
    for _ in range(n_meses):
        meses.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return list(reversed(meses))


def descargar_mes(symbol: str, interval: str, year: int, month: int) -> pd.DataFrame | None:
    url = f"{BASE_URL}/{symbol}/{interval}/{symbol}-{interval}-{year}-{month:02d}.zip"
    try:
        resp = requests.get(url, timeout=30)
        if resp.status_code != 200:
            print(f"  [omitido] {symbol} {interval} {year}-{month:02d} (status {resp.status_code}, probablemente mes futuro/sin datos)")
            return None
        with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
            csv_name = z.namelist()[0]
            with z.open(csv_name) as f:
                df = pd.read_csv(f, header=None, names=COLUMNS)
        return df
    except Exception as e:
        print(f"  [error] {symbol} {interval} {year}-{month:02d}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--meses", type=int, default=6, help="Cuántos meses hacia atrás descargar (default 6)")
    parser.add_argument("--outdir", type=str, default="./data", help="Carpeta de salida")
    args = parser.parse_args()

    import os
    os.makedirs(args.outdir, exist_ok=True)

    meses = meses_a_descargar(args.meses)
    print(f"Descargando {len(meses)} meses para {len(SYMBOLS)} símbolos x {len(INTERVALS)} intervalos...")
    print(f"Símbolos: {SYMBOLS}")
    print(f"Meses: {meses[0][0]}-{meses[0][1]:02d} hasta {meses[-1][0]}-{meses[-1][1]:02d}\n")

    for interval in INTERVALS:
        print(f"=== Intervalo {interval} ===")
        frames = []
        for symbol in SYMBOLS:
            symbol_frames = []
            for year, month in meses:
                df = descargar_mes(symbol, interval, year, month)
                if df is not None:
                    symbol_frames.append(df)
            if not symbol_frames:
                print(f"  ADVERTENCIA: sin datos para {symbol} {interval}")
                continue
            df_symbol = pd.concat(symbol_frames, ignore_index=True)
            df_symbol["symbol"] = symbol
            # Binance cambio el formato de timestamp de ms a us en algunos archivos historicos.
            # Detectamos automaticamente segun la magnitud del numero:
            #   epoch en milisegundos (~2026) tiene 13 digitos (~1.77e12)
            #   epoch en microsegundos (~2026) tiene 16 digitos (~1.77e15)
            muestra = int(df_symbol["open_time"].iloc[0])
            unidad = "us" if muestra > 10**14 else "ms"
            df_symbol["open_time"] = pd.to_datetime(df_symbol["open_time"], unit=unidad)
            df_symbol["direction"] = (df_symbol["close"].astype(float) >= df_symbol["open"].astype(float)).map(
                {True: "UP", False: "DOWN"}
            )
            df_symbol = df_symbol[["symbol", "open_time", "open", "high", "low", "close", "volume", "direction"]]
            frames.append(df_symbol)
            print(f"  {symbol}: {len(df_symbol)} velas")

        if frames:
            df_final = pd.concat(frames, ignore_index=True).sort_values(["symbol", "open_time"])
            out_path = f"{args.outdir}/klines_{interval}.csv"
            df_final.to_csv(out_path, index=False)
            print(f"  -> Guardado en {out_path} ({len(df_final)} filas totales)\n")

    print("Listo. Sube los 3 CSV generados en ./data/ para el análisis de lead-lag.")


if __name__ == "__main__":
    main()
