#!/usr/bin/env python3
"""
ejecutar_fase2_t23_modelo_combinado.py
Tarea 2.3 del Roadmap Fase 2:
Corre Walk-Forward con el set de features que sobrevive tras la auditoría de colinealidad (racha_down + delta_spot_temprano).
Compara explícitamente los resultados (Beta 0, Beta 1, Beta 2, Accuracy OOS, LogLoss OOS) contra el modelo base.
Output: /home/anton/oraculo-cripto/data/resultado_modelo_combinado.txt
"""

import os
import sys
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss

KLINES_1M_PATH = '/home/anton/oraculo-cripto/data/klines_1m.csv'
OUTPUT_TXT_PATH = '/home/anton/oraculo-cripto/data/resultado_modelo_combinado.txt'

COINS = ['XRPUSDT', 'SOLUSDT', 'DOGEUSDT', 'BNBUSDT', 'ETHUSDT', 'BTCUSDT']

def build_aligned_feature_dataset(df):
    df['dt'] = pd.to_datetime(df['open_time'])
    df['cycle_key'] = df['dt'].dt.strftime('%Y-%m-%d %H:00:00')
    df['minute_in_hour'] = df['dt'].dt.minute

    coin_data = {}

    for coin in COINS:
        df_c = df[df['symbol'] == coin].sort_values('dt').reset_index(drop=True)
        groups = df_c.groupby('cycle_key')

        recs = []
        prev_outcomes = []
        sorted_hours = sorted(groups.groups.keys())

        for ckey in sorted_hours:
            grp = groups.get_group(ckey)
            min_dict = grp.set_index('minute_in_hour')

            if 0 not in min_dict.index or 14 not in min_dict.index or 59 not in min_dict.index:
                continue

            open_0 = min_dict.loc[0, 'open']
            close_15 = min_dict.loc[14, 'close']
            close_59 = min_dict.loc[59, 'close']

            delta_15m = ((close_15 - open_0) / open_0) * 100.0
            final_out = 1 if close_59 >= open_0 else 0

            racha_down = 0
            for past in reversed(prev_outcomes):
                if past == 0:
                    racha_down += 1
                else:
                    break

            recs.append({
                'cycle_key': ckey,
                'racha_down': racha_down,
                'delta_15m': delta_15m,
                'target': final_out
            })
            prev_outcomes.append(final_out)

        coin_data[coin] = pd.DataFrame(recs)

    return coin_data

def run_combined_model_evaluation():
    print("=================================================================")
    print("🚀 TAREA 2.3: MODELO COMBINADO FINAL POR MONEDA (FASE 2)")
    print("=================================================================\n")

    df = pd.read_csv(KLINES_1M_PATH)
    coin_data = build_aligned_feature_dataset(df)

    txt_lines = []
    txt_lines.append("=================================================================")
    txt_lines.append("RESULTADO DEL MODELO COMBINADO FINAL POR MONEDA (FASE 2)")
    txt_lines.append("Set de Features Sobreviviente: ['racha_down', 'delta_spot_temprano (15m)']")
    txt_lines.append("Excluidas por Redundancia (|r| >= 0.64): ['lead_lag_btc_15m', 'lead_lag_eth_15m']")
    txt_lines.append("=================================================================\n")

    for coin in COINS:
        df_c = coin_data[coin].copy()
        if len(df_c) < 500:
            continue

        X = df_c[['racha_down', 'delta_15m']].values
        y = df_c['target'].values

        min_train = int(len(df_c) * 0.8)

        mean_r = np.mean(X[:, 0])
        std_r = np.std(X[:, 0]) or 1.0
        mean_d = np.mean(X[:, 1])
        std_d = np.std(X[:, 1]) or 1.0

        X_norm = X.copy()
        X_norm[:, 0] = (X_norm[:, 0] - mean_r) / std_r
        X_norm[:, 1] = (X_norm[:, 1] - mean_d) / std_d

        preds_prob = []
        preds_class = []
        actuals = []

        for t in range(min_train, len(df_c)):
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

        # Fit final model
        clf_final = LogisticRegression(solver='liblinear')
        clf_final.fit(X_norm, y)

        beta_0 = float(clf_final.intercept_[0])
        beta_1 = float(clf_final.coef_[0][0])
        beta_2 = float(clf_final.coef_[0][1])

        # Benchmark comparison: Single Feature (delta_15m only)
        X_single = X_norm[:, [1]]
        preds_single_class = []
        for t in range(min_train, len(df_c)):
            clf_s = LogisticRegression(solver='liblinear')
            clf_s.fit(X_single[:t], y[:t])
            prob_s = clf_s.predict_proba(X_single[t:t+1])[0, 1]
            preds_single_class.append(1 if prob_s >= 0.5 else 0)

        acc_single = accuracy_score(actuals, preds_single_class)
        mejora_vs_single = (acc - acc_single) * 100.0

        msg = (
            f"📌 MONEDA: {coin}\n"
            f"   - Muestras Totales:      {len(df_c)} ciclos\n"
            f"   - Out-of-Sample Folds:   {len(actuals)}\n"
            f"   - Coeficientes Beta:     β0 (Intercept) = {beta_0:+.6f} | β1 (Racha) = {beta_1:+.6f} | β2 (Delta 15m) = {beta_2:+.6f}\n"
            f"   - Normalización (Media): [{mean_r:.6f}, {mean_d:.6f}]\n"
            f"   - Normalización (Std):   [{std_r:.6f}, {std_d:.6f}]\n"
            f"   - OOS Accuracy Final:    {acc*100:.2f}%\n"
            f"   - OOS LogLoss Final:     {loss:.4f}\n"
            f"   - Comparación vs Single: {acc_single*100:.2f}% (Delta 15m solo) -> Mejora Real: {mejora_vs_single:+.2f}%\n"
        )

        print(msg)
        txt_lines.append(msg)

    full_txt = "\n".join(txt_lines)
    with open(OUTPUT_TXT_PATH, 'w') as f:
        f.write(full_txt)

    print(f"=================================================================")
    print(f"✅ Reporte TXT del Modelo Combinado guardado en: {OUTPUT_TXT_PATH}")
    print("=================================================================")

if __name__ == '__main__':
    run_combined_model_evaluation()
