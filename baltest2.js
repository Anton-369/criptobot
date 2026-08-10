const { CONFIG } = require("./dist/config/environment.js");
const { ClobClient, SignatureType } = require("@polymarket/clob-client");
const { Wallet } = require("ethers");

async function main() {
  const w = new Wallet(CONFIG.PK);
  const creds = {key:process.env.CLOB_API_KEY||"", secret:process.env.CLOB_SECRET||"", passphrase:process.env.CLOB_PASSPHRASE||""};
  
  // Create client with POLY_GNOSIS_SAFE sigType (2) as a test
  const clob = new ClobClient(CONFIG.CLOB_API_URL, 137, w, creds, 2, CONFIG.PROXY_WALLET);
  try {
    const r = await clob.getBalanceAllowance({ asset_type: "COLLATERAL" });
    console.log("GNOSIS_SAFE:", JSON.stringify(r));
  } catch(e) {
    console.error("GS ERR:", e.message);
  }
}
main();
