import os

server_ts_path = '/home/anton/criptobot/src/dashboard/server.ts'
with open(server_ts_path, 'r') as f:
    code = f.read()

# Make sure buildStatus includes accumulation, collector, shadowSignals
old_return = """    return {
      success: true,"""

new_return = """    const accumulation = await this.getAccumulationMetrics();
    const collector = await this.getCollectorMetrics();
    const shadowSignals = await this.getRecentShadowSignals();

    return {
      accumulation,
      collector,
      shadowSignals,
      success: true,"""

if 'accumulation,' not in code and 'const accumulation = await this.getAccumulationMetrics();' not in code:
    code = code.replace(old_return, new_return)

with open(server_ts_path, 'w') as f:
    f.write(code)

print("✅ server.ts actualizado con el payload completo en buildStatus.")
