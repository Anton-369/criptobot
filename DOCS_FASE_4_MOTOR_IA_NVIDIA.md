# 🏛️ DOCUMENTACIÓN DE ARQUITECTURA Y AUDITORÍA: FASE 4 (MOTOR DE IA AUTÓNOMO)

## 📌 Resumen General
La **Fase 4** encapsula una suite de Inteligencia Artificial 100% autocontenida dentro del repositorio `/home/anton/criptobot/ai/`. Esta suite opera en segundo plano analizando la base de datos de ticks y microestructura en SQLite (`criptobot_v3.sqlite`) y calibrando los parámetros de disparo en `data/parametros_calibrados.json`.

---

## 🛠️ Estructura del Módulo `/ai/`

```
/home/anton/criptobot/ai/
├── config_llm.py         # Conector multimodelo (NVIDIA Nemotron 3.5 Lightning, Gemma 4, DeepSeek)
├── opportunity_scout.py  # Cazador de ineficiencias spot e impulsos intra-hora
├── strategy_analyst.py   # Analista cualitativo de hipótesis con LLM
├── edge_gate.py          # Puerta de decisión unificada (Estadística p < 0.05 + IA)
└── execution_review.py   # Auditoría post-trade de ejecuciones
```

---

## 🧠 Prompts y Modelos Configurados

1. **`config_llm.py`**:
   - **Modelo Primario**: `nvidia/nemotron-3.5-lightning:free` (vía OpenRouter API).
   - **Fallback 1**: `google/gemma-4-26b-a4b-it:free`.
   - **Fallback 2**: `deepseek-chat` (vía API Nativa de DeepSeek).

2. **`opportunity_scout.py`**:
   - *System Prompt*: "Eres el Opportunity Scout de Criptobot HFT. Tu trabajo es analizar la microestructura de precios spot y determinar en qué minutos se genera la mayor ventaja (edge) para disparar en opciones de Polymarket. Responde SIEMPRE en formato JSON."

3. **`strategy_analyst.py`**:
   - *System Prompt*: "Eres el Strategy Analyst de Criptobot HFT. Tu trabajo es validar si una estrategia presenta un edge cualitativo sostenible y no es fruto del ruido o del sobreajuste (overfitting). Responde ÚNICAMENTE en formato JSON."

4. **`execution_review.py`**:
   - *System Prompt*: "Eres el Execution Reviewer de Criptobot HFT. Tu trabajo es analizar la calidad de las ejecuciones de las órdenes y alertar si ocurrió slippage excesivo o latencia anormal. Responde ÚNICAMENTE en formato JSON."

---

## 📊 Estado de Calibración del Contrato (`parametros_calibrados.json`)

| Moneda | Impulso (m=10) | Win Rate Train (80%) | Win Rate Test OOS (20%) | p-value | EV (USD) | Veredicto |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **XRP** | $\Delta \ge 0.10\%$ | 80.17% | 84.38% | $1.79 \times 10^{-11}$ | +$0.4017 | ✅ **APROBADO** |
| **SOL** | $\Delta \ge 0.10\%$ | 75.17% | 74.29% | $4.95 \times 10^{-10}$ | +$0.3517 | ✅ **APROBADO** |
| **DOGE** | $\Delta \ge 0.10\%$ | 80.15% | 67.44% | $9.40 \times 10^{-13}$ | +$0.4015 | ✅ **APROBADO** |
| **BNB** | $\Delta \ge 0.10\%$ | 78.00% | 87.88% | $7.95 \times 10^{-09}$ | +$0.3800 | ✅ **APROBADO** |
| **HYPE** | $\Delta \ge 0.10\%$ | 47.06% | 83.33% | 0.685471 | +$0.0706 | ❌ **RECHAZADO** (Data insuficiente) |
