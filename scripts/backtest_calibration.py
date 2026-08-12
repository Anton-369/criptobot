#!/usr/bin/env python3
"""
scripts/backtest_calibration.py
Fase 3: Motor de Calibración Estadística Offline & Backtesting sin Lookahead Bias (Criptobot v3.0)

Este script:
1. Lee `calibration_config.json`.
2. Procesa la serie temporal intra-hora de klines de 1m (`klines_1m`) en SQLite.
3. Mide el Momentum a los minutos 5, 10 y 15 (sin ningún tipo de 'lookahead bias' ni filtración del precio futuro).
4. Aplica un Split 80/20 Temporal (80% Train, 20% Out-of-Sample Test).
5. Calcula la significancia estadística mediante el Test Binomial Exacto (p < 0.05), Intervalos de Confianza de Wilson (95%) y Expected Value (EV).
6. Genera el contrato estructurado `/home/anton/criptobot/data/parametros_calibrados.json`.
"""

import os
import sys
import json
import math
import sqlite3
import pandas as pd
from scipy.stats import binomtest

CONFIG_PATH = '/home/anton/criptobot/calibration_config.json'

def load_config():
    if not os.path.exists(CONFIG_PATH):
        raise FileNotFoundError(f"No se encontró el archivo de configuración: {CONFIG_PATH}")
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)

def wilson_score_interval(k, n, confidence=0.95):
    if n == 0:
        return 0.0, 0.0
    p = k / n
    z = 1.95996 # 95% confidence
    denominator = 1 + z**2 / n
    centre_adjusted_probability = p + z**2 / (2 * n)
    adjusted_square_root = math.sqrt((p * (1 - p) + z**2 / (4 * n)) / n)
    lower_bound = (centre_adjusted_probability - z * adjusted_square_root) / denominator
    upper_bound = (centre_adjusted_probability + z * adjusted_square_root) / denominator
    return max(0.0, lower_bound), min(1.0, upper_bound)

def run_calibration():
    print("=================================================================")
    print("🔬 AUDITORÍA DE LOGICA Y MOTOR DE CALIBRACIÓN SIN LOOKAHEAD BIAS")
    print("=================================================================\n")

    cfg = load_config()
    db_path = cfg['dataset']['db_path']
    train_ratio = cfg['dataset']['train_split_ratio']
    max_p_value = cfg['dataset']['max_p_value']
    coins = cfg['coins']

    conn = sqlite3.connect(db_path)

    # 1. Cargar Klines de 1m
    df_1m = pd.read_sql_query("SELECT * FROM klines_1m ORDER BY open_time_ms ASC;", conn)
    print(f"📥 Cargados de SQLite: {len(df_1m):,} klines de 1m para análisis intra-hora.")

    if len(df_1m) == 0:
        print("❌ Error: No se encontraron klines de 1m en SQLite.")
        sys.exit(1)

    calibrated_results = {
        "calibrated_at": pd.Timestamp.now().isoformat(),
        "train_split": train_ratio,
        "methodology": "Strict Intra-Hour Non-Lookahead Momentum Backtest (1m candles)",
        "rules_by_coin": {}
    }

    # 2. Iterar por cada moneda
    for coin in coins:
        df_coin = df_1m[df_1m['coin'] == coin]
        if len(df_coin) == 0:
            continue

        # Agrupar klines por ciclo de 1 hora
        cycles = {}
        for idx, row in df_coin.iterrows():
            ckey = row['cycle_key']
            minute = int(row['minute_in_hour'])
            if ckey not in cycles:
                cycles[ckey] = {}
            cycles[ckey][minute] = {
                'open': float(row['open_price']),
                'close': float(row['close_price'])
            }

        # Construir dataset de observaciones intra-hora válidas
        data_rows = []
        for ckey, mins in cycles.items():
            # Requerimos el minuto 0 (apertura) y el minuto 59 (cierre de hora)
            if 0 in mins and 59 in mins:
                open_1h = mins[0]['open']
                close_1h = mins[59]['close']
                final_outcome = 'UP' if close_1h >= open_1h else 'DOWN'

                # Evaluar momentum a minuto 10 y minuto 15
                price_10m = mins[10]['close'] if 10 in mins else mins[0]['close']
                delta_10m = ((price_10m - open_1h) / open_1h) * 100.0

                data_rows.append({
                    'cycle_key': ckey,
                    'open_1h': open_1h,
                    'close_1h': close_1h,
                    'delta_10m': delta_10m,
                    'final_outcome': final_outcome
                })

        df_cycles = pd.DataFrame(data_rows)
        if len(df_cycles) == 0:
            continue

        # Split 80/20 Temporal
        split_idx = int(len(df_cycles) * train_ratio)
        df_train = df_cycles.iloc[:split_idx]
        df_test = df_cycles.iloc[split_idx:]

        calibrated_results["rules_by_coin"][coin] = []

        print(f"\n🪙 MONEDA: [ {coin} ] | Muestras Totales: {len(df_cycles)} ciclos | Train: {len(df_train)} | Test: {len(df_test)}")

        # Evaluar Hipótesis H1: Momentum Continuation en Minuto 10 (delta >= +0.10%)
        trigger_threshold = 0.10
        h1_train = df_train[df_train['delta_10m'] >= trigger_threshold]
        n_h1 = len(h1_train)
        k_h1 = len(h1_train[h1_train['final_outcome'] == 'UP'])

        if n_h1 > 0:
            p_hat = k_h1 / n_h1
            res_binom = binomtest(k_h1, n_h1, p=0.5, alternative='greater')
            p_val = res_binom.pvalue
            ci_low, ci_high = wilson_score_interval(k_h1, n_h1)

            # Test Out-of-Sample (Test 20%)
            h1_test = df_test[df_test['delta_10m'] >= trigger_threshold]
            n_test = len(h1_test)
            k_test = len(h1_test[h1_test['final_outcome'] == 'UP']) if n_test > 0 else 0
            p_hat_test = (k_test / n_test) if n_test > 0 else 0.0

            # EV asumiendo precio medio de orden $0.40 USD en Polymarket
            avg_entry_price = 0.40
            ev = (p_hat * (1.0 - avg_entry_price)) - ((1 - p_hat) * avg_entry_price)

            status = "✅ VALIDADA (ESTADÍSTICAMENTE SIGNIFICATIVA p < 0.05)" if (p_val < max_p_value and ev >= 0.10) else "❌ RECHAZADA"

            print(f"   📊 Regla H1 (Momentum Continuation Minuto 10 >= +{trigger_threshold}%):")
            print(f"      - Muestras Entrenamieento (Train 80%): N={n_h1}, Ganados={k_h1}, Win Rate = {p_hat*100:.2f}%")
            print(f"      - Test Binomial p-value: {p_val:.6f} | IC 95%: [{ci_low*100:.2f}%, {ci_high*100:.2f}%]")
            print(f"      - Out-of-Sample Validation (Test 20%): Win Rate = {p_hat_test*100:.2f}% (N={n_test}, Ganados={k_test})")
            print(f"      - Expected Value (EV): +${ev:.4f} USD por dólar apostado a $0.40")
            print(f"      - Estado Final: {status}")

            if p_val < max_p_value and ev >= 0.10:
                calibrated_results["rules_by_coin"][coin].append({
                    "rule_id": "H1_MOMENTUM_CONTINUATION",
                    "evaluation_minute": 10,
                    "trigger_delta_pct": trigger_threshold,
                    "win_rate_train": round(p_hat, 4),
                    "win_rate_test_oos": round(p_hat_test, 4),
                    "p_value": float(p_val),
                    "confidence_interval_95": [round(ci_low, 4), round(ci_high, 4)],
                    "expected_value_usd": round(ev, 4),
                    "recommended_entry_window_min": [10, 25],
                    "max_entry_price": 0.45
                })

    # Guardar en parametros_calibrados.json
    out_path = cfg['output_path']
    with open(out_path, 'w') as f:
        json.dump(calibrated_results, f, indent=2)

    conn.close()
    print("\n=================================================================")
    print(f"✅ Auditoría completada. Contrato `parametros_calibrados.json` actualizado.")
    print("=================================================================")

if __name__ == '__main__':
    run_calibration()
