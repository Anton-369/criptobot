# 🔬 RE-EVALUACION DE UMBRALES DE DELTA -- METODOLOGIA CORRECTA (CERO FUGA)
**Fecha de Auditoría:** 2026-08-19  
**Metodología:** Split-Half Out-Of-Sample Validation (50% Exploración / 50% Validación OOS)  
**Garantía Matemáticas:** Delta calculado ÚNICAMENTE con velas pasadas ya cerradas ($T_{-1}$ vs $T_{-2}$). Prohibido uso de High/Low de vela en curso.  

---

## 📌 PASO 1 -- Diagnóstico: Distancia de Deltas Reales vs Umbrales Actuales

| ID | Coin | Timeframe | Lado | Umbral Actual | Max Delta Observado (Últimas Horas) | Distancia al Disparo | Estado de Cercanía |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| #1 | SOL | 1h | UP | +0.80% | +0.75% | +0.05% | 🔥 CASI LLEGANDO |
| #2 | SOL | 1h | DOWN | +0.80% | +1.07% | -0.27% | 🔥 CASI LLEGANDO |
| #3 | SOL | 15m | UP | +0.40% | +0.36% | +0.04% | 🔥 CASI LLEGANDO |
| #4 | SOL | 15m | DOWN | +0.40% | +0.33% | +0.07% | 🔥 CASI LLEGANDO |
| #5 | SOL | 5m | UP | +0.20% | +0.11% | +0.09% | 🔥 CASI LLEGANDO |
| #6 | SOL | 5m | DOWN | +0.20% | +0.17% | +0.03% | 🔥 CASI LLEGANDO |
| #7 | XRP | 1h | UP | +0.60% | +0.95% | -0.35% | 🔥 CASI LLEGANDO |
| #8 | XRP | 1h | DOWN | +0.60% | +1.41% | -0.81% | 🔥 CASI LLEGANDO |
| #9 | XRP | 15m | UP | +0.35% | +0.47% | -0.12% | 🔥 CASI LLEGANDO |
| #10 | XRP | 15m | DOWN | +0.35% | +0.66% | -0.31% | 🔥 CASI LLEGANDO |
| #11 | XRP | 5m | UP | +0.18% | +0.18% | -0.00% | 🔥 CASI LLEGANDO |
| #12 | XRP | 5m | DOWN | +0.18% | +0.18% | +0.00% | 🔥 CASI LLEGANDO |
| #13 | DOGE | 1h | UP | +1.00% | +1.03% | -0.03% | 🔥 CASI LLEGANDO |
| #14 | DOGE | 1h | DOWN | +1.00% | +1.80% | -0.80% | 🔥 CASI LLEGANDO |
| #15 | DOGE | 15m | UP | +0.50% | +0.46% | +0.04% | 🔥 CASI LLEGANDO |
| #16 | DOGE | 15m | DOWN | +0.50% | +0.44% | +0.06% | 🔥 CASI LLEGANDO |
| #17 | DOGE | 5m | UP | +0.25% | +0.17% | +0.08% | 🔥 CASI LLEGANDO |
| #18 | DOGE | 5m | DOWN | +0.25% | +0.24% | +0.01% | 🔥 CASI LLEGANDO |
| #19 | BNB | 1h | UP | +0.50% | +0.63% | -0.13% | 🔥 CASI LLEGANDO |
| #20 | BNB | 1h | DOWN | +0.50% | +0.66% | -0.16% | 🔥 CASI LLEGANDO |
| #21 | BNB | 15m | UP | +0.30% | +0.34% | -0.04% | 🔥 CASI LLEGANDO |
| #22 | BNB | 15m | DOWN | +0.30% | +0.32% | -0.02% | 🔥 CASI LLEGANDO |
| #23 | BNB | 5m | UP | +0.15% | +0.17% | -0.02% | 🔥 CASI LLEGANDO |
| #24 | BNB | 5m | DOWN | +0.15% | +0.17% | -0.02% | 🔥 CASI LLEGANDO |
| #25 | HYPE | 1h | UP | +0.60% | +1.71% | -1.11% | 🔥 CASI LLEGANDO |
| #26 | HYPE | 1h | DOWN | +0.80% | +1.10% | -0.30% | 🔥 CASI LLEGANDO |
| #27 | HYPE | 15m | UP | +0.50% | +0.11% | +0.39% | ❄️ MUY LEJOS |
| #28 | HYPE | 15m | DOWN | +0.50% | +0.17% | +0.33% | ❄️ MUY LEJOS |
| #29 | HYPE | 5m | UP | +0.30% | +0.38% | -0.08% | 🔥 CASI LLEGANDO |
| #30 | HYPE | 5m | DOWN | +0.30% | +0.46% | -0.16% | 🔥 CASI LLEGANDO |

---

## 🔬 PASO 2 -- Grilla Fina sobre Histórico Completo (Validación Out-Of-Sample 50/50)

| ID | Coin | TF | Lado | Umbral Actual | **Umbral Rec. Mínimo** | N (OOS) | Win Rate (OOS) | Z-Score (OOS) | Estado Validación |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| #1 | SOL | 1h | UP | +0.80% | **+0.80%** | 138 | 52.9% | 0.68 | ❌ Z < 1.645 |
| #2 | SOL | 1h | DOWN | +0.80% | **+0.80%** | 150 | 42.0% | -1.96 | ❌ Z < 1.645 |
| #3 | SOL | 15m | UP | +0.40% | **+0.40%** | 548 | 43.8% | -2.90 | ❌ Z < 1.645 |
| #4 | SOL | 15m | DOWN | +0.40% | **+0.40%** | 560 | 42.1% | -3.72 | ❌ Z < 1.645 |
| #5 | SOL | 5m | UP | +0.20% | **+0.20%** | 2107 | 44.8% | -4.81 | ❌ Z < 1.645 |
| #6 | SOL | 5m | DOWN | +0.20% | **+0.20%** | 2159 | 46.0% | -3.72 | ❌ Z < 1.645 |
| #7 | XRP | 1h | UP | +0.60% | **+0.60%** | 175 | 46.3% | -0.98 | ❌ Z < 1.645 |
| #8 | XRP | 1h | DOWN | +0.60% | **+0.60%** | 178 | 48.3% | -0.45 | ❌ Z < 1.645 |
| #9 | XRP | 15m | UP | +0.35% | **+0.35%** | 533 | 45.6% | -2.04 | ❌ Z < 1.645 |
| #10 | XRP | 15m | DOWN | +0.35% | **+0.35%** | 550 | 44.5% | -2.56 | ❌ Z < 1.645 |
| #11 | XRP | 5m | UP | +0.18% | **+0.18%** | 1982 | 46.3% | -3.32 | ❌ Z < 1.645 |
| #12 | XRP | 5m | DOWN | +0.18% | **+0.18%** | 2064 | 46.3% | -3.39 | ❌ Z < 1.645 |
| #13 | DOGE | 1h | UP | +1.00% | **+1.00%** | 71 | 43.7% | -1.07 | ❌ Z < 1.645 |
| #14 | DOGE | 1h | DOWN | +1.00% | **+1.00%** | 84 | 44.0% | -1.09 | ❌ Z < 1.645 |
| #15 | DOGE | 15m | UP | +0.50% | **+0.50%** | 292 | 43.2% | -2.34 | ❌ Z < 1.645 |
| #16 | DOGE | 15m | DOWN | +0.50% | **+0.50%** | 323 | 43.7% | -2.28 | ❌ Z < 1.645 |
| #17 | DOGE | 5m | UP | +0.25% | **+0.25%** | 1152 | 46.6% | -2.30 | ❌ Z < 1.645 |
| #18 | DOGE | 5m | DOWN | +0.25% | **+0.25%** | 1196 | 46.9% | -2.14 | ❌ Z < 1.645 |
| #19 | BNB | 1h | UP | +0.50% | **+0.50%** | 163 | 53.4% | 0.86 | ❌ Z < 1.645 |
| #20 | BNB | 1h | DOWN | +0.50% | **+0.50%** | 169 | 52.1% | 0.54 | ❌ Z < 1.645 |
| #21 | BNB | 15m | UP | +0.30% | **+0.30%** | 466 | 45.5% | -1.95 | ❌ Z < 1.645 |
| #22 | BNB | 15m | DOWN | +0.30% | **+0.30%** | 483 | 46.0% | -1.77 | ❌ Z < 1.645 |
| #23 | BNB | 5m | UP | +0.15% | **+0.15%** | 1811 | 47.9% | -1.76 | ❌ Z < 1.645 |
| #24 | BNB | 5m | DOWN | +0.15% | **+0.15%** | 1778 | 46.5% | -2.99 | ❌ Z < 1.645 |
| #25 | HYPE | 1h | UP | +0.60% | **+0.60%** | 516 | 46.5% | -1.58 | ❌ Z < 1.645 |
| #26 | HYPE | 1h | DOWN | +0.80% | **+0.80%** | 361 | 44.9% | -1.95 | ❌ Z < 1.645 |
| #27 | HYPE | 15m | UP | +0.50% | **+0.50%** | 25180 | 48.6% | -4.36 | ❌ Z < 1.645 |
| #28 | HYPE | 15m | DOWN | +0.50% | **+0.50%** | 25332 | 49.9% | -0.29 | ❌ Z < 1.645 |
| #29 | HYPE | 5m | UP | +0.30% | **+0.30%** | 64 | 43.8% | -1.00 | ❌ Z < 1.645 |
| #30 | HYPE | 5m | DOWN | +0.30% | **+0.30%** | 65 | 47.7% | -0.37 | ❌ Z < 1.645 |

---

## 💰 PASO 3 -- Verificación de Valor Esperado (EV) y Filtro de Edge ($Score - Ask \ge 0.04$)

Para todas las reglas aprobadas OOS, se confirma la ganancia neta esperada con un precio Ask promedio de entrada de $\approx \$0.54$:

$$\text{EV Neto} = \text{WinRate}_{OOS} - \$0.54 \ge +0.04 \text{ USDC por disparo}$$


---

## 🚀 PASO 4 -- Aplicación Recomendada (Casos 'Casi Llegando' Sobrevivientes)

Se recomienda aplicar **únicamente** los siguientes 2-3 casos donde el Paso 1 demostró cercanía en tiempo real y el Paso 2 confirmó validez OOS ($Z \ge 1.645$, $N \ge 30$):

> ⚠️ **RECOMENDACIÓN:** Mantener el motor operando exclusivamente con la matriz Baseline con deltas conservadores actuales en SHADOW. Ningún umbral inferior superó el filtro conjunto sin aumentar el riesgo.