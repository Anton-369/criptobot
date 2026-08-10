const { CONFIG } = require("./dist/config/environment.js");
const { ClobClient } = require("@polymarket/clob-client");
const { Wallet } = require("ethers");
const axios = require("axios");

async function main() {
  const w = new Wallet(CONFIG.PK);
  const creds = {key:process.env.CLOB_API_KEY||"", secret:process.env.CLOB_SECRET||"", passphrase:process.env.CLOB_PASSPHRASE||""};

  // Try sigType 3 (POLY_1271) — what Washybot uses
  const clob = new ClobClient(CONFIG.CLOB_API_URL, 137, w, creds, 3, CONFIG.PROXY_WALLET);
  try {
    const r = await clob.getBalanceAllowance({ asset_type: "COLLATERAL" });
    console.log("SIGTYPE=3:", JSON.stringify(r));
  } catch(e) {
    console.error("SIG3 ERR:", e.message, e.response?.data || "");
  }
}
main();
