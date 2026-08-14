#!/usr/bin/env python3
"""
TAREA 1.2 -- Curva de Accuracy vs Minuto de Evaluacion (3, 5, 10, 15, 20, 30 min) - FAST NUMPY VERSION

Regla de Causalidad Estricta:
El corte al minuto M SOLO puede usar velas de 5m cuyo open_time + 5 min <= M minutos
despues del open_time de la hora en curso.
"""

import os
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

COINS = ["XRPUSDT", "SOLUSDT", "DOGEUSDT", "BNBUSDT"]
MINUTOS_CORTE = [3, 5, 10, 15, 20, 30]

def cargar(path):
    df = pd.read_csv(path)
    df["open_time"] = pd.to_datetime(df["open_time"], errors="coerce")
    return df.dropna(subset=["open_time"]).sort_values("open_time").reset_index(drop=True)

def precalcular_deltas(df_5m: pd.DataFrame):
    df_5m = df_5m.copy()
    df_5m["hora"] = df_5m["open_time"].dt.floor("h")
    df_5m["minuto_relativo_fin"] = (df_5m["open_time"] - df_5m["hora"]).dt.total_seconds() / 60.0 + 5.0
    return df_5m

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
    df_5m = cargar("./data/klines_5m.csv")
    df_5m = precalcular_deltas(df_5m)

    rows_out = []

    for coin in COINS:
        sub1h = df_1h[df_1h["symbol"] == coin].sort_values("open_time").reset_index(drop=True)
        sub5 = df_5m[df_5m["symbol"] == coin]

        # precalcular racha
        directions = sub1h["direction"].tolist()
        racha_list = []
        for i in range(len(sub1h)):
            racha = 0
            j = i - 1
            while j >= 0 and directions[j] == "DOWN":
                racha += 1
                j -= 1
            racha_list.append(racha)
        sub1h["racha_down"] = racha_list
        sub1h["target_up"] = (sub1h["direction"] == "UP").astype(int)

        for min_corte in MINUTOS_CORTE:
            # Causalidad: solo velas con minuto_relativo_fin <= min_corte
            if min_corte < 5:
                sub5_valid = sub5[sub5["minuto_relativo_fin"] <= 5]
            else:
                sub5_valid = sub5[sub5["minuto_relativo_fin"] <= min_corte]

            grouped = sub5_valid.groupby("hora")
            first_open = grouped["open"].first()
            last_close = grouped["close"].last()
            deltas = (last_close - first_open) / first_open * 100.0

            df_merged = sub1h.copy()
            df_merged["delta_spot_parcial"] = df_merged["open_time"].map(deltas)
            df_clean = df_merged.dropna(subset=["delta_spot_parcial", "racha_down", "target_up"])

            X = df_clean[["racha_down", "delta_spot_parcial"]].values
            y = df_clean["target_up"].values

            folds, acc, loss = walk_forward_fast(X, y)
            rows_out.append({
                "coin": coin,
                "minuto_corte": min_corte,
                "n_folds": folds,
                "accuracy": round(acc, 4),
                "logloss": round(loss, 4)
            })

    res_df = pd.DataFrame(rows_out)
    os.makedirs("./data", exist_ok=True)
    res_df.to_csv("./data/curva_accuracy_por_minuto.csv", index=False)
    print("CSV Generado exitosamente en ./data/curva_accuracy_por_minuto.csv:")
    print(res_df.to_csv(index=False))

if __name__ == "__main__":
    main()
