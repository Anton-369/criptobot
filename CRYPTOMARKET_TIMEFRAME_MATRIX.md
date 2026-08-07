# 📊 Matriz de Cruce de Mercado por Criptomoneda y Temporalidad (Criptobot)

> **Origen**: Análisis Forense de `criptobot.db` (+350,000 transacciones capturadas en VPS)  
> **Fecha**: 7 de Agosto, 2026  
> **Estado**: Documento Oficial de la Fase 1 (Investigación y Selección de Alfa)

---

## 📌 1. Matriz General de Volumen Total (Cripto vs. Timeframe en USDC)

Esta tabla representa el desglose cruzado de capital operado por las ballenas en Polymarket según activo cripto y temporalidad de mercado:

| Criptomoneda | 1 Hora (1h) | 4 Horas (4h) | Diario (1 Día) | Multidía / Rango | **VOLUMEN TOTAL (USDC)** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| 🥇 **Bitcoin (BTC)** | **$8,710,984.00** | $628,450.00 | $608,620.00 | $14,907.00 | **$9,962,961.00** |
| 🥈 **Ethereum (ETH)** | **$937,054.80** | $120,450.00 | $83,095.61 | $24,894.00 | **$1,165,494.41** |
| 🥉 **Solana (SOL)** | $60,498.86 | **$472,564.00** | $6,861.04 | $315.20 | **$540,239.10** |
| 🌐 **Ripple (XRP)** | $23,356.21 | $131,962.00 | $8,052.03 | $6,630.17 | **$170,000.41** |
| 📦 **Otras Criptos** | $0.00 | $0.00 | $134,324.82 | $4,754.32 | **$139,079.14** |
| 🟡 **Binance (BNB)** | $24,793.07 | $75,439.00 | $15,904.77 | $0.00 | **$116,136.84** |
| 💧 **Hyperliquid (HYPE)** | **$86,109.59** | $0.00 | $0.00 | $0.00 | **$86,109.59** |
| 🐕 **Dogecoin (DOGE)** | $10,634.78 | $43,682.89 | $0.00 | $0.00 | **$54,317.67** |

---

## 🔎 2. Descubrimientos de Selección de Alfas

1. **Hyperliquid (HYPE - 1 Hora)**:
   * Concentra el **100% de su volumen ($86,109.59 USDC)** en los mercados de **1 Hora (`HYPE Up or Down - 1h`)**.
   * Operado principalmente por un **Enjambre coordinado de 5 billeteras** que entran en la apertura (segundo 0:00) a cuota $0.500 USD.

2. **Solana (SOL - 4 Horas)**:
   * Concentra **$472,564.00 USDC** en las ventanas de **4 Horas**, superando por casi 8 veces su volumen de 1 hora.
   * Dominado por un grupo de ballenas especializadas (48% exclusivas de SOL) con operaciones unitarias promedio de mayor volumen ($55.92 USDC por bala).

3. **Bitcoin (BTC) y Ethereum (ETH)**:
   * Concentran volumen institucional masivo (>80% del mercado), pero sirven principalmente para monitoreo de niveles de soporte/resistencia y correlación spot.

---
*Criptobot — Módulo de Inteligencia de Mercado*
