#!/usr/bin/env python3
"""
scripts/backtest_calibration.py
Fase 3: Motor de Calibración Estadística Offline & Backtesting (Criptobot v3.0)

Este script:
1. Lee `calibration_config.json`.
2. Extrae el dataset de 4 meses (20,161 klines + 4,692 resoluciones de Polymarket) de `criptobot_v3.sqlite`.
3. Ejecuta un Split 80/20 Train/Test en la línea de tiempo (In-Sample vs Out-of-Sample).
4. Evalúa la significancia estadística con el Test Binomial exacto (p < 0.05) e Intervalos de Confianza de Wilson.
5. Filtra las reglas con Valor Esperado Positivo (EV >= +0.15 USD).
6. Genera el contrato auto-mantenido `/home/anton/criptobot/data/parametros_calibrados.json`.
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
    print("📊 FASE 3: MOTOR DE CALIBRACIÓN ESTADÍSTICA Y BACKTESTING")
    print("=================================================================\n")

    cfg = load_config()
    db_path = cfg['dataset']['db_path']
    train_ratio = cfg['dataset']['train_split_ratio']
    max_p_value = cfg['dataset']['max_p_value']
    coins = cfg['coins']

    conn = sqlite3.connect(db_path)

    # 1. Cargar Klines y Resoluciones
    df_klines = pd.read_sql_query("SELECT * FROM klines_historicos ORDER BY open_time_ms ASC;", conn)
    df_poly = pd.read_sql_query("SELECT * FROM polymarket_historico ORDER BY id ASC;", conn)

    print(f"📥 Cargados de SQLite: {len(df_klines):,} klines de Binance/Hyperliquid y {len(df_poly):,} resoluciones de Polymarket.")

    if len(df_klines) == 0:
        print("❌ Error: No hay klines históricos cargados en SQLite. Corre la Fase 2 primero.")
        sys.exit(1)

    # 2. Split 80/20 Temporal (Train / Test)
    unique_times = df_klines['open_time_ms'].unique()
    split_idx = int(len(unique_times) * train_ratio)
    split_time = unique_times[split_idx]

    df_train = df_klines[df_klines['open_time_ms'] <= split_time]
    df_test = df_klines[df_klines['open_time_ms'] > split_time]

    print(f"✂️ Split 80/20 Temporal:")
    print(f"   - Entrenamieento (Train 80%): {len(df_train):,} klines (hasta {df_train['timestamp_utc'].max()})")
    print(f"   - Validación (Test Out-of-Sample 20%): {len(df_test):,} klines (hasta {df_test['timestamp_utc'].max()})")

    calibrated_results = {
        "calibrated_at": pd.Timestamp.now().isoformat(),
        "train_split": train_ratio,
        "total_train_samples": len(df_train),
        "total_test_samples": len(df_test),
        "rules_by_coin": {}
    }

    print("\n-----------------------------------------------------------------")
    print("🔬 EVALUACIÓN DE HIPÓTESIS Y TEST BINOMIAL DE SIGNIFICANCIA (p < 0.05):")

    for coin in coins:
        coin_train = df_train[df_train['coin'] == coin]
        coin_test = df_test[df_test['coin'] == coin]

        if len(coin_train) == 0:
            continue

        print(f"\n🪙 Moneda: [ {coin} ]")
        calibrated_results["rules_by_coin"][coin] = []

        # Hipótesis H1: Momentum Continuation (Continuidad de tendencia)
        # Si delta_pct > 0.10% en el ciclo, ¿la vela cierra UP?
        h1_train = coin_train[coin_train['delta_pct'] >= 0.10]
        n_h1 = len(h1_train)
        k_h1 = len(h1_train[h1_train['outcome'] == 'UP'])

        if n_h1 > 0:
            p_hat = k_h1 / n_h1
            res_binom = binomtest(k_h1, n_h1, p=0.5, alternative='greater')
            p_val = res_binom.pvalue
            ci_low, ci_high = wilson_score_interval(k_h1, n_h1)

            # Test Out-of-sample
            h1_test = coin_test[coin_test['delta_pct'] >= 0.10]
            n_h1_test = len(h1_test)
            k_h1_test = len(h1_test[h1_test['outcome'] == 'UP']) if n_h1_test > 0 else 0
            p_hat_test = (k_h1_test / n_h1_test) if n_h1_test > 0 else 0.0

            # Cálculo de EV asumiendo precio medio de entrada $0.40 USD
            avg_entry_price = 0.40
            ev = (p_hat * (1.0 - avg_entry_price)) - ((1 - p_hat) * avg_entry_price)

            status = "✅ VALIDADA (ESTADÍSTICAMENTE SIGNIFICATIVA)" if (p_val < max_p_value and ev >= 0.15) else "❌ RECHAZADA"

            print(f"   H1 (Momentum Continuation >= +0.10%):")
            print(f"      - Muestras Train: N={n_h1}, Ganados={k_h1}, WinRate={p_hat*100:.1f}%")
            print(f"      - Test Binomial p-value: {p_val:.4e} | IC 95%: [{ci_low*100:.1f}%, {ci_high*100:.1f}%]")
            print(f"      - WinRate Out-of-Sample (Test 20%): {p_hat_test*100:.1f}% (N={n_h1_test})")
            print(f"      - Valor Esperado (EV): +${ev:.2f} USD por dólar | Estado: {status}")

            if p_val < max_p_value and ev >= 0.15:
                calibrated_results["rules_by_coin"][coin].append({
                    "rule_id": "H1_MOMENTUM_CONTINUATION",
                    "win_rate_train": round(p_hat, 4),
                    "win_rate_test": round(p_hat_test, 4),
                    "p_value": float(p_val),
                    "confidence_interval_95": [round(ci_low, 4), round(ci_high, 4)],
                    "expected_value_usd": round(ev, 4),
                    "recommended_entry_window_min": [1, 25],
                    "max_entry_price": 0.45
                })

        # Hipótesis H2: Reversión / Elastic Bounce tras caída previa
        h2_train = coin_train[coin_train['delta_pct'] <= -0.15]
        n_h2 = len(h2_train)
        k_h2 = len(h2_train[h2_train['outcome'] == 'UP']) # Bounce a favor de UP

        if n_h2 > 0:
            p_hat2 = k_h2 / n_h2
            res_binom2 = binomtest(k_h2, n_h2, p=0.5, alternative='greater')
            p_val2 = res_binom2.pvalue
            ci_low2, ci_high2 = wilson_score_interval(k_h2, n_h2)

            ev2 = (p_hat2 * (1.0 - 0.35)) - ((1 - p_hat2) * 0.35)
            status2 = "✅ VALIDADA" if (p_val2 < max_p_value and ev2 >= 0.15) else "❌ RECHAZADA"

            print(f"   H2 (Elastic Bounce tras Caída <= -0.15%):")
            print(f"      - Muestras Train: N={n_h2}, Ganados={k_h2}, WinRate={p_hat2*100:.1f}% | p-val: {p_val2:.4e} | EV: +${ev2:.2f} USD | {status2}")

            if p_val2 < max_p_value and ev2 >= 0.15:
                calibrated_results["rules_by_coin"][coin].append({
                    "rule_id": "H2_ELASTIC_BOUNCE",
                    "win_rate_train": round(p_hat2, 4),
                    "p_value": float(p_val2),
                    "confidence_interval_95": [round(ci_low2, 4), round(ci_high2, 4)],
                    "expected_value_usd": round(ev2, 4),
                    "recommended_entry_window_min": [15, 35],
                    "max_entry_price": 0.38
                })

    # 3. Guardar el Contrato JSON `parametros_calibrados.json`
    out_path = cfg['output_path']
    with open(out_path, 'w') as f:
        json.dump(calibrated_results, f, indent=2)

    conn.close()
    print("\n=================================================================")
    print(f"✅ Contrato `parametros_calibrados.json` generado exitosamente en:\n   {out_path}")
    print("=================================================================")

if __name__ == '__main__':
    run_calibration()
