import os

html_path = '/home/anton/criptobot/src/dashboard/public/index.html'
with open(html_path, 'r') as f:
    html = f.read()

# Replace JS logic to ensure render code is INSIDE updateDashboard() function
old_update_dashboard = """    setInterval(updateDashboard, 3000);
    setInterval(updateCountdown, 1000);
    updateDashboard();

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

updateCountdown();"""

clean_fn = """
    async function updateDashboard() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();

        // Update Balances
        if (data.balances) {
          document.getElementById('totalUsdc').innerText = '$' + (data.balances.total || 0).toFixed(2);
          const modeBadgeEl = document.getElementById('modeBadge');
          if (data.balances && data.balances.mode === 'LIVE') {
            modeBadgeEl.innerText = '🔴 LIVE MODE (REAL)';
            modeBadgeEl.style.background = 'rgba(255, 23, 68, 0.2)';
            modeBadgeEl.style.color = '#ff1744';
            modeBadgeEl.style.border = '1px solid #ff1744';
          } else {
            modeBadgeEl.innerText = '👻 SHADOW MODE (SIMULACIÓN)';
            modeBadgeEl.style.background = 'rgba(255, 193, 7, 0.2)';
            modeBadgeEl.style.color = '#ffc107';
            modeBadgeEl.style.border = '1px solid #ffc107';
          }
        }

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
          document.getElementById('collectorLastTs').innerText = data.collector.lastTs ? data.collector.lastTs.substring(0, 19).replace('T', ' ') : '—';
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

        // Update Positions
        const posBody = document.getElementById('positionsTableBody');
        if (data.positions && data.positions.length > 0) {
          posBody.innerHTML = data.positions.map(p => `
            <tr>
              <td><strong>${p.coin}</strong></td>
              <td style="color: ${p.side === 'UP' || p.side === 'YES' ? 'var(--accent-green)' : 'var(--accent-red)'}">${p.side}</td>
              <td>$${(p.entryPrice || 0).toFixed(3)}</td>
              <td>$${(p.entryUSD || 0).toFixed(2)}</td>
              <td>${p.status}</td>
              <td>${p.openedAt ? p.openedAt.substring(11, 19) : '—'}</td>
            </tr>
          `).join('');
        } else {
          posBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1rem; color:var(--text-muted);">Sin posiciones abiertas activas en este ciclo.</td></tr>';
        }

        // Update Tickers Table
        const tickBody = document.getElementById('tickersTableBody');
        if (data.tickers && Array.isArray(data.tickers)) {
          tickBody.innerHTML = data.tickers.map(t => `
            <tr>
              <td><strong>${t.coin}</strong></td>
              <td>$${(t.binanceSpotPrice || 0).toFixed(4)}</td>
              <td style="color: ${(t.delta15mPct || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${(t.delta15mPct || 0).toFixed(2)}%</td>
              <td style="color: var(--accent-green)">$${(t.polymarketUpAsk || 0).toFixed(3)}</td>
              <td style="color: var(--accent-red)">$${(t.polymarketDownAsk || 0).toFixed(3)}</td>
              <td><span class="badge badge-wss">LOGIT V3 ACTIVE</span></td>
            </tr>
          `).join('');
        }

      } catch (err) {
        console.error('Error actualizando dashboard:', err);
      }
    }
"""

# Let's replace function updateDashboard in index.html cleanly
import re
html = re.sub(r'async function updateDashboard\(\) \{[\s\S]*?setInterval\(updateDashboard, 3000\);', clean_fn + '\n    setInterval(updateDashboard, 3000);', html)

with open(html_path, 'w') as f:
    f.write(html)

dist_html_path = '/home/anton/criptobot/dist/dashboard/public/index.html'
if os.path.exists(os.path.dirname(dist_html_path)):
    with open(dist_html_path, 'w') as f:
        f.write(html)

print("✅ public/index.html y dist/dashboard/public/index.html corregidos con ámbito de JavaScript válido.")
