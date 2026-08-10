import os
import json
from dotenv import load_dotenv
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import ApiCreds, OrderArgs, OrderType
from py_clob_client.utilities import order_to_json

load_dotenv("/home/anton/criptobot/.env")

pk = os.getenv("PK")
clob_key = os.getenv("CLOB_API_KEY")
clob_secret = os.getenv("CLOB_SECRET")
clob_pass = os.getenv("CLOB_PASSPHRASE")
proxy = os.getenv("PROXY_WALLET")

token_id = "29023348575504725690274431903643648294372029059375946169635609553566491992186"

client = ClobClient(
    host="https://clob.polymarket.com",
    key=pk,
    chain_id=137,
    creds=ApiCreds(api_key=clob_key, api_secret=clob_secret, api_passphrase=clob_pass),
    signature_type=2,
    funder=proxy
)

order = client.create_order(OrderArgs(
    token_id=token_id,
    price=0.99,
    size=10.0,
    side="BUY",
    fee_rate_bps=1000
))

payload = order_to_json(order, clob_key, OrderType.FOK)
print("Python Generated Payload:")
print(json.dumps(payload, indent=2))
