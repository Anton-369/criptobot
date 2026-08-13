# AUDITORÍA FORENSE INTEGRAL DE ARQUITECTURA, CÓDIGO E IA
## Criptobot v3.0 — Estado de Producción en VPS (`161.97.162.229`)

**Fecha de Auditoría:** 12 de Agosto de 2026 (Hora ET / Chile)  
**Entorno Audita:** VPS Contabo (`181.42.177.149` / `161.97.162.229`)  
**Commit de Producción:** `1a13057` (`main` branch)  

---

## 1. RESUMEN DE ARQUITECTURA EN VIVO

El bot opera como un **sistema distribuido HFT cuantitativo** dividido en 5 capas desacopladas que se ejecutan directamente en la VPS:

- **Binance WebSocket Engine:** Ticks Spot 1m de BTC, ETH, XRP, SOL, DOGE, BNB.
- **MomentumDetector (Logit Model Etapa 1):** Inferencia en tiempo real ($\beta_0 + \beta_1 z(racha) + \beta_2 z(\Delta spot)$).
- **Polymarket CLOB Connector:** Precios y profundidades del libro de órdenes en tiempo real con Guardia de Liquidez ($\ge $10$ USD).
- **ExecutionEngine:** Disparos de órdenes FOK a través de la API privada de Polymarket con Proxy Wallet.
- **DatabaseManager (SQLite WAL):** Persistencia en tiempo real de velas de 1m, snapshots y logs de predicción.

---

## 2. AUDITORÍA FORENSE DE CÓDIGO Y LÓGICA (LINEA POR LINEA)

### 🟢 A. Motor de Inferencia IA (`src/engine/MomentumDetector.ts`)
* **Lógica Evaluada:**
  - Normalización Causal Z-Score fuera de muestra ((racha)$ y (\Delta spot)$).
  - Cálculo de probabilidad con la ecuación sigmoide:
    73676Score_{UP} = \frac{1}{1 + e^{-logit}}73676
  - Regla de Ventaja Asimétrica (Etapa 2): Disparar solo si $ y $.
* **Estado:** 🟢 Correcto y validado contra look-ahead bias.

---

### 🟢 B. Tarea Horaria de Re-Calibración Autónoma (`src/index.ts` - Línea 191)
* **Lógica Evaluada:**
  En el minuto 5 de cada hora UTC, ejecuta autónomamente `python3 scripts/calibrar_etapa1.py` sobre los 6 meses de microestructura de Binance.
* **Estado:** 🟢 Corregido en VPS.

---

### 🟢 C. Reconciliador de PnL (`src/index.ts` - Líneas 160–178)
* **Lógica Evaluada:**
  Parsea la dirección predicha analizando el string de la regla activa (soporta `LOGIT_SCORE_EDGE_V3` y `ORACLE_UP/DOWN`).
* **Estado:** 🟢 Corregido en VPS.

---

## 3. CUELLOS DE BOTELLA TÉCNICOS & PENDIENTES IDENTIFICADOS

1. **REST API Polling Overhead en Polymarket:** Migrar las cuotas REST de Polymarket a la conexión WebSocket del CLOB para eliminar latencia HTTP GET.
2. **Calibración Dedicada para HYPE:** Entrenar un modelo de regresión logística exclusivo para HYPE cuando SQLite acumule $\ge 300$ horas de velas de 1m desde Hyperliquid API.
3. **Toma de Ganancias Anticipada (Minutos 50–58):** Vender posiciones ganadoras en el mercado secundario si la cuota supera $$0.92$ USD para liberar capital inmediato.
4. **Barrido VWAP Multinivel para Órdenes Grandes:** Implementar simulación de la curva de oferta para tamaños de orden mayores a $$100$ USD.

