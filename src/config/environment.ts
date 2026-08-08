import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: '/home/anton/alpha-os/.env.clob' });

export const CONFIG = {
  EXECUTION_MODE: (process.env.EXECUTION_MODE || 'SHADOW') as 'SHADOW' | 'LIVE',
  POLYGON_RPC_URL: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
  PK: process.env.PK || process.env.PM_PRIVATE_KEY || '',
  PROXY_WALLET: process.env.PROXY_WALLET || process.env.CLOB_ADDRESS || '0xe57Ef37c17df560084fF3C1EB7bb3e9fdcCfA300',
  EOA_WALLET: process.env.EOA_WALLET || process.env.EOA_ADDRESS || '0xa19b8118Cd5bF919214a6B43858401444Fc1B079',
  CLOB_API_URL: 'https://clob.polymarket.com',
  CHAIN_ID: 137, // Polygon Mainnet
  
  // Binance WS Base URL
  BINANCE_WS_URL: 'wss://stream.binance.com:9443/ws',
  
  // Tracked Trading Pairs
  PAIRS: [
    { coin: 'XRP', symbol: 'xrpusdt' },
    { coin: 'SOL', symbol: 'solusdt' },
    { coin: 'DOGE', symbol: 'dogeusdt' }
  ],
  
  // Bullet Sizing & Risk Rules
  DEFAULT_BULLET_USDC: 2.00,
  SOL_INSURANCE_BULLET_USDC: 1.00,
  TOTAL_MAX_CAPITAL_USDC: 13.00,
};
