#!/usr/bin/env python3
"""
criptobot/ai/edge_gate.py
Fase 4: Puerta de Decisión Unificada (Estadística + IA) y Auto-Tuning (Criptobot v3.0)

Este script:
1. Invocará al Opportunity Scout y al Strategy Analyst (NVIDIA Nemotron).
2. Procesará la serie de 1m en `criptobot_v3.sqlite` sin lookahead bias.
3. Aplicará el filtro estadístico estricto (p < 0.05, Wilson 95%, EV positivo).
4. Generará el contrato definitivo `/home/anton/criptobot/data/parametros_calibrados.json`.
"""

import sys
import os
import json
import math
import sqlite3
import pandas as pd
from scipy.stats import binomtest

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.opportunity_scout import scout_opportunities
from ai.strategy_analyst import analyze_strategy

DB_PATH = '/home/anton/criptobot/data/criptobot_v3.sqlite'
OUTPUT_PATH = '/home/anton/criptobot/data/parametros_calibrados.json'
PAIRS = ['XRP', 'SOL', 'DOGE', 'BNB', 'HYPE']

def wilson_score_interval(k, n, confidence=0.95):
    if n == 0: return 0.0, 0.0
    p = k / n
    z = 1.95996
    denom = 1 + z**2 / n
    centre = p + z**2 / (2 * n)
    sq = math.sqrt((p * (1 - p) + z**2 / (4 * n)) / n)
    low = (centre - z * sq) / denom
    high = (centre + z * sq) / denom
    return max(0.0, low), min(1.0, high)

def run_edge_gate():
    print("=================================================================")
    print("🛡️ PUERTA DE DECISIÓN UNIFICADA (ESTADÍSTICA + IA NVIDIA NEMOTRON)")
    print("=================================================================\n")

    conn = sqlite3.connect(DB_PATH)
    df_1m = pd.read_sql_query("SELECT * FROM klines_1m WHERE coin IN ('XRP', 'SOL', 'DOGE', 'BNB', 'HYPE') ORDER BY open_time_ms ASC;", conn)
    conn.close()

    if len(df_1m) == 0:
        print("❌ Error: No hay datos de 1m en SQLite.")
        return

    # 1. Obtener insights del Scout
    scout_insights = scout_opportunities()

    calibrated_contract = {
        "calibrated_at": pd.Timestamp.now().isoformat(),
        "architecture": "Criptobot v3.0 Non-Lookahead AI-Gated Engine",
        "ai_model": "nvidia/nemotron-3.5-lightning:free",
        "rules_by_coin": {}
    }

    # 2. Iterar por cada moneda objetivo
    for coin in PAIRS:
        df_coin = df_1m[df_1m['coin'] == coin]
        if len(df_coin) == 0:
            continue

        cycles = {}
        for _, row in df_coin.iterrows():
            ckey = row['cycle_key']
            minute = int(row['minute_in_hour'])
            if ckey not in cycles: cycles[ckey] = {}
            cycles[ckey][minute] = {'open': float(row['open_price']), 'close': float(row['close_price'])}

        data_rows = []
        for ckey, mins in cycles.items():
            if 0 in mins and 59 in mins:
                open_1h = mins[0]['open']
                close_1h = mins[59]['close']
                final_outcome = 'UP' if close_1h >= open_1h else 'DOWN'

                price_10m = mins[10]['close'] if 10 in mins else mins[0]['close']
                delta_10m = ((price_10m - open_1h) / open_1h) * 100.0

                data_rows.append({
                    'cycle_key': ckey,
                    'delta_10m': delta_10m,
                    'final_outcome': final_outcome
                })

        df_cycles = pd.DataFrame(data_rows)
        if len(df_cycles) == 0:
            continue

        # Split 80/20 Temporal
        split_idx = int(len(df_cycles) * 0.8)
        df_train = df_cycles.iloc[:split_idx]
        df_test = df_cycles.iloc[split_idx:]

        trigger_threshold = 0.10
        h1_train = df_train[df_train['delta_10m'] >= trigger_threshold]
        n_train = len(h1_train)
        k_train = len(h1_train[h1_train['final_outcome'] == 'UP'])

        if n_train > 0:
            p_hat_train = k_train / n_train
            p_val = float(binomtest(k_train, n_train, p=0.5, alternative='greater').pvalue)
            ci_low, ci_high = wilson_score_interval(k_train, n_train)

            # Test Out-of-Sample (Test 20%)
            h1_test = df_test[df_test['delta_10m'] >= trigger_threshold]
            n_test = len(h1_test)
            k_test = len(h1_test[h1_test['final_outcome'] == 'UP']) if n_test > 0 else 0
            p_hat_test = (k_test / n_test) if n_test > 0 else 0.0

            ev = (p_hat_train * (1.0 - 0.40)) - ((1 - p_hat_train) * 0.40)

            # Evaluación Cualitativa con IA
            ai_eval = analyze_strategy(coin, 10, p_hat_train * 100.0, p_val, ev)
            ai_approved = ai_eval.get("decision") == "APPROVED"

            stat_approved = (p_val < 0.05) and (ev >= 0.10)
            final_approved = stat_approved and ai_approved

            print(f"🪙 MONEDA: [ {coin} ]")
            print(f"   - Train (80%): N={n_train}, Win Rate = {p_hat_train*100:.2f}% | p-value: {p_val:.6f}")
            print(f"   - Test OOS (20%): Win Rate = {p_hat_test*100:.2f}% (N={n_test})")
            print(f"   - EV: +${ev:.4f} USD | IA NVIDIA Nemotron: {ai_eval.get('decision')} ({ai_eval.get('justification')[:80]}...)")
            print(f"   - Veredicto Final: {'✅ APROBADO' if final_approved else '❌ RECHAZADO'}\n")

            if final_approved:
                calibrated_contract["rules_by_coin"][coin] = [{
                    "rule_id": "H1_MOMENTUM_CONTINUATION",
                    "evaluation_minute": 10,
                    "trigger_delta_pct": trigger_threshold,
                    "win_rate_train": round(p_hat_train, 4),
                    "win_rate_test_oos": round(p_hat_test, 4),
                    "p_value": p_val,
                    "confidence_interval_95": [round(ci_low, 4), round(ci_high, 4)],
                    "expected_value_usd": round(ev, 4),
                    "recommended_entry_window_min": [3, 25],
                    "max_entry_price": 0.45,
                    "ai_justification": ai_eval.get("justification")
                }]

    with open(OUTPUT_PATH, 'w') as f:
        json.dump(calibrated_contract, f, indent=2, ensure_ascii=False)

    print("=================================================================")
    print(f"✅ Contrato `parametros_calibrados.json` generado exitosamente.")
    print("=================================================================")

if __name__ == '__main__':
    run_edge_gate()
