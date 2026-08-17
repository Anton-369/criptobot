import os

html_path = '/home/anton/criptobot/src/dashboard/public/index.html'
with open(html_path, 'r') as f:
    content = f.read()

# Replace hardcoded badge
content = content.replace(
    '<div class="badge badge-live" id="modeBadge">🔴 LIVE MODE</div>',
    '<div class="badge badge-shadow" id="modeBadge" style="background:rgba(255,193,7,0.2);color:#ffc107;border:1px solid #ffc107;">👻 SHADOW MODE (SIMULACIÓN)</div>'
)

# Replace static banner info
old_banner = """      <div class="banner-info">
        <h3>🎯 Ventana FOK Logit v3 + HYPE Micro-Momentum</h3>
        <p>Próxima evaluación automática de disparo al minuto <strong>:15:00 UTC</strong> (XRP y SOL).</p>
      </div>"""

new_banner = """      <div class="banner-info">
        <h3>🎯 Monitoreo Multiescala en Vivo (1h, 15m, 5m)</h3>
        <p id="subBannerStatus">Evaluando snapshots de Polymarket CLOB y Binance Spot en tiempo real.</p>
      </div>"""

content = content.replace(old_banner, new_banner)

# Replace updateCountdown logic to show real UTC Time
old_timer_fn = """    // Countdown Timer to Next Minute 15
    function updateCountdown() {
      const now = new Date();
      let target = new Date(now);
      
      const currentMin = now.getUTCMinutes();
      if (currentMin >= 15) {
        target.setUTCHours(target.getUTCHours() + 1);
      }
      target.setUTCMinutes(15, 0, 0);

      const diffMs = Math.max(0, target.getTime() - now.getTime());
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      
      document.getElementById('nextFiringTimer').innerText = 
        String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0') + ' UTC';
    }"""

new_timer_fn = """    // Live UTC Clock & Dynamic Status Update
    function updateCountdown() {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timeStr = pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes()) + ':' + pad(now.getUTCSeconds()) + ' UTC';
      document.getElementById('nextFiringTimer').innerText = timeStr;
    }"""

content = content.replace(old_timer_fn, new_timer_fn)

# Also update dynamic badge handling in updateDashboard
old_badge_js = "document.getElementById('modeBadge').innerText = data.balances.mode === 'LIVE' ? '🔴 LIVE MODE' : '👻 SHADOW MODE';"
new_badge_js = """const modeBadgeEl = document.getElementById('modeBadge');
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
          }"""

content = content.replace(old_badge_js, new_badge_js)

with open(html_path, 'w') as f:
    f.write(content)

# Also copy to dist if dist exists
dist_html_path = '/home/anton/criptobot/dist/dashboard/public/index.html'
if os.path.exists(os.path.dirname(dist_html_path)):
    os.makedirs(os.path.dirname(dist_html_path), exist_ok=True)
    with open(dist_html_path, 'w') as f:
        f.write(content)

print("✅ public/index.html y dist/dashboard/public/index.html actualizados limpiamente en VPS.")
