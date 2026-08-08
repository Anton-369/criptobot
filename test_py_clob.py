import os
import requests
from dotenv import load_dotenv
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import ApiCreds, OrderArgs, OrderType

load_dotenv("/home/anton/criptobot/.env")

pk = os.getenv("PK")
clob_key = os.getenv("CLOB_API_KEY")
clob_secret = os.getenv("CLOB_SECRET")
clob_pass = os.getenv("CLOB_PASSPHRASE")
proxy = os.getenv("PROXY_WALLET")

token_id = "29023348575504725690274431903643648294372029059375946169635609553566491992186"

print("--- Testing Python with sig_type=2 ---")
try:
    c2 = ClobClient("https://clob.polymarket.com", key=pk, chain_id=137, creds=ApiCreds(clob_key, clob_secret, clob_pass), signature_type=2, funder=proxy)
    o2 = c2.create_order(OrderArgs(token_id=token_id, price=0.99, size=5.0, side="BUY", fee_rate_bps=1000))
    o2.signature_type = 3
    resp2 = c2.post_order(o2, OrderType.FOK)
    print("Python SigType=2 Post Result:", resp2)
except Exception as e:
    print("Python SigType=2 Error:", e)

print("\n--- Testing Python with sig_type=3 ---")
try:
    c3 = ClobClient("https://clob.polymarket.com", key=pk, chain_id=137, creds=ApiCreds(clob_key, clob_secret, clob_pass), signature_type=3, funder=proxy)
    o3 = c3.create_order(OrderArgs(token_id=token_id, price=0.99, size=5.0, side="BUY", fee_rate_bps=1000))
    resp3 = c3.post_order(o3, OrderType.FOK)
    print("Python SigType=3 Post Result:", resp3)
except Exception as e:
    print("Python SigType=3 Error:", e)
