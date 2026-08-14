#!/usr/bin/env python3
"""
Analiza los CSV descargados por descargar_historial_binance.py y testea,
con una muestra grande (miles de velas), dos hipotesis:

  A) Reversion tras rachas: despues de N ciclos DOWN seguidos, aumenta
     la probabilidad de UP en el siguiente ciclo? (o es ruido tipo moneda al aire)

  B) Lead-lag: el movimiento de BTC/ETH en la primera mitad de una vela de 1h
     predice el resultado final de esa misma vela en las altcoins?

Cada resultado se acompana de un test binomial de significancia, para
distinguir patron real de ruido estadistico (a diferencia del analisis
anterior sobre 68 filas).

Uso:
    python3 analizar_lead_lag.py

Salida:
    Imprime un resumen en la terminal Y lo guarda en ./data/resumen_analisis.txt
    (ese archivo si es liviano, ese es el que subes a la conversacion)
"""

import pandas as pd
import numpy as np
from scipy import stats
import sys

OUT_LINES = []


def log(msg=""):
    print(msg)
    OUT_LINES.append(str(msg))


def cargar(path):
    try:
        df = pd.read_csv(path)
        df["open_time"] = pd.to_datetime(df["open_time"], format="mixed", errors="coerce")
        df = df.dropna(subset=["open_time"])
        return df
    except FileNotFoundError:
        log(f"ERROR: no encontre {path}. Corre primero descargar_historial_binance.py")
        sys.exit(1)


def test_binomial(aciertos, total, p_nulo=0.5):
    """Retorna el p-value de que 'aciertos' de 'total' sea distinguible de p_nulo (moneda justa)."""
    if total == 0:
        return None
    result = stats.binomtest(aciertos, total, p_nulo, alternative="two-sided")
    return result.pvalue


def analizar_rachas(df_1h, symbol, max_racha=4):
    """Hipotesis A: tras N DOWN seguidos, que tan seguido el siguiente es UP?"""
    sub = df_1h[df_1h["symbol"] == symbol].sort_values("open_time").reset_index(drop=True)
    directions = sub["direction"].tolist()

    log(f"\n--- {symbol}: reversion tras rachas DOWN ---")
    for racha in range(1, max_racha + 1):
        casos_up = 0
        casos_total = 0
        for i in range(racha, len(directions)):
            # revisar si los 'racha' anteriores fueron todos DOWN
            if all(d == "DOWN" for d in directions[i - racha:i]):
                casos_total += 1
                if directions[i] == "UP":
                    casos_up += 1
        if casos_total >= 10:
            rate = casos_up / casos_total
            pval = test_binomial(casos_up, casos_total)
            sig = "SIGNIFICATIVO (p<0.05)" if pval is not None and pval < 0.05 else "no significativo (ruido probable)"
            log(f"  Tras {racha} DOWN seguidos: siguiente fue UP en {casos_up}/{casos_total} ({rate:.1%}) -> p={pval:.4f} -> {sig}")
        else:
            log(f"  Tras {racha} DOWN seguidos: muestra insuficiente ({casos_total} casos, se necesitan 10+)")


def analizar_lead_lag(df_15m, symbol_lider, symbol_seguidor):
    """
    Hipotesis B: el movimiento del lider en el primer cuarto de hora (15m)
    predice la direccion del seguidor en esa misma hora (agregando los 15m
    que caen en la misma ventana horaria)?
    """
    lider = df_15m[df_15m["symbol"] == symbol_lider].sort_values("open_time").reset_index(drop=True)
    seguidor = df_15m[df_15m["symbol"] == symbol_seguidor].sort_values("open_time").reset_index(drop=True)

    lider = lider.set_index(pd.DatetimeIndex(lider["open_time"]))
    seguidor = seguidor.set_index(pd.DatetimeIndex(seguidor["open_time"]))

    # agrupar por hora: tomar el primer bloque de 15m de cada hora como "senal temprana"
    lider["hora"] = lider.index.floor("h")
    seguidor["hora"] = seguidor.index.floor("h")

    primer_bloque_lider = lider.groupby("hora").first()  # primeros 15 min de cada hora
    # resultado final de la hora para el seguidor: comparar close del ultimo bloque vs open del primero
    seguidor_agg = seguidor.groupby("hora").agg(open_hora=("open", "first"), close_hora=("close", "last"))
    seguidor_agg["direction_hora"] = np.where(seguidor_agg["close_hora"] >= seguidor_agg["open_hora"], "UP", "DOWN")

    merged = primer_bloque_lider[["direction"]].rename(columns={"direction": "lider_15m"}).join(
        seguidor_agg[["direction_hora"]], how="inner"
    )

    log(f"\n--- Lead-lag: {symbol_lider} (primeros 15min) -> {symbol_seguidor} (resultado de la hora) ---")
    for lider_dir in ["UP", "DOWN"]:
        subset = merged[merged["lider_15m"] == lider_dir]
        total = len(subset)
        if total < 10:
            log(f"  {symbol_lider} primeros15min={lider_dir}: muestra insuficiente ({total} casos)")
            continue
        aciertos = (subset["direction_hora"] == lider_dir).sum()
        rate = aciertos / total
        pval = test_binomial(aciertos, total)
        sig = "SIGNIFICATIVO (p<0.05)" if pval is not None and pval < 0.05 else "no significativo (ruido probable)"
        log(f"  {symbol_lider} primeros15min={lider_dir} -> {symbol_seguidor} termina igual en {aciertos}/{total} ({rate:.1%}) -> p={pval:.4f} -> {sig}")


def main():
    log("=" * 70)
    log("ANALISIS DE LEAD-LAG Y REVERSION -- muestra grande (no 68 filas)")
    log("=" * 70)

    df_1h = cargar("./data/klines_1h.csv")
    df_15m = cargar("./data/klines_15m.csv")

    altcoins = ["XRPUSDT", "SOLUSDT", "DOGEUSDT", "BNBUSDT"]

    log("\n" + "#" * 70)
    log("# HIPOTESIS A: reversion tras rachas (por moneda, standalone)")
    log("#" * 70)
    for coin in altcoins:
        analizar_rachas(df_1h, coin)

    log("\n" + "#" * 70)
    log("# HIPOTESIS B: BTC/ETH lideran a las altcoins con retraso?")
    log("#" * 70)
    for lider in ["BTCUSDT", "ETHUSDT"]:
        for seguidor in altcoins:
            analizar_lead_lag(df_15m, lider, seguidor)

    with open("./data/resumen_analisis.txt", "w") as f:
        f.write("\n".join(OUT_LINES))

    log("\n\nResumen guardado en ./data/resumen_analisis.txt -- ese archivo es liviano, subelo a la conversacion.")


if __name__ == "__main__":
    main()
