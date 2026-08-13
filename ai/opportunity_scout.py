#!/usr/bin/env python3
"""
criptobot/ai/opportunity_scout.py
Fase 4: Cazador Autónomo de Ineficiencias e Impulsos Spot en SQLite (Criptobot v3.0)

Este módulo:
1. Escanea la base de datos `criptobot_v3.sqlite` filtrando por las 5 monedas autorizadas (XRP, SOL, DOGE, BNB, HYPE).
2. Calcula métricas de aceleración de velocidad spot (delta en minutos 1 a 15).
3. Utiliza NVIDIA Nemotron 3.5 Lightning para identificar ineficiencias y desvíos explotables.
"""

import sys
import os
import json
import sqlite3
import pandas as pd

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.config_llm import call_llm

DB_PATH = '/home/anton/criptobot/data/criptobot_v3.sqlite'
PAIRS = ['XRP', 'SOL', 'DOGE', 'BNB', 'HYPE']

def scout_opportunities():
    if not os.path.exists(DB_PATH):
        print(f"❌ Base de datos no encontrada: {DB_PATH}")
        return {}

    conn = sqlite3.connect(DB_PATH)
    df_1m = pd.read_sql_query("SELECT coin, cycle_key, minute_in_hour, open_price, close_price FROM klines_1m WHERE coin IN ('XRP', 'SOL', 'DOGE', 'BNB', 'HYPE') ORDER BY open_time_ms ASC;", conn)
    conn.close()

    if len(df_1m) == 0:
        print("⚠️ No hay suficiente data de 1m en SQLite.")
        return {}

    scout_summary = {}

    for coin in PAIRS:
        df_c = df_1m[df_1m['coin'] == coin]
        if len(df_c) == 0:
            continue

        cycles = {}
        for _, r in df_c.iterrows():
            ckey = r['cycle_key']
            m = int(r['minute_in_hour'])
            if ckey not in cycles: cycles[ckey] = {}
            cycles[ckey][m] = {'open': float(r['open_price']), 'close': float(r['close_price'])}

        # Calcular victorias al minuto 5, 10 y 15 para impulsos >= +0.10%
        stats = {m: {'signals': 0, 'wins': 0} for m in [3, 5, 10, 15]}
        for ckey, mins in cycles.items():
            if 0 in mins and 59 in mins:
                open_1h = mins[0]['open']
                close_1h = mins[59]['close']
                is_up = close_1h >= open_1h

                for target_m in [3, 5, 10, 15]:
                    if target_m in mins:
                        p_m = mins[target_m]['close']
                        delta = ((p_m - open_1h) / open_1h) * 100.0
                        if delta >= 0.10:
                            stats[target_m]['signals'] += 1
                            if is_up:
                                stats[target_m]['wins'] += 1

        scout_summary[coin] = stats

    # Invocación a NVIDIA Nemotron para sintetizar hallazgos
    system_prompt = (
        "Eres el Opportunity Scout de Criptobot HFT. Tu trabajo es analizar la microestructura "
        "de precios spot y determinar en qué minutos se genera la mayor ventaja (edge) "
        "para disparar en opciones de Polymarket. Responde SIEMPRE en formato JSON."
    )
    user_prompt = f"""
Analiza los siguientes hallazgos empíricos de impulsos spot (Minutos 3, 5, 10, 15 con delta >= +0.10%):

{json.dumps(scout_summary, indent=2)}

Genera un reporte de oportunidades identificando la ventana de disparo más efectiva por moneda.
Responde ÚNICAMENTE en JSON con el formato:
{{
  "recommendations": [
    {{
      "coin": "MONEDA",
      "best_minute": 10,
      "estimated_win_rate_pct": 80.0,
      "rationale": "explicación breve en español"
    }}
  ]
}}
"""
    llm_res = call_llm(system_prompt, user_prompt)
    if llm_res:
        try:
            start_idx = llm_res.find("{")
            end_idx = llm_res.rfind("}")
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                clean_json = llm_res[start_idx:end_idx+1]
                parsed = json.loads(clean_json)
                return parsed
            return json.loads(llm_res)
        except Exception:
            pass

    # Heuristic fallback recommendations calculated directly from scout_summary
    recommendations = []
    for coin, stats in scout_summary.items():
        best_m = 10
        max_wr = 0.0
        for m, s in stats.items():
            if s['signals'] > 0:
                wr = s['wins'] / s['signals']
                if wr >= max_wr:
                    max_wr = wr
                    best_m = m
        recommendations.append({
            "coin": coin,
            "best_minute": best_m,
            "estimated_win_rate_pct": round(max_wr * 100.0, 2),
            "rationale": f"Scout heurístico local: Win rate de {round(max_wr * 100.0, 1)}% en minuto {best_m}."
        })

    return {"recommendations": recommendations, "summary": scout_summary}

if __name__ == '__main__':
    print("🔍 Ejecutando Opportunity Scout con NVIDIA Nemotron...")
    report = scout_opportunities()
    print(json.dumps(report, indent=2, ensure_ascii=False))
