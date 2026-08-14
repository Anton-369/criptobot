#!/usr/bin/env python3
"""
DIAGNOSTICO FEATURES -- Comparacion de 3 variantes de modelo:
  - Variante A: solo racha_down
  - Variante B: solo delta_spot_temprano
  - Variante C: ambas features

Utiliza Walk-Forward con ventana expandible sobre data de ./data/
"""

import sys
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

COINS = ["XRPUSDT", "SOLUSDT", "DOGEUSDT", "BNBUSDT"]
MIN_FOLDS_PARA_CONFIAR = 200

def cargar(path):
    df = pd.read_csv(path)
    df["open_time"] = pd.to_datetime(df["open_time"], errors="coerce")
    df = df.dropna(subset=["open_time"])
    return df.sort_values("open_time").reset_index(drop=True)

def construir_features(df_1h: pd.DataFrame, df_15m: pd.DataFrame, coin: str) -> pd.DataFrame:
    sub1h = df_1h[df_1h["symbol"] == coin].sort_values("open_time").reset_index(drop=True)
    sub15 = df_15m[df_15m["symbol"] == coin].sort_values("open_time").reset_index(drop=True)
    sub15 = sub15.set_index(pd.DatetimeIndex(sub15["open_time"]))
    sub15["hora"] = sub15.index.floor("h")
    primer_bloque = sub15.groupby("hora").first()

    directions = sub1h["direction"].tolist()
    rows = []
    for i in range(len(sub1h)):
        hora_actual = sub1h.loc[i, "open_time"]
        racha = 0
        j = i - 1
        while j >= 0 and directions[j] == "DOWN":
            racha += 1
            j -= 1

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

def walk_forward_variante(df_feat: pd.DataFrame, feature_cols, min_train=100):
    X = df_feat[feature_cols].values
    y = df_feat["target_up"].values
    resultados_oos = []

    for T in range(min_train, len(df_feat)):
        X_train, y_train = X[:T], y[:T]
        X_test, y_test = X[T:T + 1], y[T:T + 1]

        media = X_train.mean(axis=0)
        std = X_train.std(axis=0)
        std[std == 0] = 1.0
        X_train_norm = (X_train - media) / std
        X_test_norm = (X_test - media) / std

        if len(np.unique(y_train)) < 2:
            continue

        modelo = LogisticRegression()
        modelo.fit(X_train_norm, y_train)
        prob_up = modelo.predict_proba(X_test_norm)[0, 1]
        resultados_oos.append((y_test[0], prob_up))

    if not resultados_oos:
        return 0, 0.0, 0.0

    y_real = np.array([r[0] for r in resultados_oos])
    y_prob = np.array([r[1] for r in resultados_oos])
    y_pred = (y_prob >= 0.5).astype(int)

    accuracy = (y_pred == y_real).mean()
    eps = 1e-9
    logloss = -np.mean(y_real * np.log(y_prob + eps) + (1 - y_real) * np.log(1 - y_prob + eps))
    return len(resultados_oos), accuracy, logloss

def main():
    print("=" * 95)
    print("DIAGNOSTICO FEATURES: COMPARACION DE VARIANTES A (RACHA), B (MOMENTUM), C (AMBAS)")
    print("=" * 95)
    print(f"{'MONEDA':<10} | {'VAR':<5} | {'FEATURES':<30} | {'FOLDS':<7} | {'ACCURACY':<10} | {'LOGLOSS':<10} | {'ESTADO':<15}")
    print("-" * 95)

    df_1h = pd.read_csv("./data/klines_1h.csv")
    df_15m = pd.read_csv("./data/klines_15m.csv")
    df_1h["open_time"] = pd.to_datetime(df_1h["open_time"], errors="coerce")
    df_15m["open_time"] = pd.to_datetime(df_15m["open_time"], errors="coerce")

    variantes = [
        ("A", ["racha_down"], "Solo racha_down"),
        ("B", ["delta_spot_temprano"], "Solo delta_spot_temprano"),
        ("C", ["racha_down", "delta_spot_temprano"], "Ambas (Racha + Momentum)")
    ]

    for coin in COINS:
        df_feat = construir_features(df_1h, df_15m, coin)
        for var_code, cols, desc in variantes:
            folds, acc, loss = walk_forward_variante(df_feat, cols)
            estado = "OK" if folds >= MIN_FOLDS_PARA_CONFIAR else "INSUFFICIENTES"
            print(f"{coin:<10} | {var_code:<5} | {desc:<30} | {folds:<7} | {acc*100:6.2f}%    | {loss:8.4f}   | {estado:<15}")
        print("-" * 95)

if __name__ == "__main__":
    main()
