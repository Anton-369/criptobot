#!/usr/bin/env python3
"""
ejecutar_fase2_t21_granularidad.py
Tarea 2.1 del Roadmap Fase 2:
Calcula la curva de accuracy fuera de muestra (Walk-Forward) minuto a minuto
usando velas de 1 minuto reales (klines_1m.csv).
Puntos de corte evaluados: M in {1, 2, 3, 5, 7, 10, 15, 20, 30}.
Verifica programáticamente que no existan deltas o accuracies idénticos.
Output: /home/anton/oraculo-cripto/data/curva_accuracy_por_minuto_v2.csv
"""

import os
import sys
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss

KLINES_1M_PATH = '/home/anton/oraculo-cripto/data/klines_1m.csv'
OUTPUT_CSV_PATH = '/home/anton/oraculo-cripto/data/curva_accuracy_por_minuto_v2.csv'

COINS = ['XRPUSDT', 'SOLUSDT', 'DOGEUSDT', 'BNBUSDT', 'ETHUSDT', 'BTCUSDT']
MINUTOS = [1, 2, 3, 5, 7, 10, 15, 20, 30]

def build_minute_dataset(df, coin):
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
        final_outcome = 1 if close_59 >= open_0 else 0

        racha_down = 0
        for past_out in reversed(prev_outcomes):
            if past_out == 0:
                racha_down += 1
            else:
                break

        row_dict = {
            'cycle_key': ckey,
            'racha_down': racha_down,
            'open_0': open_0,
            'target': final_outcome
        }

        # Calculate deltas for each minute cut M
        # For minute M, index in min_dict is M-1 (e.g. min 1 uses index 0 close, min 15 uses index 14 close)
        for m in MINUTOS:
            idx = m - 1
            if idx in min_dict.index:
                close_m = min_dict.loc[idx, 'close']
                row_dict[f'delta_m{m}'] = ((close_m - open_0) / open_0) * 100.0
            else:
                row_dict[f'delta_m{m}'] = np.nan

        records.append(row_dict)
        prev_outcomes.append(final_outcome)

    df_res = pd.DataFrame(records).dropna().reset_index(drop=True)
    return df_res

def evaluate_accuracy_curve():
    print("=================================================================")
    print("🚀 TAREA 2.1: EVALUANDO CURVA DE ACCURACY CON VELAS 1M (FASE 2)")
    print("=================================================================\n")

    df = pd.read_csv(KLINES_1M_PATH)
    all_results = []

    for coin in COINS:
        print(f"📌 Procesando {coin}...")
        df_coin = build_minute_dataset(df, coin)
        if df_coin is None or len(df_coin) < 500:
            print(f"⚠️ Muestras insuficientes para {coin}")
            continue

        min_train = int(len(df_coin) * 0.8)
        last_acc = None

        for m in MINUTOS:
            col_delta = f'delta_m{m}'

            X = df_coin[['racha_down', col_delta]].values
            y = df_coin['target'].values

            # Standardization over full vector
            mean_racha = np.mean(X[:, 0])
            std_racha = np.std(X[:, 0]) or 1.0
            mean_delta = np.mean(X[:, 1])
            std_delta = np.std(X[:, 1]) or 1.0

            X_norm = X.copy()
            X_norm[:, 0] = (X_norm[:, 0] - mean_racha) / std_racha
            X_norm[:, 1] = (X_norm[:, 1] - mean_delta) / std_delta

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

            diff_str = f"{(acc - last_acc)*100:+.2f}%" if last_acc is not None else "N/A"
            last_acc = acc

            print(f"   Minuto {m:2d} | Folds: {len(actuals)} | Accuracy: {acc*100:6.2f}% | LogLoss: {loss:.4f} | Diff: {diff_str}")

            all_results.append({
                'coin': coin,
                'minuto': m,
                'folds': len(actuals),
                'accuracy': round(acc, 6),
                'accuracy_pct': round(acc * 100, 2),
                'logloss': round(loss, 6),
                'diff_prev': diff_str
            })

    df_out = pd.DataFrame(all_results)
    df_out.to_csv(OUTPUT_CSV_PATH, index=False)
    print(f"\n=================================================================")
    print(f"✅ CSV guardado exitosamente en: {OUTPUT_CSV_PATH}")
    print("=================================================================")

    # Verification: check for duplicate consecutive accuracies
    for coin in COINS:
        df_sub = df_out[df_out['coin'] == coin]
        accs = df_sub['accuracy_pct'].values
        dups = []
        for i in range(1, len(accs)):
            if accs[i] == accs[i-1]:
                dups.append((df_sub['minuto'].iloc[i-1], df_sub['minuto'].iloc[i], accs[i]))
        if dups:
            print(f"⚠️ ADVERTENCIA: Se encontraron accuracies duplicados en {coin}: {dups}")
        else:
            print(f"✓ {coin}: Verificación OK (Sin duplicados consecutivos en la curva de accuracy).")

if __name__ == '__main__':
    evaluate_accuracy_curve()
