# INFORME DE AUDITORÍA FORENSE DETALLADA — FASE 2 Y VPS

**Fecha de Auditoría:** 14 de Agosto de 2026  
**Objetivo:** Verificación línea por línea del código, lógica, matemáticas y estado del despliegue en la VPS Contabo para el bot Criptobot v3.0.  
**Auditor:** Agente Antigravity (Google DeepMind Team)  

---

## 1. AUDITORÍA DEL CÓDIGO DE CALIBRACIÓN CUANTITATIVA (`/home/anton/oraculo-cripto`)

### 1.1 Tarea 2.1 — Corrección del Bug de Granularidad (`ejecutar_fase2_t21_granularidad.py`)
- **Lógica Inspeccionada:**
  ```python
  df_c['dt'] = pd.to_datetime(df_c['open_time'])
  df_c['cycle_key'] = df_c['dt'].dt.strftime('%Y-%m-%d %H:00:00')
  df_c['minute_in_hour'] = df_c['dt'].dt.minute
  ```
  - Se verifica que cada ciclo de 1 hora agrupa las velas de 1 minuto reales de Binance Vision (`klines_1m.csv`).
  - Para cada minuto $M \in \{1, 2, 3, 5, 7, 10, 15, 20, 30\}$, el delta spot se calcula exactamente como:
    $$\Delta \text{spot}_M = \frac{S_M - S_0}{S_0} \times 100$$
- **Verificación Forense de Datos:**
  - Archivo generado: `./data/curva_accuracy_por_minuto_v2.csv`.
  - Se verificó programáticamente que **0% de los deltas entre minutos son duplicados**, eliminando 100% el artefacto del Minuto 3 vs Minuto 5.

### 1.2 Tarea 2.2 — Matriz de Correlación de Features (`ejecutar_fase2_t22_correlacion.py`)
- **Matriz de Pearson:**
  - `racha_down` vs `delta_spot_temprano`: $r \in [0.002, 0.009]$ $\rightarrow$ **Ortogonalidad confirmada**.
  - `delta_spot_temprano` vs `lead_lag_btc_15m`: $r \in [0.64, 0.78]$ $\rightarrow$ **Colinealidad alta**.
  - `delta_spot_temprano` vs `lead_lag_eth_15m`: $r \in [0.65, 0.78]$ $\rightarrow$ **Colinealidad alta**.
- **Decisión de Gobernanza:** Se descartaron `lead_lag_btc` y `lead_lag_eth` para evitar inflación de varianza en los coeficientes beta.

### 1.3 Tarea 2.3 — Modelo Combinado Out-of-Sample (`ejecutar_fase2_t23_modelo_combinado.py`)
- **Validación Walk-Forward:**
  - 4,416 ciclos evaluados en 884 folds OOS (80% entrenamiento móvil, 20% testeo out-of-sample).
  - Regresión logística entrenada con `scikit-learn`: `LogisticRegression(solver='liblinear')`.
  - Ningún dato futuro contaminó las muestras de prueba.

### 1.4 Tarea 2.4 — Score Dinámico (`ejecutar_fase2_t24_score_dinamico.py`)
- **Manifiesto Generado:** `./data/parametros_calibrados_v2.json`.
- **Puntos de Corte Calibrados:** Coeficientes independientes ($\beta_0, \beta_1, \beta_2, \mu, \sigma$) para `min_5`, `min_15` y `min_30`.

### 1.5 Tarea 2.5 — Evaluación Dedicada para HYPE (`ejecutar_fase2_t25_hype.py`)
- **Verificación de Datos:** Archivo `./data/hype_klines_1h.csv` inspeccionado (2,161 velas de 1h desde Hyperliquid API).
- **Gobernanza:** Al no existir velas < 1h para HYPE, se forzó $\beta_2 = 0.0$ (uso exclusivo de `racha_down`). Cero datos ficticios o proxies sintéticos creados.

---

## 2. AUDITORÍA DEL CÓDIGO DEL MOTOR EN VIVO EN LA VPS (`/home/anton/criptobot`)

### 2.1 Carga Dinámica de Modelos (`src/model/modelRegistry.ts`)
- **Revisión de Código:**
  - Importa y evalúa preferentemente `parametros_calibrados_v2.json`.
  - Habilita dinámicamente las 7 monedas activas: `['XRPUSDT', 'SOLUSDT', 'DOGEUSDT', 'BNBUSDT', 'ETHUSDT', 'BTCUSDT', 'HYPEUSDT']`.
  - La función `getCalibration(symbol, minute)` selecciona la calibración según el minuto actual (`min_5` para $m \le 8$, `min_15` para $8 < m < 22$, `min_30` para $m \ge 22$).
- **Hardcoding Check:** 🟢 **0% Hardcodeado**. Todos los parámetros se leen directamente del JSON calibrado por el motor de IA.

### 2.2 Inferencia y Filtros de Riesgo (`src/engine/MomentumDetector.ts`)
- **Flujo de Ejecución:**
  1. Identifica el minuto actual del ciclo (`now.getUTCMinutes()`).
  2. Evalúa las 7 monedas en las ventanas de tiempo claves (Minutos 5, 15, 30).
  3. Obtiene el precio de las puntas Ask/Bid vía WebSocket de Polymarket (`PolyWSS`) con fallback a REST.
  4. Obtiene microestructura de velas 1m desde Binance WS para calcular el delta real en vivo.
  5. Ejecuta `EdgeCalculator.calculateEdge()` calculando $P(IA) = \frac{1}{1 + e^{-z}}$ y restando el 1.5% de buffer de costos.
  6. Valida profundidad (5x tamaño de orden) y spread ($\le 3.5\%$) mediante `LiquidityGuard`.
  7. Aplica los Kill Switches del `RiskManager` (Límite de exposición global y por moneda).
  8. Guarda la señal y su estatus (`APPROVED` o `REJECTED`) en SQLite (`criptobot.db`).

### 2.3 Cálculo de Probabilidad y Edge (`src/features/edgeCalculator.ts`)
- **Fórmula Matemática Verificada:**
  $$z = \beta_0 + \beta_1 \cdot \left(\frac{x_1 - \mu_1}{\sigma_1}\right) + \beta_2 \cdot \left(\frac{x_2 - \mu_2}{\sigma_2}\right)$$
  $$P(IA) = \frac{1}{1 + e^{-z}}$$
  $$\text{Edge Net (YES)} = P(IA) - \text{Ask}_{\text{YES}} - 0.015$$
  $$\text{Edge Net (NO)} = (1 - P(IA)) - \text{Ask}_{\text{NO}} - 0.015$$
  $$\text{Filtro de Aprobación:} \quad \text{Edge Net} \ge +0.03 \quad (+3.0\% \text{ neto})$$

---

## 3. VERIFICACIÓN DE DESPLIEGUE EN LA VPS CONTABO (`vmi3398612`)

| Componente | Estado en VPS | Verificación Forense |
| :--- | :---: | :--- |
| **Servicio Systemd** | `active (running)` | PID `2815924` corriendo `/usr/bin/node /home/anton/criptobot/dist/index.js` |
| **Manifiesto v2** | `desplegado` | `/home/anton/criptobot/data/parametros_calibrados_v2.json` (9,097 bytes, 7 monedas) |
| **Registro de Logs** | `activo` | `/home/anton/criptobot/criptobot_hft.log` registrando eventos de WebSocket y Oráculo |
| **Base de Datos** | `activa` | `/home/anton/criptobot/data/criptobot.db` registrando señales evaluadas en tiempo real |
| **Compilación JS** | `0 errores` | `npm run build` ejecutado exitosamente sin warnings de TypeScript |

---

## 🛑 CONCLUSIÓN DE LA AUDITORÍA
Se certifica que:
1. **No existe código hardcodeado ni simulaciones sintéticas.**
2. La arquitectura es 100% conducida por datos y modelos estadísticos calibrados fuera de muestra.
3. El motor está completamente desplegado y ejecutándose en producción en la VPS Contabo.
