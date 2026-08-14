#!/usr/bin/env python3
"""
TAREA 1.3 -- Feature de Sesion de Mercado (Asia 00-08, Europa 08-16, US 16-24 UTC)

Walk-Forward con dummy encoding [racha_down, delta_spot_temprano, sesion_asia, sesion_europa]
usando US como base. Comparacion directa vs Modelo sin Sesion (Tarea 1.1 C).
"""

import os
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

COINS = ["XRPUSDT", "SOLUSDT", "DOGEUSDT", "BNBUSDT"]

def cargar(path):
    df = pd.read_csv(path)
    df["open_time"] = pd.to_datetime(df["open_time"], errors="coerce")
    return df.dropna(subset=["open_time"]).sort_values("open_time").reset_index(drop=True)

def construir_dataset_sesion(df_1h: pd.DataFrame, df_15m: pd.DataFrame, coin: str):
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
            delta_temprano = (float(c) - float(o)) / float(o) * 100.0
        else:
            delta_temprano = np.nan

        # Dummy encoding para sesion: Asia (00-08), Europa (08-16), US (16-24)
        h = hora_actual.hour
        sesion_asia = 1.0 if 0 <= h < 8 else 0.0
        sesion_europa = 1.0 if 8 <= h < 16 else 0.0

        rows.append({
            "open_time": hora_actual,
            "racha_down": racha,
            "delta_spot_temprano": delta_temprano,
            "sesion_asia": sesion_asia,
            "sesion_europa": sesion_europa,
            "target_up": 1 if directions[i] == "UP" else 0,
        })

    return pd.DataFrame(rows).dropna()

def walk_forward_fast(X, y, min_train=100):
    resultados_oos = []

    for T in range(min_train, len(X)):
        X_train, y_train = X[:T], y[:T]
        X_test, y_test = X[T:T + 1], y[T:T + 1]

        media = X_train.mean(axis=0)
        std = X_train.std(axis=0)
        std[std == 0] = 1.0
        X_train_norm = (X_train - media) / std
        X_test_norm = (X_test - media) / std

        if len(np.unique(y_train)) < 2:
            continue

        modelo = LogisticRegression(solver='liblinear')
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
    return len(resultados_oos), float(accuracy), float(logloss)

def main():
    df_1h = cargar("./data/klines_1h.csv")
    df_15m = cargar("./data/klines_15m.csv")

    out_lines = []
    header = "=" * 85 + "\nTAREA 1.3 -- EVALUACION DE FEATURE DE SESION DE MERCADO (ASIA/EUROPA/US)\n" + "=" * 85
    print(header)
    out_lines.append(header)

    sub_header = f"{'MONEDA':<10} | {'MODELO':<20} | {'FOLDS':<7} | {'ACCURACY':<10} | {'LOGLOSS':<10} | {'DIFERENCIA':<15}"
    print(sub_header)
    out_lines.append(sub_header)
    out_lines.append("-" * 85)

    for coin in COINS:
        df_feat = construir_dataset_sesion(df_1h, df_15m, coin)

        # Baseline (Sin sesion: racha + delta_spot_temprano)
        X_base = df_feat[["racha_down", "delta_spot_temprano"]].values
        y = df_feat["target_up"].values
        folds_b, acc_b, loss_b = walk_forward_fast(X_base, y)

        # Modelo Con Sesion
        X_sesion = df_feat[["racha_down", "delta_spot_temprano", "sesion_asia", "sesion_europa"]].values
        folds_s, acc_s, loss_s = walk_forward_fast(X_sesion, y)

        diff_acc = (acc_s - acc_b) * 100.0
        mejora_str = f"{diff_acc:+.2f}% Acc"

        l1 = f"{coin:<10} | Base (Sin Sesion)   | {folds_b:<7} | {acc_b*100:6.2f}%    | {loss_b:8.4f}   | -"
        l2 = f"{coin:<10} | Con Sesion Market  | {folds_s:<7} | {acc_s*100:6.2f}%    | {loss_s:8.4f}   | {mejora_str}"

        print(l1)
        print(l2)
        print("-" * 85)

        out_lines.append(l1)
        out_lines.append(l2)
        out_lines.append("-" * 85)

    res_text = "\n".join(out_lines)
    os.makedirs("./data", exist_ok=True)
    with open("./data/resultado_feature_sesion.txt", "w") as f:
        f.write(res_text)

    print("\nGuardado exitosamente en ./data/resultado_feature_sesion.txt")

if __name__ == "__main__":
    main()
