#!/bin/bash
# Criptobot v3.0 AI Pipeline — Runs hourly at :05 UTC
# 1. Run backtest calibration (updates parametros_calibrados.json)
# 2. Run opportunity scout (NVIDIA Nemotron analysis)
cd /home/anton/criptobot

echo "[2026-08-12 07:43:59 UTC] 🤖 Iniciando pipeline de IA autónomo..."

# Step 1: Recalibrate with latest data
echo "[2026-08-12 07:43:59 UTC] 📊 Ejecutando backtest_calibration.py..."
python3 scripts/backtest_calibration.py 2>&1

# Step 2: Run opportunity scout
echo "[2026-08-12 07:43:59 UTC] 🔍 Ejecutando opportunity_scout.py..."
python3 -c "
import sys
sys.path.insert(0, '/home/anton/criptobot')
from ai.opportunity_scout import scout_opportunities
import json
result = scout_opportunities()
print(json.dumps(result, indent=2, ensure_ascii=False))
" 2>&1

echo "[2026-08-12 07:43:59 UTC] ✅ Pipeline de IA completado."
