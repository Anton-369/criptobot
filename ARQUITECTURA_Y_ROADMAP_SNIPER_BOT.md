# ARQUITECTURA MAESTRA Y ROADMAP: ULTRA-FAST LATENCY SNIPER BOT (CRIPTOBOT v3.0)

**Proyecto:** Criptobot Ultra-Fast Quantitative HFT Engine  
**Versión:** 3.0 (Especificación Modular de Producción)  
**Autor:** Antigravity AI & Anton  
**Estado:** En Progreso (Fase 0 y Fase 1 COMPLETADAS)  
**Horario Operativo:** ET (Eastern Time) / Chile (CLT/CLST)  
**Safety Switch:** `LIVE_FIRING_ENABLED: false` (Bloqueo Físico en OFF)  

---

## 📌 ESTADO Y ROADMAP DE 7 FASES

```
[✅ FASE 0] Saneamiento de Código y Master Safety Switch (COMPLETADA)
[✅ FASE 1] Colector 24/7 de 7 Monedas + Discovery Burst & SQLite HFT (COMPLETADA)
[✅ FASE 2] Ingesta Histórica (4 Meses / 20k Klines + 4.6k Polys) + Validaciones en Vivo (COMPLETADA)
[✅ FASE 3] Motor de Calibración Offline Statistically Validated (p < 0.05) (COMPLETADA)
[   FASE 4] Oráculo Sincronizado en Vivo (Ciclos :00:05 ET/Chile)
[   FASE 5] Sniper HFT Multi-Disparo EV Engine (>5 disparos/hora, Cooldown 3m)
[   FASE 6] Control Dashboard Read-Only (Puerto 8506) & Monitoreo 24/7
[   FASE 7] Prueba Piloto con Capital Micro (5-10 disparos de $1.00 USD)
```

---

## 🛠️ DETALLE TÉCNICO DE FASES

### ✅ FASE 0: Saneamiento de Código & Master Safety Guard
- **Master Safety Switch:** Agregado `LIVE_FIRING_ENABLED: false` en `src/config/environment.ts` y comprobación al inicio de `executeSignal()` en `ExecutionEngine.ts`.
- **Saneamiento `server.ts`:** Eliminada la llave de cierre extra en la línea 105 que destruía la clase `DashboardServer`.
- **Saneamiento `MatrixCollector.ts`:** Sustituida la variable `currentHour` por `completedHour` en la finalización de ciclo a las `:00`.
- **Verificación:** Compilación estricta TypeScript `tsc --noEmit` con **0 errores**.

---

### ✅ FASE 1: Colector 24/7 de 7 Monedas & Discovery Burst (Capa 1 + Capa 5)
- **Soporte 7 Activos:** BTC, ETH, XRP, SOL, DOGE, BNB y HYPE.
- **Discovery Poller:** Ráfagas de descubrimiento entre `:00:00` y `:00:10` ET/Chile para indexar los nuevos mercados de 1H creados en Polymarket en tiempo real (< 10ms RAM cache).
- **Persistencia SQLite (`data/criptobot_v3.sqlite`):**
  - **Modo WAL:** `PRAGMA journal_mode = WAL;` (Lectura/Escritura concurrente sin bloqueos de disco).
  - **Tabla `snapshots_mercado`:** Registro cada 60s de `yes_price`, `no_price`, `best_ask_up/down`, `best_bid_up/down` y profundidad del orderbook.
  - **Tabla `precios_subyacente`:** Registro cada 60s del Spot de Binance (`price`, `high_1h`, `low_1h`, `open_1h`, `delta_pct_1h`).
  - **Tabla `predicciones_log`:** Log de predicciones del Oráculo y estado de disparos.
- **Integración:** Totalmente operativo e integrado en `src/index.ts`.

---

### ⏳ FASE 2: Ingesta Histórica (4 Meses) + Validaciones en Vivo
- Descarga e ingesta de datos históricosSpot (Binance) y Polyscan/Pyth/Hype para alimentar el backtesting de los últimos 4 meses.
- Acumulación de 1 día de colecta en vivo en `criptobot_v3.sqlite` para calibrar spreads bid-ask reales y slippage en Polymarket.

---

### ⏳ FASE 3: Motor de Calibración Offline (`backtest_calibration.py`)
- Módulo parametrizable desde `calibration_config.json`.
- Implementación de split 80/20 train/test.
- Test binomial estricto ($p < 0.05$) sobre hipótesis H1-H4.
- Generación del archivo auto-mantenido `parametros_calibrados.json`.

---

### ⏳ FASE 4: Capa 3 - Oráculo Sincronizado en Vivo
- Proceso autónomo que lee `parametros_calibrados.json` + `precios_subyacente`.
- Escribe `oracle_state.json` cada hora en el segundo `:00:05` ET/Chile.
- Cero acoplamiento con la ejecución de disparos.

---

### ⏳ FASE 5: Capa 4 - Sniper HFT Multi-Disparo Engine
- Motor con cálculo de Valor Esperado ($\text{EV} \ge +0.15 \text{ USD}$).
- Capacidad para realizar **> 5 disparos por ciclo de 1 Hora** repartidos entre las 7 monedas.
- Cooldown estricto de **3 minutos** entre disparos por moneda.
- Límite de exposición máxima por moneda ($5.00 USD) y seguro asimétrico subordinado a posición principal previa.

---

### ⏳ FASE 6 & 7: Dashboard Read-Only & Prueba Piloto con Micro-Capital
- Dashboard en puerto 8506 exclusivo para lectura e insumos visuales.
- Ejecución de 5 a 10 disparos de prueba con capital controlado ($1.00 USD) tras autorización previa del usuario.

---

## 🔒 ARQUITECTURA DE SEGURIDAD FÍSICA

1. **Estado OFF Garantizado:** El sistema no enviará ninguna orden `LIVE` mientras `LIVE_FIRING_ENABLED` se mantenga en `false`.
2. **Desacoplamiento Total:** Cada capa opera de forma independiente usando contratos JSON y SQLite en el VPS.
3. **Migrabilidad:** Diseñado para correr en VPS Linux local sin dependencias propietarias, listo para migración a AWS en EE.UU.

