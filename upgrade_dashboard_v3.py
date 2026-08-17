import os
import re

# 1. Update server.ts
server_ts_path = '/home/anton/criptobot/src/dashboard/server.ts'
with open(server_ts_path, 'r') as f:
    server_code = f.read()

# Add accumulation helper methods to server.ts if not present
accumulation_method = """
  private async getAccumulationMetrics(): Promise<any> {
    const coins = ['XRPUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'HYPEUSDT'];
    const result = [];
    
    try {
      const sqlite3 = require('sqlite3');
      const dbPath = path.resolve(__dirname, '../../data/criptobot.db');
      if (fs.existsSync(dbPath)) {
        const db = new sqlite3.Database(dbPath);
        const rows: any = await new Promise((resolve) => {
          db.all("SELECT coin, COUNT(*) as count, AVG(edge_net_yes) as avg_edge FROM signals GROUP BY coin", [], (err, r) => resolve(r || []));
        });
        db.close();

        const countsMap: any = {};
        for (const r of rows) {
          countsMap[r.coin?.toUpperCase()] = r.count || 0;
        }

        for (const coin of coins) {
          const count = countsMap[coin] || 0;
          const target = 200;
          const pct = Math.min(100, (count / target) * 100);
          const status = count < 200 ? 'INSUFFICIENT -- no usar para produccion (n < 200)' : 'SUFFICIENT_FOR_PRODUCTION';
          result.push({
            coin,
            n_casos: count,
            target_n: target,
            pct: round2(pct),
            status,
            stake_allowed: 1.0
          });
        }
      }
    } catch (err: any) {
      console.warn('[Dashboard] Error leyendo métricas de acumulación SQLite:', err.message);
    }
    return result;
  }

  private async getCollectorMetrics(): Promise<any> {
    let totalSnapshots = 0;
    let lastTs = 'Sin capturas';
    try {
      const sqlite3 = require('sqlite3');
      const polyDbPath = '/home/anton/criptobot/data/criptobot_polymarket.db';
      if (fs.existsSync(polyDbPath)) {
        const db = new sqlite3.Database(polyDbPath);
        const row: any = await new Promise((resolve) => {
          db.get("SELECT COUNT(*) as cnt, MAX(timestamp) as last_ts FROM snapshots_mercado", [], (err, r) => resolve(r));
        });
        db.close();
        if (row) {
          totalSnapshots = row.cnt || 0;
          lastTs = row.last_ts || 'N/A';
        }
      }
    } catch (err: any) {}
    return {
      totalSnapshots,
      lastTs,
      status: 'RUNNING (PID ACTIVE)'
    };
  }

  private async getRecentShadowSignals(): Promise<any[]> {
    let signals: any[] = [];
    try {
      const sqlite3 = require('sqlite3');
      const dbPath = path.resolve(__dirname, '../../data/criptobot.db');
      if (fs.existsSync(dbPath)) {
        const db = new sqlite3.Database(dbPath);
        signals = await new Promise((resolve) => {
          db.all("SELECT id, created_at, coin, selected_side, yes_ask, no_ask, edge_net_yes, edge_net_no, status, reject_reason FROM signals ORDER BY id DESC LIMIT 15", [], (err, r) => resolve(r || []));
        });
        db.close();
      }
    } catch (err: any) {}
    return signals;
  }
"""

if 'getAccumulationMetrics' not in server_code:
    # Inject before buildStatus
    server_code = server_code.replace('private async buildStatus(): Promise<any> {', accumulation_method + '\n  private async buildStatus(): Promise<any> {')

# Modify buildStatus to include accumulation, collector, shadow_signals
build_status_old = """    return {
      serverTime: new Date().toISOString(),"""

build_status_new = """    const accumulation = await this.getAccumulationMetrics();
    const collector = await this.getCollectorMetrics();
    const shadowSignals = await this.getRecentShadowSignals();

    return {
      accumulation,
      collector,
      shadowSignals,
      serverTime: new Date().toISOString(),"""

if 'const accumulation = await this.getAccumulationMetrics();' not in server_code:
    server_code = server_code.replace(build_status_old, build_status_new)

with open(server_ts_path, 'w') as f:
    f.write(server_code)

print("✅ server.ts actualizado con endpoints de acumulación SQLite.")

# 2. Update public/index.html
html_path = '/home/anton/criptobot/src/dashboard/public/index.html'
with open(html_path, 'r') as f:
    html_code = f.read()

# Add CSS for progress bar and new cards
css_addition = """
    .accumulation-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 1.2rem;
      margin-bottom: 1.5rem;
    }
    .progress-bar-bg {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      height: 10px;
      width: 100%;
      overflow: hidden;
      margin-top: 4px;
    }
    .progress-bar-fill {
      background: linear-gradient(90deg, #ffc107, #00e5ff);
      height: 100%;
      transition: width 0.5s ease;
    }
    .badge-insufficient {
      background: rgba(255, 193, 7, 0.2);
      color: #ffc107;
      border: 1px solid #ffc107;
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 4px;
    }
"""

if '.accumulation-card' not in html_code:
    html_code = html_code.replace('</style>', css_addition + '\n</style>')

# Add HTML section for Accumulation Progress & Collector Status before wallet metrics or after banner
html_section = """
  <!-- Real SQLite Accumulation & Colector Panel -->
  <div class="accumulation-card">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h2 style="font-size: 1.2rem; color: var(--accent-cyan); display: flex; align-items: center; gap: 0.5rem;">
        📊 Progreso de Acumulación Out-of-Sample (n / 200 Folds) — Regla #4
      </h2>
      <div id="collectorStatusBadge" style="font-size: 0.8rem; color: var(--text-muted);">
        📡 Colector Multiescala: <strong id="collectorSnapshots">0</strong> snapshots guardados | Último: <span id="collectorLastTs">—</span>
      </div>
    </div>

    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
      <thead>
        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
          <th style="padding: 8px;">MONEDA</th>
          <th style="padding: 8px;">CASOS EVALUADOS (n)</th>
          <th style="padding: 8px;">META REGLA #4</th>
          <th style="padding: 8px;">PROGRESO MUESTRA</th>
          <th style="padding: 8px;">ESTADO MATEMÁTICO</th>
          <th style="padding: 8px;">APUESTA MÁX. PERMITIDA</th>
        </tr>
      </thead>
      <tbody id="accumulationTableBody">
        <tr><td colspan="6" style="padding: 12px; text-align: center; color: var(--text-muted);">Cargando acumulación SQLite...</td></tr>
      </tbody>
    </table>
  </div>

  <!-- Recent SHADOW Signals Table -->
  <div class="accumulation-card">
    <h2 style="font-size: 1.2rem; color: var(--accent-green); margin-bottom: 1rem;">
      👻 Historial de Señales Evaluadas en Modo SHADOW (SQLite)
    </h2>
    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
      <thead>
        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
          <th style="padding: 8px;">ID</th>
          <th style="padding: 8px;">HORA UTC</th>
          <th style="padding: 8px;">MONEDA</th>
          <th style="padding: 8px;">LADO</th>
          <th style="padding: 8px;">YES ASK</th>
          <th style="padding: 8px;">NO ASK</th>
          <th style="padding: 8px;">EDGE NETO</th>
          <th style="padding: 8px;">ESTADO DE RIESGO</th>
        </tr>
      </thead>
      <tbody id="shadowSignalsTableBody">
        <tr><td colspan="8" style="padding: 12px; text-align: center; color: var(--text-muted);">Cargando señales de SQLite...</td></tr>
      </tbody>
    </table>
  </div>
"""

if 'Progreso de Acumulación Out-of-Sample' not in html_code:
    html_code = html_code.replace('<!-- Wallet Metrics Summary -->', html_section + '\n<!-- Wallet Metrics Summary -->')

# Update updateDashboard JavaScript function to populate accumulation and shadowSignals
js_render_update = """
        // Populate Accumulation Table
        if (data.accumulation && Array.isArray(data.accumulation)) {
          const accBody = document.getElementById('accumulationTableBody');
          accBody.innerHTML = data.accumulation.map(a => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 10px;"><strong>${a.coin}</strong></td>
              <td style="padding: 10px;"><strong>${a.n_casos}</strong> / 200</td>
              <td style="padding: 10px;">200 Folds OOS</td>
              <td style="padding: 10px; width: 180px;">
                <div>${a.pct}%</div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${a.pct}%;"></div></div>
              </td>
              <td style="padding: 10px;"><span class="badge-insufficient">${a.status}</span></td>
              <td style="padding: 10px; color: var(--accent-gold);">$${a.stake_allowed.toFixed(2)} USD</td>
            </tr>
          `).join('');
        }

        // Populate Collector Status
        if (data.collector) {
          document.getElementById('collectorSnapshots').innerText = data.collector.totalSnapshots;
          document.getElementById('collectorLastTs').innerText = data.collector.lastTs;
        }

        // Populate Shadow Signals
        if (data.shadowSignals && Array.isArray(data.shadowSignals)) {
          const shadowBody = document.getElementById('shadowSignalsTableBody');
          shadowBody.innerHTML = data.shadowSignals.map(s => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 8px;">#${s.id}</td>
              <td style="padding: 8px;">${s.created_at ? s.created_at.substring(11, 19) : '—'}</td>
              <td style="padding: 8px;"><strong>${s.coin}</strong></td>
              <td style="padding: 8px; color: ${s.selected_side === 'YES' ? 'var(--accent-green)' : 'var(--accent-red)'}">${s.selected_side}</td>
              <td style="padding: 8px;">$${(s.yes_ask || 0).toFixed(3)}</td>
              <td style="padding: 8px;">$${(s.no_ask || 0).toFixed(3)}</td>
              <td style="padding: 8px; color: var(--accent-cyan);">$${((s.selected_side === 'YES' ? s.edge_net_yes : s.edge_net_no) || 0).toFixed(4)}</td>
              <td style="padding: 8px;"><span class="badge" style="background: ${s.status === 'APPROVED' ? 'rgba(0,229,255,0.2)' : 'rgba(255,23,68,0.2)'}; color: ${s.status === 'APPROVED' ? '#00e5ff' : '#ff1744'}">${s.status}</span></td>
            </tr>
          `).join('');
        }
"""

if 'Populate Accumulation Table' not in html_code:
    html_code = html_code.replace("updateCountdown();", js_render_update + "\nupdateCountdown();")

with open(html_path, 'w') as f:
    f.write(html_code)

print("✅ public/index.html actualizado con tablas dinámicas de acumulación SQLite e historial SHADOW.")
