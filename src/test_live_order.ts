import { ClobClient, Chain, OrderType, Side, SignatureTypeV2 } from '@polymarket/clob-client-v2';
import { Wallet } from 'ethers';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/anton/criptobot/.env' });

async function testMarketOrder() {
  const pk = process.env.PK || '';
  const wallet = new Wallet(pk) as any;
  const proxy = process.env.PROXY_WALLET || '';
  const creds = {
    key: process.env.CLOB_API_KEY || '',
    secret: process.env.CLOB_SECRET || '',
    passphrase: process.env.CLOB_PASSPHRASE || ''
  };

  const gammaResp = await fetch("https://gamma-api.polymarket.com/events?tag_slug=1h&closed=false&limit=5");
  const events: any = await gammaResp.json();
  const rawTokens = events[0].markets[0].clobTokenIds;
  const tokenID = typeof rawTokens === 'string' ? JSON.parse(rawTokens)[0] : rawTokens[0];
  console.log("Active Market Question:", events[0].title);
  console.log("Active Market TokenID:", tokenID);

  try {
    const client = new ClobClient({
      host: "https://clob.polymarket.com",
      chain: Chain.POLYGON,
      signer: wallet,
      creds,
      signatureType: SignatureTypeV2.POLY_1271,
      funderAddress: proxy
    });

    console.log("Posting market order FOK with createAndPostMarketOrder...");
    const resp = await client.createAndPostMarketOrder({
      tokenID,
      price: 0.99,
      amount: 1.0,
      side: Side.BUY
    }, undefined, OrderType.FOK as any);
    console.log("V2 Market Order FOK Result:", JSON.stringify(resp));
  } catch (err: any) {
    console.error("V2 Error:", err.message || err);
  }
}

testMarketOrder();
