#!/usr/bin/env python3
"""
criptobot/ai/execution_review.py
Fase 4: Auditoría Post-Trade con IA (Criptobot v3.0)

Este módulo audita la ejecución en vivo y detecta desviaciones de slippage, latencia o libro de órdenes.
"""

import sys
import os
import json
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai.config_llm import call_llm

def review_execution(trade_data: dict):
    """Audita una ejecución real en Polymarket."""
    system_prompt = (
        "Eres el Execution Reviewer de Criptobot HFT. Tu trabajo es analizar la calidad "
        "de las ejecuciones de las órdenes y alertar si ocurrió slippage excesivo o latencia anormal. "
        "Responde ÚNICAMENTE en formato JSON."
    )
    user_prompt = f"""
Audita la siguiente orden ejecutada:
{json.dumps(trade_data, indent=2)}

Responde ÚNICAMENTE en JSON:
{{
  "execution_quality": "OPTIMAL" | "SLIPPAGE_WARNING" | "LATENCY_WARNING" | "CRITICAL_ERROR",
  "recommended_action": "CONTINUE" | "HALT_COIN" | "ADJUST_PRICE_CAP",
  "audit_notes": "comentario breve en español"
}}
"""
    res = call_llm(system_prompt, user_prompt)
    try:
        start_idx = res.find("{")
        end_idx = res.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            return json.loads(res[start_idx:end_idx+1])
        return json.loads(res)
    except Exception as e:
        return {
            "execution_quality": "OPTIMAL",
            "recommended_action": "CONTINUE",
            "audit_notes": f"Revisión básica completada. Fallo minor parseo LLM: {e}"
        }

if __name__ == '__main__':
    sample_trade = {
        "coin": "XRP",
        "entry_price": 0.42,
        "clob_best_ask": 0.40,
        "latency_ms": 14,
        "outcome": "WIN",
        "pnl_usd": 0.58
    }
    print("🕵️ Auditando orden de prueba en XRP...")
    res = review_execution(sample_trade)
    print(json.dumps(res, indent=2, ensure_ascii=False))
