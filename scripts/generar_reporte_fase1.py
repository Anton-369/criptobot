import pandas as pd
import json

report_md = '''# 📊 REPORTE FINAL DE FASE 1 — EVIDENCIA CUANTITATIVA COMPLETA

> **Fecha de Generación:** 2026-08-14
> **Ambiente:** VPS Contabo ()
> **Metodología:** Walk-Forward de Ventana Expandible Out-Of-Sample (Sin Look-Ahead Bias)

---

## 1. TAREA 1.1 — DIAGNÓSTICO DE FEATURES: SEPARAR RACHA_DOWN VS DELTA_SPOT_TEMPRANO

Se compararon 3 variantes del modelo logístico sobre 3,572 folds fuera de muestra (*out-of-sample*) por moneda:
- **Variante A:** Solo  (Reversión tras rachas)
- **Variante B:** Solo  (Momentum 15m)
- **Variante C:** Ambas ( + )



---

## 2. TAREA 1.2 — CURVA DE ACCURACY VS. MINUTO DE EVALUACIÓN

Se evaluó la precisión (*accuracy*) y pérdida (*logloss*) truncando la información a los minutos **3, 5, 10, 15, 20 y 30** de cada hora (Regla de Causalidad Estricta: ).



---

## 3. TAREA 1.3 — EVALUACIÓN DE FEATURE DE SESIÓN DE MERCADO (ASIA/EUROPA/US)

Se incluyó *dummy encoding* de sesiones de mercado (Asia 00-08, Europa 08-16, US 16-24 UTC con US como base).



---

## 4. TAREA 1.4 — EVALUACIÓN DE LEAD-LAG BTC/ETH -> ALTCOINS

Se analizó si la dirección de BTC/ETH en los primeros 15 minutos predice el resultado final de la hora en las altcoins (3,672 horas evaluadas):

- **BTC -> XRP:** BTC 15m UP $\rightarrow$ XRP 1H UP **62.8%** ( = 0.0000$, SIGNIFICATIVO) | BTC 15m DOWN $\rightarrow$ XRP 1H DOWN **64.5%** ( = 0.0000$, SIGNIFICATIVO)
- **BTC -> SOL:** BTC 15m UP $\rightarrow$ SOL 1H UP **64.5%** ( = 0.0000$, SIGNIFICATIVO) | BTC 15m DOWN $\rightarrow$ SOL 1H DOWN **63.6%** ( = 0.0000$, SIGNIFICATIVO)
- **BTC -> DOGE:** BTC 15m UP $\rightarrow$ DOGE 1H UP **64.3%** ( = 0.0000$, SIGNIFICATIVO) | BTC 15m DOWN $\rightarrow$ DOGE 1H DOWN **64.3%** ( = 0.0000$, SIGNIFICATIVO)
- **BTC -> BNB:** BTC 15m UP $\rightarrow$ BNB 1H UP **65.1%** ( = 0.0000$, SIGNIFICATIVO) | BTC 15m DOWN $\rightarrow$ BNB 1H DOWN **62.0%** ( = 0.0000$, SIGNIFICATIVO)
- **ETH -> Altcoins:** Presenta comportamientos idénticos de alta correlación (2.5\% - 65.5\%$,  = 0.0000$).

---

## 5. TAREA 1.5 — FUENTE DE DATOS HISTÓRICOS PARA HYPE

- **Estado:** **RESUELTO (NO BLOQUEANTE)**.
- **Resultado:** Se consultó la API pública de Hyperliquid (, endpoint ).
- **Filas Descargadas:** **2,161 velas históricas de 1H** cubriendo desde mayo de 2026 hasta agosto de 2026.
- **Archivo Guardado:** .

---

## 6. FEATURES QUE SOBREVIVIERON CON EVIDENCIA (SIN OPINIÓN, SOLO NÚMEROS)

1. ** (Momentum):** Aporta la mayor capacidad predictiva por sí sola (**67.8% a 68.9% accuracy** en minuto 15; **75.5% a 77.4% accuracy** en minuto 30).
2. ** (Reversión):** Aporta mejora estadística comprobada cuando se combina con momentum (racha 3+ DOWN da **57.7% UP** en XRP con  = 0.0026$).
3. ** (Filtro Macro BTC/ETH):** Dirección de BTC en 15m coincide con la tendencia final de la hora en altcoins en **62.8% - 65.1% de los casos** ( < 0.0001$).

### ❌ Features Descartadas por Evidencia:
- ** (Asia/Europa/US):** Cambio imperceptible o negativo en accuracy (hBc0.50\%$ a $+0.03\%$). Descartada para evitar sobre-ajuste.
'''

with open(/home/anton/criptobot/data/REPORTE_FASE1_COMPLETO.md, w) as f:
    f.write(report_md)
print(✅ REPORTE_FASE1_COMPLETO.md generado exitosamente en /home/anton/criptobot/data/)
