#!/usr/bin/env python3
"""
criptobot/ai/strategy_analyst.py
Fase 4: IA Analista Cualitativo de Estrategias e Hipótesis (Criptobot v3.0)

Este módulo evalúa la solidez macro y cualitativa de cada regla o hipótesis antes de enviarla
al Edge Gate final para ser aprobable en `parametros_calibrados.json`.
"""

import sys
import os
import json
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.config_llm import call_llm

def analyze_strategy(coin: str, best_minute: int, win_rate_pct: float, p_value: float, ev_usd: float):
    """Evalúa cualitativamente si una regla cuantitativa es sólida para el bot HFT."""
    system_prompt = (
        "Eres el Strategy Analyst de Criptobot HFT. Tu trabajo es validar si una estrategia "
        "presenta un edge cualitativo sostenible y no es fruto del ruido o del sobreajuste (overfitting). "
        "Responde ÚNICAMENTE en formato JSON."
    )
    user_prompt = f"""
Evalúa la siguiente estrategia cuantitativa propuesta para la moneda {coin}:
- Minuto recomendado de disparo: {best_minute}
- Win Rate histórico: {win_rate_pct:.2f}%
- p-value (Test Binomial Exacto): {p_value:.6f}
- Expected Value (EV): +${ev_usd:.4f} USD por dólar apostado a $0.40

Determina si la regla debe ser AUTORIZADA para ejecución real.
Responde ÚNICAMENTE en JSON:
{{
  "coin": "{coin}",
  "decision": "APPROVED" o "REJECTED",
  "confidence_score": 0.95,
  "justification": "explicación en español"
}}
"""
    res = call_llm(system_prompt, user_prompt)
    try:
        start_idx = res.find("{")
        end_idx = res.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            clean = res[start_idx:end_idx+1]
            # Si hay saltos de linea dentro de strings, limpiarlos
            return json.loads(clean, strict=False)
        return json.loads(res, strict=False)
    except Exception as e:
        print(f"⚠️ Error en StrategyAnalyst para {coin}: {e}")
        # Default de seguridad en caso de fallo
        is_valid = (p_value < 0.05) and (ev_usd >= 0.10)
        return {
            "coin": coin,
            "decision": "APPROVED" if is_valid else "REJECTED",
            "confidence_score": 0.80,
            "justification": "Aprobación estadística estricta por fallback"
        }

if __name__ == '__main__':
    print("🧠 Probando Strategy Analyst para XRP...")
    res = analyze_strategy("XRP", 10, 84.38, 0.000000, 0.4017)
    print(json.dumps(res, indent=2, ensure_ascii=False))
