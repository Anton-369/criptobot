#!/usr/bin/env python3
"""
ETAPA 1 -- Calibracion de Score_UP usando SOLO historico de Binance
(no necesita datos de Polymarket, por eso se puede correr hoy mismo).

Features usadas (las 2 que no dependen de yes_price):
  - racha_down: cuantos ciclos de 1h seguidos termino DOWN justo antes del ciclo a predecir
  - delta_spot_temprano: % de variacion del precio en los primeros 15 min de la hora en curso
    (esto es un proxy honesto de "Delta Spot 1m" para datos historicos de vela horaria;
     en produccion vivo se recalcula cada 1m con datos reales de mas resolucion)

Target:
  - direction: UP/DOWN real de esa hora (close vs open)

Metodologia:
  - Walk-forward de ventana expandible: para cada punto T, entrena con [0..T-1],
    evalua SOLO en T (fuera de muestra), avanza T+1. Nunca usa el futuro para entrenar.
  - Guarda los pesos beta de la ULTIMA ventana (los mas actualizados) en
    parametros_calibrados.json, junto con las metricas honestas fuera de muestra
    acumuladas de TODO el walk-forward (no solo la ultima ventana).

Uso:
    pip install scikit-learn --break-system-packages   (si no lo tienes)
    python3 calibrar_etapa1.py

Salida:
    ./data/parametros_calibrados.json
    ./data/resumen_calibracion.txt
"""

import json
import sys
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

MIN_FOLDS_PARA_CONFIAR = 200  # advertencia si hay menos folds out-of-sample que esto
COINS = ["XRPUSDT", "SOLUSDT", "DOGEUSDT", "BNBUSDT"]

OUT_LINES = []


def log(msg=""):
    print(msg)
    OUT_LINES.append(str(msg))


def cargar(path):
    try:
        df = pd.read_csv(path)
        df["open_time"] = pd.to_datetime(df["open_time"], errors="coerce")
        antes = len(df)
        df = df.dropna(subset=["open_time"])
        despues = len(df)
        if despues < antes:
            log(f"  [aviso] {path}: se descartaron {antes - despues} filas con fecha invalida")
        if despues == 0:
            log(f"  [ERROR] {path}: 0 filas validas. Revisa con: head -3 {path}")
            sys.exit(1)
        return df.sort_values("open_time").reset_index(drop=True)
    except FileNotFoundError:
        log(f"ERROR: no encontre {path}. Corre primero descargar_historial_binance.py")
        sys.exit(1)


def construir_features(df_1h: pd.DataFrame, df_15m: pd.DataFrame, coin: str) -> pd.DataFrame:
    """
    Para cada ciclo de 1h de 'coin', construye:
      - racha_down: rachas DOWN consecutivas terminadas ANTES de este ciclo (sin mirar el futuro)
      - delta_spot_temprano: variacion % en el primer bloque de 15m de ESTE ciclo
        (esto SI es informacion disponible en el momento de decidir, no es look-ahead:
         en vivo, a los 15 min de la hora ya sabes este dato)
      - target: direction real del ciclo completo (lo que queremos predecir)
    """
    sub1h = df_1h[df_1h["symbol"] == coin].sort_values("open_time").reset_index(drop=True)
    sub15 = df_15m[df_15m["symbol"] == coin].sort_values("open_time").reset_index(drop=True)
    sub15 = sub15.set_index(pd.DatetimeIndex(sub15["open_time"]))
    sub15["hora"] = sub15.index.floor("h")
    primer_bloque = sub15.groupby("hora").first()  # primeros 15m de cada hora

    directions = sub1h["direction"].tolist()
    rows = []
    for i in range(len(sub1h)):
        hora_actual = sub1h.loc[i, "open_time"]

        # racha_down: contar DOWN consecutivos en los ciclos ANTERIORES a i (no incluye i)
        racha = 0
        j = i - 1
        while j >= 0 and directions[j] == "DOWN":
            racha += 1
            j -= 1

        # delta_spot_temprano: variacion % en los primeros 15 min de ESTE ciclo (i)
        if hora_actual in primer_bloque.index:
            o = primer_bloque.loc[hora_actual, "open"]
            c = primer_bloque.loc[hora_actual, "close"]
            delta_temprano = (float(c) - float(o)) / float(o) * 100
        else:
            delta_temprano = np.nan

        rows.append({
            "open_time": hora_actual,
            "racha_down": racha,
            "delta_spot_temprano": delta_temprano,
            "target_up": 1 if directions[i] == "UP" else 0,
        })

    return pd.DataFrame(rows).dropna()


def walk_forward(df_feat: pd.DataFrame, min_train=100):
    """
    Ventana expandible: entrena con [0..T-1], predice SOLO T, avanza.
    Devuelve: lista de (y_real, prob_predicha) fuera de muestra, y el ultimo modelo ajustado.
    """
    X = df_feat[["racha_down", "delta_spot_temprano"]].values
    y = df_feat["target_up"].values

    resultados_oos = []
    ultimo_modelo = None
    ultima_media = None
    ultima_std = None

    for T in range(min_train, len(df_feat)):
        X_train, y_train = X[:T], y[:T]
        X_test, y_test = X[T:T + 1], y[T:T + 1]

        # normalizar (z-score) usando SOLO estadisticas de train, para no filtrar info del futuro
        media = X_train.mean(axis=0)
        std = X_train.std(axis=0)
        std[std == 0] = 1.0
        X_train_norm = (X_train - media) / std
        X_test_norm = (X_test - media) / std

        if len(np.unique(y_train)) < 2:
            continue  # no se puede entrenar logistic regression con una sola clase

        modelo = LogisticRegression()
        modelo.fit(X_train_norm, y_train)
        prob_up = modelo.predict_proba(X_test_norm)[0, 1]

        resultados_oos.append((y_test[0], prob_up))
        ultimo_modelo = modelo
        ultima_media = media
        ultima_std = std

    return resultados_oos, ultimo_modelo, ultima_media, ultima_std


def evaluar_oos(resultados_oos, coin):
    if not resultados_oos:
        log(f"  {coin}: sin resultados fuera de muestra (muy pocos datos)")
        return

    y_real = np.array([r[0] for r in resultados_oos])
    y_prob = np.array([r[1] for r in resultados_oos])
    y_pred = (y_prob >= 0.5).astype(int)

    accuracy = (y_pred == y_real).mean()
    n = len(resultados_oos)

    # log-loss simple, manual, evitando log(0)
    eps = 1e-9
    logloss = -np.mean(y_real * np.log(y_prob + eps) + (1 - y_real) * np.log(1 - y_prob + eps))

    aviso = "" if n >= MIN_FOLDS_PARA_CONFIAR else f"  <-- ADVERTENCIA: solo {n} folds, se recomiendan {MIN_FOLDS_PARA_CONFIAR}+ antes de confiar en esto"

    log(f"  {coin}: {n} folds fuera de muestra | accuracy={accuracy:.1%} | log-loss={logloss:.4f}{aviso}")
    return {"n_folds": n, "accuracy": float(accuracy), "logloss": float(logloss)}


def main():
    log("=" * 70)
    log("CALIBRACION ETAPA 1 -- Score_UP desde historico de Binance")
    log("(walk-forward de ventana expandible, sin mirar el futuro)")
    log("=" * 70)

    df_1h = cargar("./data/klines_1h.csv")
    df_15m = cargar("./data/klines_15m.csv")

    parametros = {"generado": datetime.utcnow().isoformat() + "Z", "coins": {}}

    for coin in COINS:
        log(f"\n--- {coin} ---")
        df_feat = construir_features(df_1h, df_15m, coin)
        log(f"  {len(df_feat)} ciclos disponibles con features completas")

        if len(df_feat) < 150:
            log(f"  [omitido] muy pocos datos para walk-forward confiable")
            continue

        resultados_oos, modelo, media, std = walk_forward(df_feat, min_train=100)
        metricas = evaluar_oos(resultados_oos, coin)

        if modelo is not None:
            parametros["coins"][coin] = {
                "beta_0_intercept": float(modelo.intercept_[0]),
                "beta_1_racha_down": float(modelo.coef_[0][0]),
                "beta_2_delta_spot_temprano": float(modelo.coef_[0][1]),
                "normalizacion_media": media.tolist(),
                "normalizacion_std": std.tolist(),
                "metricas_oos": metricas,
            }

    with open("./data/parametros_calibrados.json", "w") as f:
        json.dump(parametros, f, indent=2)

    with open("./data/resumen_calibracion.txt", "w") as f:
        f.write("\n".join(OUT_LINES))

    log("\n\nGuardado: ./data/parametros_calibrados.json y ./data/resumen_calibracion.txt")
    log("Sube el resumen (liviano) a la conversacion para revisar los resultados.")


if __name__ == "__main__":
    main()
