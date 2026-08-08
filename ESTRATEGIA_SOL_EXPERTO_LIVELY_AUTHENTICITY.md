# INFORME TÉCNICO: ESTRATEGIA DEL EXPERTO EN SOLANA (`Lively-Authenticity`)

**Billetera Auditada:** `0xb55fa1296e6ec55d0ce53d93b9237389f11764d4`  
**Pseudónimo Polymarket:** `Lively-Authenticity`  
**Fecha de Auditoría:** 7 de Agosto, 2026  
**Origen de Datos:** Polymarket Data API & `criptobot.db`  

---

## 1. Perfil Operativo y Métricas Clave

* **Dominancia de Mercado**: Opera en más del **70% de los ciclos de 1 hora de Solana (SOL)** y frecuenta ciclos de 15m/1h en BTC y ETH.
* **Win Rate Directivo**: **88.1%** de efectividad en los mercados analizados (37 aciertos en 42 mercados).
* **Comportamiento de Salida**: **100% Hold to Oracle** (208 de 208 trades en SOL fueron `BUY` sin re-venta manual en el libro; sostiene las posiciones hasta el settlement de $1.00 USD).
* **Capital Invertido por Mercado**: **$50 a $250 USDC** en promedio por ciclo, divididos en micro-compras fraccionadas de $5 a $20 USD.

---

## 2. Los 3 Pilares de la Estrategia "Weighted Asymmetric Hedging"

### Pilar 1: Cobertura Asimétrica Ponderada (75% / 25%)
A diferencia de un creador de mercado simétrico (50/50), `Lively-Authenticity` combina **análisis de tendencia spot** con **pólizas de seguro a descuento**:
1. Identifica el sesgo direccional en Binance Spot y asigna el **75% del capital** al lado dominante (ej. `UP`).
2. Espera a que el lado desfavorecido (`DOWN`) sufra un desfasaje extremo y caiga a **$0.15 - $0.30**.
3. Asigna el **25% restante del capital** a comprar acciones `DOWN` tiradas de precio como **cobertura contra giros inesperados**.

### Pilar 2: Ventana Dorada de Ejecución (Minuto 33 al 43)
Debido a la **Aceleración Gamma** (curva sigmoide) en los contratos binarios a falta de 15-25 minutos para el vencimiento:
* En Solana, entre el **minuto 33 y 43**, pequeñas variaciones de ±0.30% a ±0.50% en Binance Spot provocan que las cuotas de Polymarket se sobre-descuenten a **$0.15 - $0.35**.
* El bot dispara secuencialmente sus ordenes en esa ventana precisa de 10 minutos.

### Pilar 3: Estructura de Posicionamiento Win-Win (Costo Par < $0.75)
Al capturar el lado secundario a precios promedio de $0.20 - $0.30 y el lado principal a $0.40 - $0.45, el bot logra un **costo par combinado de $0.65 a $0.75 USD**.
* **Escenario A (Gana el favorito)**: Cobro de $1.00 por el 75% del capital $\rightarrow$ **Retorno Neto: +40% a +70% ROI**.
* **Escenario B (Giro inesperado de última hora)**: El 25% comprado a 20 centavos paga $1.00 por acción $\rightarrow$ **Cubre el 100% del capital inicial, eliminando la pérdida**.

---

## 3. Algoritmo de Implementación para Criptobot

```typescript
// Lógica de Cobertura Asimétrica Ponderada en Criptobot
interface SolHedgingConfig {
  minCycleMinute: 33;
  maxCycleMinute: 43;
  maxPairCostUSDC: 0.75;
  primaryAllocationPct: 0.75; // 75% al lado dominante
  hedgeAllocationPct: 0.25;   // 25% a la cobertura barata
  discountPriceThreshold: 0.30;
}

function evaluateSolEntry(spotMomentum: number, polyOdds: { up: number, down: number }) {
  if (polyOdds.down <= 0.30) {
    // Disparar Cobertura Barata en DOWN
    executeBullet('DOWN', polyOdds.down, hedgeAllocation);
  }
  if (polyOdds.up <= 0.45 && spotMomentum > 0) {
    // Disparar Lado Dominante en UP
    executeBullet('UP', polyOdds.up, primaryAllocation);
  }
}
```
