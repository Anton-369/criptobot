# 📊 REPORTE DIARIO CUANTITATIVO OFICIAL: ENGINE CRIPTOBOT V4 (AUDITORÍA RIGUROSA DE HOY)
**Fecha de Evaluación:** 20 de Agosto de 2026 (00:00 a 16:00 ET)  
**Modo de Operación:** SHADOW Execution (Validación Real Tick a Tick en VPS)  
**Base de Datos Primaria:** `/home/anton/criptobot/data/criptobot_v4.sqlite`  
**Cumplimiento de Estándar:** REGLA DE RIGOR OBLIGATORIA (Muestra $n$ explícita, PnL real en USD, fórmulas sin redondeo y código reproducible).

---

## 1. 🚨 REGLAS MATEMÁTICAS DE EVALUACIÓN APLICADAS

1. **Muestra Explícita ($n$):** Todas las tasas de acierto indican la muestra $n$ de operaciones cerradas de hoy.
2. **Criterio Estricto de Rentabilidad:** Una estrategia solo se declara "RENTABLE" si su Win Rate es mayor que su Break-Even WR ($\text{Win Rate} > \text{BE WR}$) Y su PnL acumulado en USD es positivo.
3. **Fórmula de Win Rate:**
   $$\text{Win Rate (\%)} = \left( \frac{\text{Wins}}{n} \right) \times 100$$
4. **Fórmula de Break-Even Win Rate:**
   $$\text{Break-Even WR (\%)} = \left( \frac{\text{Precio Entrada Promedio}}{\$1.000} \right) \times 100$$
5. **Visibilidad del Peor Caso:** Se reporta explícitamente el peor activo/timeframe del día (HYPE 5M).

---

## 2. 📉 ANÁLISIS DEL PEOR CASO DE HOY (DESTRUCTOR DE EFICIENCIA)

### 🔴 HYPE 5M — Peor Rendimiento de la Jornada
* **Muestra de Hoy ($n$):** 6 operaciones (IDs #40, #41, #42, #43, #51, #53)
* **Wins:** 3 | **Losses:** 3
* **Win Rate Actual:** **50.00%**
* **Precio Entrada Promedio:** **$0.5967 USD**
* **Win Rate Exigido (Break-Even):** **59.67%**
* **Déficit de Acierto:** **`-9.67%` por debajo del Break-Even**
* **PnL Neto en USD:** **`+$0.8000 USD`**
* **Evaluación:** **🔴 DEFICITARIO / INEFICIENTE** *(Aunque el PnL bruto dio positive por el Payout de compras baratas a $0.53, la tasa de acierto del 50.00% no supera el 59.67% requerido).*

---

## 3. 📊 CONCILIACIÓN GENERAL DE HOY POR TIMEFRAME

| Timeframe | Muestra ($n$) | Wins | Losses | Win Rate Actual (%) | Entrada Prom. | Break-Even WR (%) | PnL Neto (USD) | Evaluación Cuantitativa |
|---|---|---|---|---|---|---|---|---|
| **15M** | 13 | 13 | 0 | **100.00%** | `$0.6346` | `63.46%` | **+$4.7500** | 🟢 **RENTABLE (100% Effective)** |
| **5M** | 12 | 9 | 3 | **75.00%** | `$0.6092` | `60.92%` | **+$3.0700** | 🟢 **RENTABLE (Supera el BE)** |
| **TOTAL** | **25** | **22** | **3** | **88.00%** | **$0.6224** | **62.24%** | **+$7.8200** | 🟢 **RENTABLE (Supera BE por +25.76%)** |

---

## 4. 📋 TABLA RIGUROSA DE CONCILIACIÓN COMPLETA DE HOY (MONEDA × TIMEFRAME)

| Moneda | Timeframe | Muestra ($n$) | Wins | Losses | Win Rate (%) | Entrada Prom. | Break-Even WR (%) | PnL Neto (USD) | Estado Real |
|---|---|---|---|---|---|---|---|---|---|
| **XRP** | **15M** | 9 | 9 | 0 | **100.00%** | `$0.6433` | `64.33%` | **+$3.2100** | 🟢 **RENTABLE** |
| **XRP** | **5M** | 3 | 3 | 0 | **100.00%** | `$0.6333` | `63.33%` | **+$1.1000** | 🟢 **RENTABLE** |
| **BNB** | **5M** | 2 | 2 | 0 | **100.00%** | `$0.5900` | `59.00%` | **+$0.8200** | 🟢 **RENTABLE** |
| **HYPE** | **15M** | 2 | 2 | 0 | **100.00%** | `$0.6050` | `60.50%` | **+$0.7900** | 🟢 **RENTABLE** |
| **BNB** | **15M** | 2 | 2 | 0 | **100.00%** | `$0.6250` | `62.50%` | **+$0.7500** | 🟢 **RENTABLE** |
| **DOGE** | **5M** | 1 | 1 | 0 | **100.00%** | `$0.6500` | `65.00%` | **+$0.3500** | 🟢 **RENTABLE** |
| **HYPE** | **5M** | 6 | 3 | 3 | **50.00%** | `$0.5967` | `59.67%` | **+$0.8000** | 🔴 **DEFICITARIO (WR < BE)** |

---

## 5. 💻 CÓDIGO PYTHON Y CONSULTA SQL REPRODUCIBLE (HOY 20 DE AGOSTO)

```python
import sqlite3
import pandas as pd

conn = sqlite3.connect('/home/anton/criptobot/data/criptobot_v4.sqlite')

sql = """
SELECT id, coin, timeframe, side, price_entry, price_exit, status 
FROM v4_positions 
WHERE status IN ('CLOSED_TP', 'CLOSED_SL', 'CLOSED_EXPIRED')
  AND (opened_at LIKE '2026-08-20%' OR closed_at LIKE '2026-08-20%');
"""
df = pd.read_sql_query(sql, conn)
df['price_entry'] = pd.to_numeric(df['price_entry'])
df['price_exit'] = pd.to_numeric(df['price_exit'])

def calc_pnl(row):
    pe, px, st = row['price_entry'], row['price_exit'], row['status']
    if st == 'CLOSED_TP': return 1.00 - pe
    if st == 'CLOSED_SL': return (px - pe) if (pd.notnull(px) and px > 0 and px < pe) else (0.00 - pe)
    return 0.0

df['pnl_usd'] = df.apply(calc_pnl, axis=1)

report = df.groupby(['coin', 'timeframe']).agg(
    n=('id', 'count'),
    wins=('status', lambda s: (s == 'CLOSED_TP').sum()),
    losses=('status', lambda s: (s == 'CLOSED_SL').sum()),
    winrate=('status', lambda s: (s == 'CLOSED_TP').mean() * 100),
    avg_entry=('price_entry', 'mean'),
    pnl_usd=('pnl_usd', 'sum')
).reset_index()

report['be_wr'] = report['avg_entry'] * 100
report['rentable'] = (report['pnl_usd'] > 0) & (report['winrate'] > report['be_wr'])
print(report.to_string(index=False))
```
