#!/usr/bin/env python3
"""
ejecutar_fase2_t24_score_dinamico.py
Tarea 2.4 del Roadmap Fase 2:
Genera /home/anton/oraculo-cripto/data/parametros_calibrados_v2.json
con coeficientes entrenados out-of-sample para los 3 puntos de corte principales:
min_5, min_15, min_30.
"""

import os
import sys
import json
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss

KLINES_1M_PATH = '/home/anton/oraculo-cripto/data/klines_1m.csv'
OUTPUT_JSON_PATH = '/home/anton/oraculo-cripto/data/parametros_calibrados_v2.json'

COINS = ['XRPUSDT', 'SOLUSDT', 'DOGEUSDT', 'BNBUSDT', 'ETHUSDT', 'BTCUSDT']
CUTS = {'min_5': 5, 'min_15': 15, 'min_30': 30}

def build_minute_dataset_for_cuts(df, coin):
    df_c = df[df['symbol'] == coin].copy()
    if len(df_c) == 0:
        return None

    df_c['dt'] = pd.to_datetime(df_c['open_time'])
    df_c = df_c.sort_values('dt').reset_index(drop=True)

    df_c['cycle_key'] = df_c['dt'].dt.strftime('%Y-%m-%d %H:00:00')
    df_c['minute_in_hour'] = df_c['dt'].dt.minute

    cycle_groups = df_c.groupby('cycle_key')

    records = []
    prev_outcomes = []
    sorted_hours = sorted(cycle_groups.groups.keys())

    for ckey in sorted_hours:
        grp = cycle_groups.get_group(ckey)
        min_dict = grp.set_index('minute_in_hour')

        if 0 not in min_dict.index or 59 not in min_dict.index:
            continue

        open_0 = min_dict.loc[0, 'open']
        close_59 = min_dict.loc[59, 'close']
        final_out = 1 if close_59 >= open_0 else 0

        racha_down = 0
        for past in reversed(prev_outcomes):
            if past == 0:
                racha_down += 1
            else:
                break

        row_dict = {
            'cycle_key': ckey,
            'racha_down': racha_down,
            'target': final_out
        }

        for name, m in CUTS.items():
            idx = m - 1
            if idx in min_dict.index:
                close_m = min_dict.loc[idx, 'close']
                row_dict[name] = ((close_m - open_0) / open_0) * 100.0
            else:
                row_dict[name] = np.nan

        records.append(row_dict)
        prev_outcomes.append(final_out)

    return pd.DataFrame(records).dropna().reset_index(drop=True)

def calibrate_dynamic_cuts():
    print("=================================================================")
    print("🧠 TAREA 2.4: CALIBRACIÓN DE SCORE_UP DINÁMICO POR MINUTO (FASE 2)")
    print("=================================================================\n")

    df = pd.read_csv(KLINES_1M_PATH)
    manifest = {}

    for coin in COINS:
        print(f"📌 Calibrando {coin}...")
        df_coin = build_minute_dataset_for_cuts(df, coin)
        if df_coin is None or len(df_coin) < 500:
            continue

        manifest[coin] = {}
        min_train = int(len(df_coin) * 0.8)

        for cut_name, m_val in CUTS.items():
            X = df_coin[['racha_down', cut_name]].values
            y = df_coin['target'].values

            mean_r = float(np.mean(X[:, 0]))
            std_r = float(np.std(X[:, 0])) or 1.0
            mean_d = float(np.mean(X[:, 1]))
            std_d = float(np.std(X[:, 1])) or 1.0

            X_norm = X.copy()
            X_norm[:, 0] = (X_norm[:, 0] - mean_r) / std_r
            X_norm[:, 1] = (X_norm[:, 1] - mean_d) / std_d

            preds_prob = []
            preds_class = []
            actuals = []

            for t in range(min_train, len(df_coin)):
                X_tr, y_tr = X_norm[:t], y[:t]
                X_te, y_te = X_norm[t:t+1], y[t:t+1]

                clf = LogisticRegression(solver='liblinear')
                clf.fit(X_tr, y_tr)

                prob = clf.predict_proba(X_te)[0, 1]
                pred = 1 if prob >= 0.5 else 0

                preds_prob.append(prob)
                preds_class.append(pred)
                actuals.append(y_te[0])

            acc = accuracy_score(actuals, preds_class)
            loss = log_loss(actuals, preds_prob)

            clf_final = LogisticRegression(solver='liblinear')
            clf_final.fit(X_norm, y)

            beta_0 = float(clf_final.intercept_[0])
            beta_1 = float(clf_final.coef_[0][0])
            beta_2 = float(clf_final.coef_[0][1])

            manifest[coin][cut_name] = {
                "beta_0": beta_0,
                "beta_1_racha": beta_1,
                "beta_2_momentum": beta_2,
                "normalizacion_media": [mean_r, mean_d],
                "normalizacion_std": [std_r, std_d],
                "n_folds": len(actuals),
                "accuracy_oos": round(acc, 6),
                "logloss_oos": round(loss, 6)
            }

            print(f"   - [{cut_name}] Beta0: {beta_0:+.4f} | Beta1: {beta_1:+.4f} | Beta2: {beta_2:+.4f} | OOS Acc: {acc*100:5.2f}%")

    with open(OUTPUT_JSON_PATH, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"\n=================================================================")
    print(f"✅ Manifiesto JSON Dinámico v2 guardado en: {OUTPUT_JSON_PATH}")
    print("=================================================================")

if __name__ == '__main__':
    calibrate_dynamic_cuts()
