#!/usr/bin/env python3
"""
ejecutar_fase2_t25_hype.py
Tarea 2.5 del Roadmap Fase 2:
Evalúa el dataset de HYPE (hype_klines_1h.csv).
Al poseer únicamente resolución de 1 hora (2,161 velas de 1h de Hyperliquid),
no existen velas intra-hora (1m, 5m, 15m) para calcular delta_spot_temprano.
Se aplica la regla estricta del Roadmap: HYPE utiliza exclusivamente `racha_down` 
para prevenir invenciones sintéticas o contaminación cross-asset.

Outputs:
- /home/anton/oraculo-cripto/data/resultado_modelo_hype.txt
- Actualización de /home/anton/oraculo-cripto/data/parametros_calibrados_v2.json para incluir HYPEUSDT
"""

import os
import sys
import json
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss

HYPE_KLINES_PATH = '/home/anton/oraculo-cripto/data/hype_klines_1h.csv'
TXT_OUTPUT_PATH = '/home/anton/oraculo-cripto/data/resultado_modelo_hype.txt'
JSON_V2_PATH = '/home/anton/oraculo-cripto/data/parametros_calibrados_v2.json'

def evaluate_hype_model():
    print("=================================================================")
    print("🔮 TAREA 2.5: EVALUACIÓN DE MODELO DEDICADO PARA HYPE (FASE 2)")
    print("=================================================================\n")

    df = pd.read_csv(HYPE_KLINES_PATH)
    df['dt'] = pd.to_datetime(df['open_time'])
    df = df.sort_values('dt').reset_index(drop=True)

    records = []
    prev_outcomes = []

    for idx, row in df.iterrows():
        open_p = row['open']
        close_p = row['close']
        target = 1 if close_p >= open_p else 0

        racha_down = 0
        for past in reversed(prev_outcomes):
            if past == 0:
                racha_down += 1
            else:
                break

        records.append({
            'open_time': row['open_time'],
            'racha_down': racha_down,
            'target': target
        })
        prev_outcomes.append(target)

    df_hype = pd.DataFrame(records)
    print(f"📊 Dataset HYPE cargado: {len(df_hype)} horas ({df['dt'].min()} a {df['dt'].max()})")

    # Walk-forward 80/20
    min_train = int(len(df_hype) * 0.8)

    X = df_hype[['racha_down']].values
    y = df_hype['target'].values

    mean_r = float(np.mean(X[:, 0]))
    std_r = float(np.std(X[:, 0])) or 1.0

    X_norm = (X - mean_r) / std_r

    preds_prob = []
    preds_class = []
    actuals = []

    for t in range(min_train, len(df_hype)):
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

    report_content = (
        "=================================================================\n"
        "REPORTE OFICIAL TAREA 2.5 — EVALUACIÓN DEL MODELO PARA HYPE\n"
        "=================================================================\n\n"
        "1. LIMITACIÓN TÉCNICA Y AUDITORÍA DE DATOS:\n"
        "   - Dataset inspeccionado: ./data/hype_klines_1h.csv (Hyperliquid API)\n"
        "   - Total de Muestras: 2,161 horas (Resolución única: 1 Hora)\n"
        "   - Hallazgo: El dataset NO contiene velas intra-hora (< 1h, ej. 1m, 5m, 15m).\n"
        "   - Regla de Gobernanza Aplicada: Para prevenir contaminación cross-asset o datos sintéticos,\n"
        "     HYPE queda explícitamente restringido al modelo de `racha_down` puro hasta acumular 1m klines.\n\n"
        "2. RESULTADOS WALK-FORWARD OUT-OF-SAMPLE (HYPE):n"
        "   - Out-of-Sample Folds: 433 horas evaluadas\n"
        "   - Feature Utilizada: ['racha_down']\n"
        "   - Beta 0 (Intercept): " + f"{beta_0:+.6f}\n"
        "   - Beta 1 (Racha Down): " + f"{beta_1:+.6f}\n"
        "   - Beta 2 (Momentum 15m): N/A (0.000000 -- Sin microestructura <1h)\n"
        "   - Normalización Media (Racha): " + f"{mean_r:.6f}\n"
        "   - Normalización Std (Racha):   " + f"{std_r:.6f}\n"
        "   - Accuracy Out-of-Sample: " + f"{acc*100:.2f}%\n"
        "   - LogLoss Out-of-Sample:  " + f"{loss:.4f}\n\n"
        "3. PROTOCOLO OPERATIVO EN VIVO PARA HYPE:\n"
        "   - El motor asigna beta_2 = 0.0 para HYPE al evaluar la sigmoide.\n"
        "   - La inferencia depende únicamente de la inercia racha_down histórica.\n"
    )

    with open(TXT_OUTPUT_PATH, 'w') as f:
        f.write(report_content)

    print(f"✅ Reporte TXT de HYPE guardado en: {TXT_OUTPUT_PATH}")

    # Update parametros_calibrados_v2.json
    if os.path.exists(JSON_V2_PATH):
        with open(JSON_V2_PATH, 'r') as f:
            manifest = json.load(f)
    else:
        manifest = {}

    hype_entry = {
        "min_5": {
            "beta_0": beta_0,
            "beta_1_racha": beta_1,
            "beta_2_momentum": 0.0,
            "normalizacion_media": [mean_r, 0.0],
            "normalizacion_std": [std_r, 1.0],
            "n_folds": len(actuals),
            "accuracy_oos": round(acc, 6),
            "logloss_oos": round(loss, 6),
            "nota": "Restringido a racha_down por falta de microestructura 1m"
        },
        "min_15": {
            "beta_0": beta_0,
            "beta_1_racha": beta_1,
            "beta_2_momentum": 0.0,
            "normalizacion_media": [mean_r, 0.0],
            "normalizacion_std": [std_r, 1.0],
            "n_folds": len(actuals),
            "accuracy_oos": round(acc, 6),
            "logloss_oos": round(loss, 6),
            "nota": "Restringido a racha_down por falta de microestructura 1m"
        },
        "min_30": {
            "beta_0": beta_0,
            "beta_1_racha": beta_1,
            "beta_2_momentum": 0.0,
            "normalizacion_media": [mean_r, 0.0],
            "normalizacion_std": [std_r, 1.0],
            "n_folds": len(actuals),
            "accuracy_oos": round(acc, 6),
            "logloss_oos": round(loss, 6),
            "nota": "Restringido a racha_down por falta de microestructura 1m"
        }
    }

    manifest["HYPEUSDT"] = hype_entry

    with open(JSON_V2_PATH, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"✅ Entrada HYPEUSDT añadida a: {JSON_V2_PATH}")

if __name__ == '__main__':
    evaluate_hype_model()
