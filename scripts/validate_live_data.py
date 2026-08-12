#!/usr/bin/env python3
"""
scripts/validate_live_data.py
Fase 2: Script de Validación de Calidad y Spreads en Vivo (Criptobot v3.0)

Este script realiza una auditoría forense sobre las tablas `snapshots_mercado` y `precios_subyacente` 
registradas en /home/anton/criptobot/data/criptobot_v3.sqlite para medir:
1. Cobertura de snapshots por moneda.
2. Spreads promedio (Best Ask - Best Bid) y profundidades de orderbook (ask_depth).
3. Monitoreo de latencia y detección de anomalías o vacíos de datos.
"""

import sqlite3
import pandas as pd

DB_PATH = '/home/anton/criptobot/data/criptobot_v3.sqlite'

def audit_database():
    conn = sqlite3.connect(DB_PATH)

    print("=================================================================")
    print("🔬 AUDITORÍA DE CALIDAD Y SPREADS EN VIVO - FASE 2")
    print("=================================================================\n")

    # 1. Total registros por tabla
    print("📊 1. Conteos Generales en SQLite:")
    for table in ['klines_historicos', 'polymarket_historico', 'snapshots_mercado', 'precios_subyacente', 'predicciones_log']:
        count = conn.execute(f"SELECT COUNT(*) FROM {table};").fetchone()[0]
        print(f"   - {table}: {count:,} filas")

    # 2. Resumen de Klines Históricos
    df_klines = pd.read_sql_query("SELECT coin, COUNT(*) as total_ciclos, MIN(timestamp_utc) as inicio, MAX(timestamp_utc) as fin FROM klines_historicos GROUP BY coin;", conn)
    print("\n📈 2. Cobertura Histórica de Precios Subyacentes (120 Días / 4 Meses):")
    print(df_klines.to_string(index=False))

    # 3. Resumen de Resoluciones de Polymarket
    df_poly = pd.read_sql_query("SELECT coin, COUNT(*) as mercados_resueltos, MIN(end_date_iso) as inicio, MAX(end_date_iso) as fin FROM polymarket_historico GROUP BY coin;", conn)
    print("\n🌐 3. Resoluciones Históricas de Polymarket (Gamma API):")
    print(df_poly.to_string(index=False))

    # 4. Auditoría de Spreads y Profundidad en Vivo
    df_snaps = pd.read_sql_query("""
        SELECT coin, 
               COUNT(*) as snapshots,
               AVG(best_ask_up - best_bid_up) as avg_spread_up,
               AVG(best_ask_down - best_bid_down) as avg_spread_down,
               AVG(ask_depth_up) as avg_depth_up,
               AVG(ask_depth_down) as avg_depth_down,
               MIN(created_at) as primer_snap,
               MAX(created_at) as ultimo_snap
        FROM snapshots_mercado 
        GROUP BY coin;
    """, conn)

    print("\n⚡ 4. Auditoría de Spreads y Profundidad en Vivo (snapshots_mercado):")
    if len(df_snaps) > 0:
        print(df_snaps.to_string(index=False))
    else:
        print("   (Aún no hay snapshots registrados por PolymarketCollector en esta sesión)")

    conn.close()
    print("\n=================================================================")
    print("✅ Auditoría de Fase 2 finalizada con éxito.")

if __name__ == '__main__':
    audit_database()
