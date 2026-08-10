const { CONFIG } = require("./dist/config/environment.js");
const { createL2Headers } = require("@polymarket/clob-client");
const { Wallet } = require("ethers");
const axios = require("axios");

async function main() {
  const w = new Wallet(CONFIG.PK);
  const creds = {key:process.env.CLOB_API_KEY||"", secret:process.env.CLOB_SECRET||"", passphrase:process.env.CLOB_PASSPHRASE||""};
  const endpoint = "https://clob.polymarket.com/balance-allowance";
  const now = Math.floor(Date.now() / 1000);
  const headerArgs = { method: "GET", requestPath: "/balance-allowance" };
  const headers = await createL2Headers(w, creds, headerArgs, now);
  const params = { asset_type: "COLLATERAL", funder_address: CONFIG.PROXY_WALLET };
  try {
    const res = await axios.get(endpoint, { headers, params });
    console.log("DIRECT:", JSON.stringify(res.data));
  } catch(e) {
    console.error("ERR:", e.message, e.response?.data);
  }
}
main();
