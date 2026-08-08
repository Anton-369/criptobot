# ARQUITECTURA MAESTRA Y ROADMAP: HIGH-FREQUENCY LATENCY SNIPER BOT (CRIPTOBOT)

**Proyecto:** Criptobot HFT Engine  
**Versión:** 2.0 (Post-Auditoría Forense)  
**Autor:** Antigravity AI & Anton  
**Estado:** Especificación Técnica de Producción  
**Objetivo Capital:** 6 Balas de $2.00 USDC ($12.00 USDC Total Balance)  

---

## 1. Lecciones Aprendidas y Lecciones de Cero-Error (Anti-Washybot / Anti-Tenybot)

Para garantizar que el bot funcione en **LIVE exactamente igual que en SHADOW**, prohibimos los 4 errores del pasado:

| Error en Bots Anteriores | Solución de Hierro en Criptobot v2 |
| :--- | :--- |
| **Dependencia de la BD Local para Estado**: Guardar estados en SQLite causaba desincronización con la blockchain si una orden fallaba. | **Cero BD para Decisiones**: La BD local es 100% pasiva (solo log de historial). Las decisiones de ejecución se toman leyendo en vivo la API de Polymarket (`getOpenOrders`, `getTrades`) y el WebSocket de Binance. |
| **Falsa Liquidez (Slippage Negativo)**: Comprar a mercado terminaba pagando cuotas infladas. | **Órdenes Límite FOK (Fill-Or-Kill)**: Único tipo de orden permitida. Si a $0.35 no está la liquidez exacta de $2.00 USD, la orden se cancela sola a nivel de protocolo sin gastar nada. |
| **Copy Trading con Retardo**: Intentar copiar a una ballena llegaba tarde al desfasaje. | **Arbitraje de Latencia Directo en Spot**: No copiamos ballenas; leemos directamente el precio de Binance Spot y disparamos antes que el mercado de 1H en Polymarket despierte. |
| **Desincronización de Balance**: El bot intentaba enviar órdenes sin confirmar el saldo real de USDC en Polygon. | **Reconciliación Directa de Saldo**: Verificación en tiempo real del saldo disponible en el Proxy Wallet antes de autorizar cualquier bala. |

---

## 2. Matriz Operativa por Moneda (XRP, SOL, DOGE)

### 🔹 Moneda 1: XRP (Estrategia: Francotirador Scalper)
* **Ventana Temporal**: **Minutos 15 a 28** del ciclo de 1 Hora.
* **Rango de Cuota Entrada**: **$0.31 a $0.42** (Descuento del 58% al 69%).
* **Condición Binance Spot**: `Precio_Spot_Actual > Precio_Apertura_Ciclo` (+0.05% mínimo).
* **Gestión de Salida**: 
  * *Ruta A (Scalping)*: Re-venta en el libro con Limit Sell a **$0.65 - $0.85** (+50% a +100% ROI rápido en 2-5 min).
  * *Ruta B (Oráculo)*: Si la volatilidad es limpia, sostener hasta expiración de $1.00 USD.

### 🔹 Moneda 2: SOL (Estrategia: Cobertura Asimétrica 75/25)
* **Ventana Temporal**: **Minutos 33 a 43** del ciclo de 1 Hora.
* **Rango de Cuota Entrada**: **$0.15 a $0.30** (Lado desfavorecido/seguro) y **$0.40 a $0.45** (Lado dominante).
* **Condición Binance Spot**: Desviación acumulada >0.15% en el precio spot.
* **Mecanismo Dual**:
  * 75% del capital ($1.50 USD) asignado al lado dominante con tendencia spot en Binance.
  * 25% del capital ($0.50 USD) asignado al lado secundario como póliza de seguro barata a $0.15 - $0.25.
* **Gestión de Salida**: 100% Hold to Oracle ($1.00 USD settlement).

### 🔹 Moneda 3: DOGE (Estrategia: Cazador Tardío de 1 Minuto)
* **Ventana Temporal**: **Minutos 33 a 58** del ciclo de 1 Hora (Libros desiertos en la primera media hora).
* **Rango de Cuota Entrada**: **$0.20 a $0.35** (En la segunda mitad del ciclo).
* **Condición Binance Spot**: Desviación limpia del precio spot respecto a la apertura (Distance-to-Strike).
* **Gestión de Salida**: Hold to Oracle o Re-venta instantánea en pico de liquidez.

---

## 3. Arquitectura del Sistema (TypeScript / Node.js)

```
criptobot/
├── src/
│   ├── config/
│   │   └── environment.ts        # Variables de entorno y llaves Polygon
│   ├── connectors/
│   │   ├── BinanceWebsocket.ts   # Conexión ultra-rápida (wss://stream.binance.com)
│   │   └── PolymarketClob.ts     # Wrapper oficial @polymarket/clob-client
│   ├── engine/
│   │   ├── LatencyDetector.ts    # Comparador en vivo: Spot vs. Odds en 1H
│   │   ├── BulletManager.ts      # Control estricto del banco (6 balas de $2 USD)
│   │   └── ExecutionEngine.ts    # Generador de órdenes Límite FOK
│   ├── storage/
│   │   └── AuditLogger.ts        # Log pasivo en SQLite (Cero influencia en ejecuciones)
│   └── index.ts                  # Punto de entrada principal (Async Event Loop)
```

---

## 4. Roadmap de Implementación (Paso a Paso)

### 🗓️ Fase 1: Motor Conector y Stream de Binance (Día 1)
- Implementar `BinanceWebsocket.ts` monitoreando `XRPUSDT`, `SOLUSDT` y `DOGEUSDT` en tiempo real.
- Calcular el precio de apertura de la vela de 1 Hora y el delta en tiempo real (`spot_price - open_price`).

### 🗓️ Fase 2: Monitor de Latencia Polymarket (Día 2)
- Conectar con el libro de órdenes en vivo de Polymarket para los mercados de 1H activos.
- Detectar cuotas desfasadas ($0.15 a $0.42) en presencia de una tendencia en Binance Spot.

### 🗓️ Fase 3: Módulo de Ejecución FOK y Prueba Shadow (Días 3 - 4)
- Desarrollar `ExecutionEngine.ts` configurado para órdenes `FOK` de $2.00 USDC.
- Correr el bot durante **24 horas continuas en MODO SHADOW** registrando cada oportunidad, fill teórico y PnL simulado.

### 🗓️ Fase 4: Despliegue LIVE con 6 Balas ($12.00 USDC) (Día 5)
- Activar el bot en modo **LIVE en VPS** con la primera bala de $2.00 USDC.
- Verificar la latencia de ejecución final en la blockchain de Polygon y validar el llenado a precio exacto.
