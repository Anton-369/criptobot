import os

server_ts_path = '/home/anton/criptobot/src/dashboard/server.ts'
with open(server_ts_path, 'r') as f:
    server_code = f.read()

# Replace round2 with Math.round
server_code = server_code.replace("pct: round2(pct),", "pct: Math.round(pct * 100) / 100,")
server_code = server_code.replace("(err, r) => resolve(r || [])", "(err: any, r: any) => resolve(r || [])")
server_code = server_code.replace("(err, r) => resolve(r)", "(err: any, r: any) => resolve(r)")

with open(server_ts_path, 'w') as f:
    f.write(server_code)

print("✅ server.ts corregido con tipos TypeScript válidos.")
