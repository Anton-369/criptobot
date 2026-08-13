# HALLAZGO CUANTITATIVO CLAVE: DOMINANCIA DE INERCIA ($\beta_2$) Y CONTINUIDAD DE MOMENTUM
## Criptobot v3.0 — Análisis de Coeficientes del Modelo Logit

**Fecha de Registro:** 13 de Agosto de 2026  
**Repositorio GitHub:** `github.com/Anton-369/criptobot`  

---

## 1. RESUMEN DEL HALLAZGO

La calibración del Modelo Logit sobre 6 meses de datos fuera de muestra (3,572 folds) reveló una propiedad estructural decisiva sobre la microestructura de 1 hora en cripto:

88362\frac{\beta_2 (\Delta \text{spot}_{15m})}{\beta_1 (\text{racha\_down})} \approx 12\times - 23\times88362

| Moneda | $\beta_0$ (Intercepto) | $\beta_1$ (Racha DOWN) | $\beta_2$ ($\Delta \text{spot}_{15m}$) | Dominancia $\beta_2 / \beta_1$ |
| :--- | :---: | :---: | :---: | :---: |
| **XRPUSDT** | -0.0194 | 0.0955 | 1.1516 | **12.06x** |
| **SOLUSDT** | 0.0367 | 0.0882 | 1.1316 | **12.83x** |
| **DOGEUSDT** | 0.0193 | 0.0577 | 1.3171 | **22.84x** |
| **BNBUSDT** | 0.0818 | 0.0844 | 1.1748 | **13.92x** |

---

## 2. IMPLICANCIA ESTRATÉGICA DE NEGOCIO

1. **Continuidad de Momentum vs. Rebote Elástico:**  
   El modelo estadístico **NO favorece la reversión a la media (rebote elástico)** en los primeros 15 minutos. Por el contrario, demuestra que el movimiento inicial del spot en los primeros 15 min de la hora tiende a **sostenerse y continuar** durante el resto de la vela (67.2% - 68.9% OOS Accuracy).

2. **Invalidez de Comprar el Lado Perdedor (Opción Barata):**  
   Comprar una cuota barata ($$0.25 - $0.35$) en min 15 cuando el spot va perdiendo equivale a apostar contra la inercia dominante del mercado.

3. **Dirección Futura para el Bot:**  
   El bot debe operar como un **Francotirador de Continuidad de Impulso (Momentum Sniper)**: comprar la dirección del impulso ganador cuando la cuota en Polymarket aún no refleja el movimiento del spot de Binance ($\text{Score}_{\text{UP}} \gg \text{yes\_price}$).

