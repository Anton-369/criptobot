# 📊 Estudio Estratégico y Análisis Cuantitativo: BNB (Binance Coin)

> [!NOTE]
> Documento reservado para la futura activación del activo **BNB** en el bot de latencia Criptobot v2.0.

---

## 1. Perfil de Liquidez y Spread en Polymarket

- **Spread Típico Ask/Bid**: $0.05 - $0.08 (moderado).
- **Profundidad del Libro**: ~$100 USD en el nivel top of book (suficiente para órdenes de $1.50 - $2.00 USD).
- **Ventana de Lag**: 15 a 45 segundos de retraso en la reacción de Polymarket frente a despegues en Binance Spot.

---

## 2. Dinámica de Precios y Beta Macro

- **Correlación con BTC**: Muy alta (Beta ~0.85). Rara vez realiza movimientos solitarios de gran magnitud.
- **Rango de Volatilidad Horario**: 0.34% promedio (estable, bajo nivel de falsos despegues).

---

## 3. Regla de Estrategia Propuesta: `BNB_MACRO_SYNC`

Para activar compras reales en BNB en el futuro, se deberán cumplir las siguientes condiciones:
1. **Doble Confirmación Macro**: BTC y ETH deben mostrar la misma dirección (UP/UP o DOWN/DOWN).
2. **Impulso de BNB**: Variación spot de BNB $\ge \pm 0.20\%$.
3. **Cuotas Descontadas**: Cuota Polymarket entre $\$0.25$ y $\$0.45$.
4. **Ventana de Tiempo**: Minutos 01-10 (Apertura) o Minutos 12-25 (Bala Principal).
