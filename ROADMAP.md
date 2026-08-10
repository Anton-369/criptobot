# 🗺️ CRIPTOBOT v2.0 — ROADMAP DE MEJORAS

*Auditoría completa: 10 de agosto 2026*

---

## 🚨 FASE 0 — INFRAESTRUCTURA CRÍTICA (fill rate: 2% → 95%)
- [ ] 0.1 Migrar a @polymarket/clob-client v5.8.1 oficial
- [ ] 0.2 Chequear profundidad del libro antes de FOK
- [ ] 0.3 User-Agent browser en data-api (403 fix)
- [ ] 0.4 Proxy consistente en todos los fetch

## 🛡️ FASE 1 — GUARDS DE RIESGO
- [ ] 1.1 Persistir exposición a JSON/SQLite (sobrevive restarts)
- [ ] 1.2 Corregir entryTimestamp en fetchLiveWalletPositions()
- [ ] 1.3 Kill switch diario (max loss $10 → SAFE_MODE shadow)

## 📊 FASE 2 — INTEGRIDAD DE DATOS
- [ ] 2.1 Regenerar matrix_seed.json desde el CSV real
- [ ] 2.2 Corregir recordHourOutcomes() (hora completada, no parcial)
- [ ] 2.3 Persistir historia live (append a JSON)
- [ ] 2.4 Eliminar defaults || 'UP' (datos fabricados)

## 🧠 FASE 3 — HALLAZGOS DE LOS ESTUDIOS (22% → 80%)
- [ ] 3.1 HYPE: BTC+ETH UP → 90.9% (señal más potente)
- [ ] 3.2 Sistema de scoring ponderado para HYPE (0-7 puntos)
- [ ] 3.3 Detección de divergencias (6 anomalías del estudio)
- [ ] 3.4 BNB CORE block (ETH+XRP+SOL) + BTC secundario
- [ ] 3.5 Corregir fuente de DOGE bias y SOL bias
- [ ] 3.6 Recalcular % desde datos reales (no hardcodear)

## ⚙️ FASE 4 — ROBUSTEZ OPERATIVA
- [ ] 4.1 Logs con timestamp ISO
- [ ] 4.2 Timeout AbortController en todos los fetch
- [ ] 4.3 Mapear clobTokenIds por outcomes
- [ ] 4.4 Filtro de micro-mercados con regex
- [ ] 4.5 Deduplicación de señales (reducir spam 8K+)
- [ ] 4.6 Limpiar DB corrupta + scripts legacy

---

## 📈 MÉTRICAS PRE-FASE 0
| Métrica | Valor |
|---|---|
| Fill rate LIVE | 2.3% (78/3339) |
| Rechazos "order version" | 1,463 |
| Rechazos "sin profundidad" | 1,599 |
| Errores "fee rate" | 32 |
| PnL acumulado (Aug 9+) | +$26.66 |
| Wallet total | $54.71 |
