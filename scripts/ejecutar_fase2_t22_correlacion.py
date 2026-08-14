#!/usr/bin/env python3
"""
ejecutar_fase2_t22_correlacion.py
Tarea 2.2 del Roadmap Fase 2:
Calcula la matriz de correlación Pearson entre:
1. racha_down
2. delta_spot_temprano (corte 15m)
3. lead_lag_btc_15m
4. lead_lag_eth_15m

Identifica y marca pares con |r| >= 0.6 como REDUNDANTE.
Output: /home/anton/oraculo-cripto/data/matriz_correlacion_features.csv
"""

import os
import sys
import numpy as np
import pandas as pd

KLINES_1M_PATH = '/home/anton/oraculo-cripto/data/klines_1m.csv'
OUTPUT_CSV_PATH = '/home/anton/oraculo-cripto/data/matriz_correlacion_features.csv'

COINS = ['XRPUSDT', 'SOLUSDT', 'DOGEUSDT', 'BNBUSDT', 'ETHUSDT', 'BTCUSDT']

def build_aligned_feature_dataset(df):
    df['dt'] = pd.to_datetime(df['open_time'])
    df['cycle_key'] = df['dt'].dt.strftime('%Y-%m-%d %H:00:00')
    df['minute_in_hour'] = df['dt'].dt.minute

    # Build per-coin datasets
    coin_data = {}

    for coin in COINS:
        df_c = df[df['symbol'] == coin].sort_values('dt').reset_index(drop=True)
        groups = df_c.groupby('cycle_key')

        recs = {}
        prev_outcomes = []
        sorted_hours = sorted(groups.groups.keys())

        for ckey in sorted_hours:
            grp = groups.get_group(ckey)
            min_dict = grp.set_index('minute_in_hour')

            if 0 not in min_dict.index or 14 not in min_dict.index or 59 not in min_dict.index:
                continue

            open_0 = min_dict.loc[0, 'open']
            close_15 = min_dict.loc[14, 'close']
            close_59 = min_dict.loc[59, 'close']

            delta_15m = ((close_15 - open_0) / open_0) * 100.0
            final_out = 1 if close_59 >= open_0 else 0

            racha_down = 0
            for past in reversed(prev_outcomes):
                if past == 0:
                    racha_down += 1
                else:
                    break

            recs[ckey] = {
                'racha_down': racha_down,
                'delta_15m': delta_15m,
                'target': final_out
            }
            prev_outcomes.append(final_out)

        coin_data[coin] = pd.DataFrame.from_dict(recs, orient='index')

    return coin_data

def run_correlation_audit():
    print("=================================================================")
    print("🔬 TAREA 2.2: AUDITORÍA DE CORRELACIÓN Y REDUNDANCIA DE FEATURES")
    print("=================================================================\n")

    df = pd.read_csv(KLINES_1M_PATH)
    coin_data = build_aligned_feature_dataset(df)

    btc_df = coin_data['BTCUSDT']
    eth_df = coin_data['ETHUSDT']

    results = []

    for coin in COINS:
        c_df = coin_data[coin].copy()

        # Merge BTC and ETH deltas on cycle_key (index)
        merged = c_df.join(btc_df[['delta_15m']].rename(columns={'delta_15m': 'lead_lag_btc_15m'}), how='inner')
        merged = merged.join(eth_df[['delta_15m']].rename(columns={'delta_15m': 'lead_lag_eth_15m'}), how='inner')
        merged = merged.rename(columns={'delta_15m': 'delta_spot_temprano'})

        cols = ['racha_down', 'delta_spot_temprano', 'lead_lag_btc_15m', 'lead_lag_eth_15m']
        corr_matrix = merged[cols].corr(method='pearson')

        print(f"--- Matriz de Correlación para {coin} (N={len(merged)}) ---")
        print(corr_matrix.round(4))
        print("")

        # Extract pairwise correlations
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                f1 = cols[i]
                f2 = cols[j]
                r_val = corr_matrix.loc[f1, f2]
                is_redundant = abs(r_val) >= 0.6
                status = "REDUNDANTE -- evaluar cual de las dos aporta mas antes de incluir ambas" if is_redundant else "ACEPTABLE (Independiente)"

                results.append({
                    'coin': coin,
                    'feature_1': f1,
                    'feature_2': f2,
                    'pearson_r': round(r_val, 4),
                    'abs_r': round(abs(r_val), 4),
                    'diagnostico': status
                })

    df_out = pd.DataFrame(results)
    df_out.to_csv(OUTPUT_CSV_PATH, index=False)
    print(f"=================================================================")
    print(f"✅ Matriz de Correlación guardada en: {OUTPUT_CSV_PATH}")
    print("=================================================================")

if __name__ == '__main__':
    run_correlation_audit()
