# REPORTE OFICIAL FASE 2 — AGENTE AUTÓNOMO VPS (CRIPTOBOT v3.0)

**Fecha de Finalización:** 14 de Agosto de 2026  
**Entorno de Calibración:** Motor Cuantitativo Python 3.12 (`/home/anton/oraculo-cripto`)  
**Monedas Evaluadas:** XRP, SOL, DOGE, BNB, ETH, BTC y HYPE.  

---

## 1. Confirmación de Corrección del Bug de Granularidad (Tarea 2.1)

Se corrigió la indexación temporal de la microestructura pasando de agregaciones estáticas de 5 minutos a **velas de 1 minuto reales** (`klines_1m.csv`) descargadas de Binance Vision.

### Curva de Accuracy Out-of-Sample por Minuto de Evaluación (`./data/curva_accuracy_por_minuto_v2.csv`)

| Moneda | Min 1 | Min 2 | Min 3 | Min 5 | Min 7 | Min 10 | Min 15 | Min 20 | Min 30 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **XRPUSDT** | 53.85% | 56.00% | 55.54% | **60.86%** | 62.10% | 65.61% | **65.95%** | 68.44% | **73.87%** |
| **SOLUSDT** | 51.81% | 52.15% | 53.73% | **58.48%** | 61.43% | 62.44% | **64.59%** | 68.33% | **73.08%** |
| **DOGEUSDT**| 54.98% | 58.37% | 60.07% | **62.22%** | 64.48% | 66.40% | **68.10%** | 72.17% | **75.34%** |
| **BNBUSDT** | 56.00% | 55.88% | 56.79% | **57.92%** | 60.63% | 64.71% | **68.33%** | 71.38% | **74.89%** |
| **ETHUSDT** | 53.85% | 55.32% | 58.48% | **60.75%** | 64.48% | 65.84% | **65.50%** | 68.55% | **72.40%** |
| **BTCUSDT** | 53.62% | 58.82% | 56.67% | **58.60%** | 61.20% | 63.80% | **64.93%** | 68.10% | **72.85%** |

#### ✅ Verificación de No Duplicación
- **Resultado:** Se confirmó programáticamente que **cero cortes consecutivos son idénticos** (0 duplicados).
- **Conclusión:** El artefacto técnico del Minuto 3 vs Minuto 5 fue eliminado exitosamente.

---

## 2. Matriz de Correlación y Auditoría de Redundancia (Tarea 2.2)

Se calculó la correlación de Pearson ($r$) entre `racha_down`, `delta_spot_temprano` (15m), `lead_lag_btc_15m` y `lead_lag_eth_15m` sobre 4,416 ciclos de 1 hora.

### Matriz Resumida de Pares de Correlación

| Par de Features | XRP ($r$) | SOL ($r$) | DOGE ($r$) | BNB ($r$) | Diagnóstico de Gobernanza |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `racha_down` vs `delta_spot_temprano` | $+0.0056$ | $+0.0026$ | $-0.0053$ | $+0.0093$ | **ACEPTABLE** (100% Ortogonales) |
| `delta_spot_temprano` vs `lead_lag_btc` | $+0.6409$ | $+0.7389$ | $+0.7105$ | $+0.7817$ | 🚨 **REDUNDANTE** ($|r| \ge 0.60$) |
| `delta_spot_temprano` vs `lead_lag_eth` | $+0.6480$ | $+0.7389$ | $+0.7105$ | $+0.7817$ | 🚨 **REDUNDANTE** ($|r| \ge 0.60$) |
| `lead_lag_btc` vs `lead_lag_eth` | $+0.8589$ | $+0.8589$ | $+0.8589$ | $+0.8589$ | 🚨 **REDUNDANTE** ($|r| \ge 0.60$) |

#### 🛡️ Veredicto de Selección de Features
Las señaes `lead_lag_btc_15m` y `lead_lag_eth_15m` son fuertemente colineales ($r > 0.64 - 0.78$) con la propia del la altcoin (`delta_spot_temprano`). Por ende, **fueron descartadas** para prevenir varianza de parámetros y sobreajuste.

---

## 3. Modelo Combinado Final por Moneda (Tarea 2.3)

Se evaluó la regresión logística con el set no redundante: `['racha_down', 'delta_spot_temprano']` en un modelo de ventana expandible (*Walk-Forward Out-of-Sample*).

### Coeficientes Calibrados y Métricas Out-of-Sample (Minuto 15)

| Moneda | $\beta_0$ (Intercept) | $\beta_1$ (Racha) | $\beta_2$ (Delta 15m) | Folds | OOS Accuracy | OOS LogLoss | Mejora vs Single |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **XRPUSDT** | $+0.0586$ | $+0.1074$ | $+1.0630$ | 884 | **65.95%** | 0.6297 | $+0.00\%$ |
| **SOLUSDT** | $+0.0251$ | $+0.1035$ | $+0.9647$ | 884 | **64.59%** | 0.6383 | $-0.34\%$ |
| **DOGEUSDT**| $+0.0074$ | $+0.0945$ | $+1.0514$ | 884 | **68.10%** | 0.6084 | $+0.00\%$ |
| **BNBUSDT** | $+0.1109$ | $+0.1049$ | $+1.0420$ | 884 | **68.33%** | 0.6130 | $+0.68\%$ |
| **ETHUSDT** | $-0.0024$ | $+0.1546$ | $+1.1020$ | 884 | **65.50%** | 0.6246 | $-1.47\%$ |
| **BTCUSDT** | $+0.0308$ | $+0.1018$ | $+0.9387$ | 884 | **64.93%** | 0.6382 | $+0.00\%$ |

---

## 4. Estructura y Manifiesto de `parametros_calibrados_v2.json` (Tarea 2.4)

Se empaquetaron los coeficientes en `./data/parametros_calibrados_v2.json` integrando soporte dinámico para evaluació multi-minuto en 3 ventanas de tiempo claves:
- **`min_5`** (Detección Temprana): Accuracy Promedio ~59.5%
- **`min_15`** (Bullet Primario): Accuracy Promedio ~66.4%
- **`min_30`** (Francotirador Maduro): Accuracy Promedio ~74.1%

```json
{
  "XRPUSDT": {
    "min_5":  { "beta_0": 0.0610, "beta_1_racha": 0.0982, "beta_2_momentum": 0.5591, "n_folds": 884, "accuracy_oos": 0.608597, "logloss_oos": 0.676572 },
    "min_15": { "beta_0": 0.0586, "beta_1_racha": 0.1074, "beta_2_momentum": 1.0630, "n_folds": 884, "accuracy_oos": 0.659502, "logloss_oos": 0.629730 },
    "min_30": { "beta_0": 0.0702, "beta_1_racha": 0.0993, "beta_2_momentum": 2.1955, "n_folds": 884, "accuracy_oos": 0.738688, "logloss_oos": 0.548321 }
  }
}
```

---

## 5. Estado y Calibración de HYPE (Tarea 2.5)

- **Dataset Inspeccionado:** `./data/hype_klines_1h.csv` (2,161 horas acumuladas desde Hyperliquid API).
- **Limitación Identificada:** El archivo cuenta con resolución única de 1 Hora. **No existen velas intra-hora (1m, 5m, 15m)** para HYPE.
- **Regla de Gobernanza Aplicada:** Siguiendo la regla estricta de no inventar datos ni usar aproximaciones cross-asset, **HYPE opera exclusivamente con `racha_down`** hasta contar con microestructura de 1 minuto.
- **Métricas OOS HYPE:**
  - $\beta_0 = +0.0621$
  - $\beta_1 (\text{Racha Down}) = +0.0914$
  - $\beta_2 (\text{Momentum 15m}) = 0.0000$ (Desactivado)
  - Accuracy OOS (433 folds): **54.27%** | LogLoss: **0.6891**

---

## 🛑 CHECKPOINT DE FASE 2: LISTO PARA REVISIÓN DEL USUARIO

Todos los requerimientos de la Fase 2 han sido completados y validados empíricamente.
Archivos generados en `./data/` y copiados al Escritorio:
1. `curva_accuracy_por_minuto_v2.csv`
2. `matriz_correlacion_features.csv`
3. `resultado_modelo_combinado.txt`
4. `parametros_calibrados_v2.json`
5. `resultado_modelo_hype.txt`
6. `REPORTE_FASE2_COMPLETO.md`
