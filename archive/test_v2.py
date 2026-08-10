import os
import requests
from dotenv import load_dotenv
from py_clob_client_v2.client import ClobClient
from py_clob_client_v2.clob_types import ApiCreds, OrderArgs, OrderType

load_dotenv("/home/anton/criptobot/.env")

pk = os.getenv("PK")
clob_key = os.getenv("CLOB_API_KEY")
clob_secret = os.getenv("CLOB_SECRET")
clob_pass = os.getenv("CLOB_PASSPHRASE")
proxy = os.getenv("PROXY_WALLET")

token_id = "29023348575504725690274431903643648294372029059375946169635609553566491992186"

print("--- Testing py_clob_client_v2 in Python ---")
try:
    c = ClobClient(
        host="https://clob.polymarket.com",
        key=pk,
        chain_id=137,
        creds=ApiCreds(api_key=clob_key, api_secret=clob_secret, api_passphrase=clob_pass),
        signature_type=1,
        funder=proxy
    )
    order = c.create_order(OrderArgs(
        token_id=token_id,
        price=0.99,
        size=5.0,
        side="BUY"
    ))
    print("V2 Created Order:", order)
    resp = c.post_order(order, OrderType.FOK)
    print("V2 Post Order Success! Response:", resp)
except Exception as e:
    print("V2 Error:", e)
