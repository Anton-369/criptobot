const { CONFIG } = require("./dist/config/environment.js");
const { ClobClient } = require("@polymarket/clob-client");
const { Wallet } = require("ethers");
const w = new Wallet(CONFIG.PK);
const creds = {key:process.env.CLOB_API_KEY||"", secret:process.env.CLOB_SECRET||"", passphrase:process.env.CLOB_PASSPHRASE||""};
// Try EOA sigType 0
const clob = new ClobClient(CONFIG.CLOB_API_URL, 137, w, creds, 0, CONFIG.PROXY_WALLET);
clob.getBalanceAllowance({ asset_type: "COLLATERAL" }).then(r => console.log("EOA(0):", JSON.stringify(r))).catch(e => console.error("ERR:", e.message));
