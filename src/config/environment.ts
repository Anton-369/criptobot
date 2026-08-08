import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const CONFIG = {
  EXECUTION_MODE: (process.env.EXECUTION_MODE || 'SHADOW') as 'SHADOW' | 'LIVE',
  POLYGON_RPC_URL: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
  PK: process.env.PK || '',
  PROXY_WALLET: process.env.PROXY_WALLET || '0x62BEa41a4F5ec0e65CD8B17e57c6efC11fC80844',
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
  SOL_INSURANCE_BULLET_USDC: 0.66,
  TOTAL_MAX_CAPITAL_USDC: 13.00,
};
