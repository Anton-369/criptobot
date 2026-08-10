#!/usr/bin/env python3
"""
Importa el historial del CSV manual (Escritorio) al archivo tabla_simple_1h.json del bot.
Convierte horas ET/Chile (UTC-4) a UTC para almacenamiento correcto.
"""
import json
import os
from datetime import datetime, timezone, timedelta

# === DATOS DEL CSV (COINS - Hoja 1.csv) ===
# Formato: { "YYYY-MM-DD": { Hr_ET: { coin: UP/DOWN } } }
# Hr ET = hora local Chile/ET en la que CIERRA el ciclo de Polymarket
# Hr1 = ciclo que termina a la 1AM ET (12AM-1AM)

CSV_HISTORY = {
    "2026-08-06": {
        # Cols disponibles desde Hr1 (muchas vacías al inicio del día)
        21: {"btc":"DOWN","eth":None,"xrp":"UP","sol":"DOWN","doge":"UP","hype":None,"bnb":None},
        22: {"btc":"UP",  "eth":None,"xrp":"UP","sol":"UP",  "doge":"UP","hype":None,"bnb":None},
        23: {"btc":"DOWN","eth":None,"xrp":"DOWN","sol":"DOWN","doge":"UP","hype":None,"bnb":None},
        24: {"btc":"DOWN","eth":None,"xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":None,"bnb":None},
    },
    "2026-08-07": {
        1:  {"btc":"DOWN","eth":None,"xrp":"DOWN","sol":"UP",  "doge":"DOWN","hype":None,"bnb":None},
        2:  {"btc":"UP",  "eth":None,"xrp":"UP",  "sol":"UP",  "doge":"UP",  "hype":None,"bnb":None},
        3:  {"btc":"DOWN","eth":None,"xrp":"UP",  "sol":"DOWN","doge":"DOWN","hype":None,"bnb":None},
        4:  {"btc":"UP",  "eth":None,"xrp":"UP",  "sol":"UP",  "doge":"UP",  "hype":None,"bnb":None},
        5:  {"btc":"UP",  "eth":None,"xrp":"UP",  "sol":"UP",  "doge":"UP",  "hype":None,"bnb":None},
        6:  {"btc":"UP",  "eth":None,"xrp":"UP",  "sol":"UP",  "doge":"UP",  "hype":None,"bnb":None},
        7:  {"btc":"UP",  "eth":None,"xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":None,"bnb":None},
        8:  {"btc":"UP",  "eth":None,"xrp":"DOWN","sol":"UP",  "doge":"UP",  "hype":None,"bnb":None},
        9:  {"btc":"UP",  "eth":None,"xrp":"UP",  "sol":"UP",  "doge":"UP",  "hype":None,"bnb":None},
        10: {"btc":"DOWN","eth":None,"xrp":"DOWN","sol":"UP",  "doge":"DOWN","hype":None,"bnb":None},
        11: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":None,"bnb":None},
        12: {"btc":"DOWN","eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"DOWN","bnb":"UP"},
        13: {"btc":"UP",  "eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"UP"},
        14: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"DOWN","doge":"UP","hype":"DOWN","bnb":"DOWN"},
        15: {"btc":"DOWN","eth":"DOWN","xrp":"UP","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        16: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"UP"},
        17: {"btc":"UP",  "eth":"DOWN","xrp":"UP","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        18: {"btc":"DOWN","eth":"UP","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        19: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"UP","doge":"DOWN","hype":"UP","bnb":"DOWN"},
        20: {"btc":"UP",  "eth":"DOWN","xrp":"UP","sol":"UP","doge":"DOWN","hype":"DOWN","bnb":"UP"},
        21: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"DOWN","bnb":"DOWN"},
        22: {"btc":"DOWN","eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"DOWN"},
        23: {"btc":"UP",  "eth":"DOWN","xrp":"UP","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"UP"},
        24: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"UP"},
    },
    "2026-08-08": {
        1:  {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"UP"},
        2:  {"btc":"DOWN","eth":"UP","xrp":"DOWN","sol":"UP","doge":"UP","doge":"UP","hype":"UP","bnb":"DOWN"},
        3:  {"btc":"UP",  "eth":"DOWN","xrp":"UP","sol":"UP","doge":"UP","hype":"DOWN","bnb":"UP"},
        4:  {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"UP","doge":"DOWN","hype":"UP","bnb":"DOWN"},
        5:  {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"DOWN","doge":"UP","hype":"UP","bnb":"DOWN"},
        6:  {"btc":"UP",  "eth":"UP","xrp":"DOWN","sol":"UP","doge":"DOWN","hype":"DOWN","bnb":"UP"},
        7:  {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"UP"},
        8:  {"btc":"DOWN","eth":"DOWN","xrp":"UP","sol":"UP","doge":"DOWN","hype":"UP","bnb":"DOWN"},
        9:  {"btc":"DOWN","eth":"UP","xrp":"DOWN","sol":"DOWN","doge":"UP","hype":"DOWN","bnb":"DOWN"},
        10: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"DOWN","bnb":"UP"},
        11: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"UP"},
        12: {"btc":"DOWN","eth":"DOWN","xrp":"UP","sol":"DOWN","doge":"DOWN","hype":"UP","bnb":"UP"},
        13: {"btc":"UP",  "eth":"DOWN","xrp":"UP","sol":"DOWN","doge":"UP","hype":"UP","bnb":"UP"},
        14: {"btc":"UP",  "eth":"UP","xrp":"DOWN","sol":"UP","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        15: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        16: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},  # was UP
        17: {"btc":"UP",  "eth":"DOWN","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"DOWN"},
        18: {"btc":"DOWN","eth":"UP","xrp":"UP","sol":"DOWN","doge":"DOWN","hype":"UP","bnb":"DOWN"},
        19: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        20: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"DOWN","hype":"UP","bnb":"UP"},
        21: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"DOWN","hype":"UP","bnb":"UP"},
        22: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        23: {"btc":"DOWN","eth":"DOWN","xrp":"UP","sol":"UP","doge":"UP","hype":"DOWN","bnb":"DOWN"},
        24: {"btc":"DOWN","eth":"DOWN","xrp":"UP","sol":"UP","doge":"UP","hype":"DOWN","bnb":"DOWN"},
    },
    "2026-08-09": {
        1:  {"btc":"DOWN","eth":"DOWN","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"UP"},
        2:  {"btc":"UP",  "eth":"UP","xrp":"DOWN","sol":"UP","doge":"DOWN","hype":"DOWN","bnb":"UP"},
        3:  {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"UP"},
        4:  {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"UP","bnb":"DOWN"},
        5:  {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        6:  {"btc":"UP",  "eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        7:  {"btc":"UP",  "eth":"DOWN","xrp":"UP","sol":"DOWN","doge":"UP","hype":"DOWN","bnb":"UP"},
        8:  {"btc":"DOWN","eth":"DOWN","xrp":"UP","sol":"UP","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        9:  {"btc":"UP",  "eth":"DOWN","xrp":"UP","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        10: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"UP"},
        11: {"btc":"UP",  "eth":"UP","xrp":"DOWN","sol":"UP","doge":"DOWN","hype":"UP","bnb":"UP"},
        12: {"btc":"DOWN","eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"UP"},
        13: {"btc":"UP",  "eth":"DOWN","xrp":"UP","sol":"DOWN","doge":"UP","hype":"UP","bnb":"UP"},
        14: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        15: {"btc":"UP",  "eth":"DOWN","xrp":"DOWN","sol":"UP","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        16: {"btc":"DOWN","eth":"UP","xrp":"UP","sol":"UP","doge":"DOWN","hype":"UP","bnb":"DOWN"},  # 
        17: {"btc":"DOWN","eth":"DOWN","xrp":"UP","sol":"UP","doge":"DOWN","hype":"UP","bnb":"UP"},
        18: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"DOWN","bnb":"UP"},
        19: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        20: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        21: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"UP"},
        22: {"btc":"UP",  "eth":"UP","xrp":"UP","sol":"UP","doge":"UP","hype":"UP","bnb":"UP"},
        23: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
        24: {"btc":"DOWN","eth":"DOWN","xrp":"DOWN","sol":"DOWN","doge":"DOWN","hype":"DOWN","bnb":"DOWN"},
    }
}

ET_OFFSET = timedelta(hours=4)  # ET = UTC - 4

def hr_et_to_utc_iso(date_str: str, hr_et: int) -> str:
    """Convierte fecha + hora ET a timestamp UTC ISO."""
    if hr_et == 24:
        # Hr24 = medianoche siguiente en ET
        dt_et = datetime.strptime(date_str, "%Y-%m-%d").replace(hour=0, minute=0, second=0, tzinfo=timezone.utc)
        dt_et = dt_et + timedelta(days=1)
    else:
        dt_et = datetime.strptime(date_str, "%Y-%m-%d").replace(hour=hr_et, minute=0, second=0, tzinfo=timezone.utc)
    dt_utc = dt_et + ET_OFFSET
    return dt_utc.isoformat().replace("+00:00", "Z")

def calc_swarm(row):
    tradables = ["xrp","sol","doge","bnb","hype"]
    up = sum(1 for c in tradables if row.get(c) == "UP")
    down = sum(1 for c in tradables if row.get(c) == "DOWN")
    if up >= 4: return "UP"
    if down >= 4: return "DOWN"
    return "MIXED"

def build_records():
    records = []
    for date_str, hours in CSV_HISTORY.items():
        for hr_et, row in hours.items():
            # Skip rows with all None
            vals = [v for v in row.values() if v is not None]
            if len(vals) < 3:
                continue
            # Fill None with placeholder (skip those coins)
            ts = hr_et_to_utc_iso(date_str, hr_et)
            # UTC hour for storage
            utc_hour = int(ts[11:13])
            swarm = calc_swarm(row)
            btc = row.get("btc") or "UP"
            eth = row.get("eth") or "UP"
            rec = {
                "hour": utc_hour,
                "timestampISO": ts,
                "btc": btc,
                "eth": eth,
                "xrp": row.get("xrp") or "UP",
                "sol": row.get("sol") or "UP",
                "doge": row.get("doge") or "UP",
                "bnb": row.get("bnb") or "UP",
                "hype": row.get("hype") or "UP",
                "swarmConsensus": swarm,
                "btcAltDivergence": btc != swarm and swarm != "MIXED",
                "source": "csv_manual"
            }
            records.append(rec)
    return records

if __name__ == "__main__":
    data_path = "/home/anton/criptobot/data/tabla_simple_1h.json"
    
    # Cargar existente
    with open(data_path) as f:
        existing = json.load(f)
    
    existing_ts = set(r["timestampISO"] for r in existing)
    print(f"Registros existentes: {len(existing)}")
    
    new_records = build_records()
    added = 0
    for rec in new_records:
        if rec["timestampISO"] not in existing_ts:
            existing.append(rec)
            existing_ts.add(rec["timestampISO"])
            added += 1
    
    # Ordenar por fecha desc
    existing.sort(key=lambda x: x["timestampISO"], reverse=True)
    
    with open(data_path, "w") as f:
        json.dump(existing, f, indent=2)
    
    print(f"Registros importados del CSV: {added}")
    print(f"Total registros ahora: {len(existing)}")
    
    # Resumen por fecha
    from collections import defaultdict
    by_date = defaultdict(int)
    for r in existing:
        by_date[r["timestampISO"][:10]] += 1
    print("\nResumen por fecha:")
    for d in sorted(by_date.keys()):
        src = "📊 bot" if any(r.get("source") != "csv_manual" for r in existing if r["timestampISO"][:10] == d) else "📝 csv"
        print(f"  {d}: {by_date[d]} registros {src}")
