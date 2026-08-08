# SISTEMA AUTORREGULADO HFT Y PÓLIZA DE SEGURO - CRIPTOBOT v2.0

## 📌 Resumen Ejecutivo
Este documento detalla la arquitectura, estrategias de trading y mecanismos de autorregulación del **Criptobot v2.0**, diseñado para ejecutar operaciones de alta frecuencia (HFT) sincronizando en tiempo real la acción de precio de **Binance Spot** con las ineficiencias del libro de órdenes (CLOB) de **Polymarket** en eventos de 1 hora para **XRP, SOL y DOGE**.

---

## 🏗️ Arquitectura del Sistema

```
┌───────────────────────────┐      ┌───────────────────────────┐
│   Binance WebSocket WS    │      │  Polymarket CLOB REST/WS  │
│    (Latencia < 15ms)      │      │     (Orderbook Odds)      │
└─────────────┬─────────────┘      └─────────────┬─────────────┘
              │                                  │
              └────────────────┬─────────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │   MomentumDetector Engine            │
            │ (Motor Autorregulado de 3 Capas)    │
            └──────────────────┬───────────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │   ExecutionEngine (Shadow / LIVE)    │
            │ + Póliza de Seguro Automática        │
            │ + Auto-Liquidación de Ciclos 1H      │
            └──────────────────┬───────────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │    Dashboard Telemetría (port 8505) │
            └──────────────────────────────────────┘
```

---

## 🎯 Estrategia "Francotirador Asimétrico" Unificada

1. **Ventana Operativa**: Operación activa continua desde el **Minuto :02 al Minuto :55** de cada ciclo horario.
2. **Umbrales Dinámicos de Impulso por Activo**:
   - **XRP**: Variación Binance Spot $\ge \pm0.25\%$
   - **SOL**: Variación Binance Spot $\ge \pm0.30\%$
   - **DOGE**: Variación Binance Spot $\ge \pm0.35\%$
3. **Zona Dorada de Compra con Descuento**:
   - Las órdenes en Polymarket solo se activan cuando las cuotas ofrecidas están en el rango desfasado de **$0.25 a $0.45** (descuento del 55% al 75% respecto al valor de liquidación $1.00).

---

## 🧠 Motor de Autorregulación de 3 Capas (Macro-Micro Alignment)

Para evitar operaciones imprecisas o pérdidas en mercados laterales, el sistema aplica un filtro dinámico antes de cada disparo:

### Capa 1: Filtro de Mercado Plano (Dead / Sideways Market)
- **Regla**: Si la variación de 1H en Binance es inferior a $\pm0.15\%$, el mercado se considera estancado.
- **Acción**: **Cero disparos direccionales**. Protege el capital en rangos aburridos o sin tendencia clara.

### Capa 2: Confirmación de Giro (Counter-Trend Reversal)
- **Regla**: Si el movimiento de 1H se opone a la tendencia de 24H (ejemplo: 24H cayendo pero 1H subiendo), se exige un súper impulso en Binance de $\ge \pm0.65\%$ en 1H.
- **Acción**: Previene caer en "trampas de toros" o falsos rebotes dentro de tendencias bajistas mayores.

### Capa 3: Alineación con la Marea Macro (Macro 24H Alignment)
- **Regla**: Si la dirección de 1H y la tendencia de 24H coinciden (ambas en verde o ambas en rojo), se aplica el umbral base ($\ge 0.25\% - 0.35\%$).
- **Acción**: Permite entrar con soltura cuando el mercado principal empuja a nuestro favor.

---

## 🛡️ Póliza de Seguro Automática (Risk-Free Arbitrage)

- **Gatillo**: Si la cuota del lado opuesto de una posición abierta cae al rango regalado de **$0.12 a $0.22**.
- **Tamaño de Bala**: Bala reducida de **$0.66 USD** (1/3 del tamaño estándar).
- **Efecto Matemático**: Tranca un pago garantizado de $3.00+ al vencimiento, cubriendo el 100% de la inversión inicial y asegurando una ganancia neta positiva sin importar el resultado final del mercado.

---

## 🧹 Gestión del Ciclo de Vida de Posiciones
- **Auto-Liquidación Horaria**: Al cambiar el reloj a la top de la hora (:00), el motor purga automáticamente las posiciones SHADOW de horas anteriores (> 60 minutos), manteniendo la base de datos y el Dashboard limpios.
- **Reconciliación Real**: Los saldos USDC y POL/MATIC se leen en tiempo real vía RPC desde la blockchain de Polygon y la API oficial de Polymarket.

---
*Documento generado automáticamente y actualizado en el repositorio Criptobot v2.0.*
