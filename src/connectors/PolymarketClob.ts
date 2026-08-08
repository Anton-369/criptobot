import { ClobClient } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { CONFIG } from '../config/environment';

export interface Polymarket1HMarket {
  coin: string;
  question: string;
  conditionId: string;
  upTokenId: string;
  downTokenId: string;
  slug: string;
  endDateISO: string;
}

export interface BestOdds {
  upBestAsk: number;    // Lowest price to BUY UP
  downBestAsk: number;  // Lowest price to BUY DOWN
  upBestBid: number;    // Highest price to SELL UP
  downBestBid: number;  // Highest price to SELL DOWN
}

export class PolymarketClobConnector {
  private clobClient: ClobClient | null = null;
  private activeMarkets: Map<string, Polymarket1HMarket> = new Map(); // key: coin (XRP, SOL, DOGE)

  constructor() {
    if (CONFIG.PK) {
      try {
        const wallet = new Wallet(CONFIG.PK);
        const creds = {
          key: process.env.CLOB_API_KEY || '',
          secret: process.env.CLOB_SECRET || '',
          passphrase: process.env.CLOB_PASSPHRASE || ''
        };
        this.clobClient = new ClobClient(
          CONFIG.CLOB_API_URL,
          CONFIG.CHAIN_ID,
          wallet,
          creds,
          3 as any, // SignatureType.POLY_GNOSIS_SAFE / Proxy Wallet
          CONFIG.PROXY_WALLET
        );
      } catch (err) {
        console.warn(`[PolyCLOB] No se pudo autenticar cliente privado. Usando modo público.`);
      }
    }
  }

  public async getCollateralBalance(): Promise<number> {
    if (!this.clobClient) return 0;
    try {
      const res: any = await this.clobClient.getBalanceAllowance({ asset_type: 'COLLATERAL' as any });
      if (res && res.balance) {
        return parseFloat(res.balance) / 1e6;
      }
    } catch (err: any) {
      console.warn(`[PolyCLOB] Error consultando collateral balance: ${err.message}`);
    }
    return 0;
  }

  public async fetchActive1HMarkets(): Promise<Map<string, Polymarket1HMarket>> {
    try {
      // Query Polymarket Gamma API for open events ordered by startDate descending to capture live 5m/15m/1h Up or Down markets
      const url = `https://gamma-api.polymarket.com/events?closed=false&order=startDate&ascending=false&limit=300`;
      const resp = await fetch(url);

      if (resp.ok) {
        const events: any = await resp.json();

        if (Array.isArray(events)) {
          const nowMs = Date.now();
          const oneDayMs = 24 * 60 * 60 * 1000;

          for (const ev of events) {
            const title = (ev.title || '').toUpperCase();
            const slug = (ev.slug || '').toLowerCase();
            
            for (const pair of CONFIG.PAIRS) {
              const coin = pair.coin; // XRP, SOL, DOGE
              
              const isMatch = (
                title.includes(coin) ||
                (coin === 'DOGE' && (title.includes('DOGECOIN') || slug.includes('doge'))) ||
                (coin === 'SOL' && (title.includes('SOLANA') || slug.includes('sol'))) ||
                slug.includes(coin.toLowerCase())
              );

              if (isMatch && ev.markets && ev.markets.length > 0) {
                for (const m of ev.markets) {
                  const q = (m.question || ev.title || '').toUpperCase();
                  const s = slug.toLowerCase();

                  // STRICT 1-HOUR MARKET FILTER: Exclude 5-minute and 15-minute micro markets
                  const isMicroMarket = s.includes('-5m-') || s.includes('-15m-') || q.includes('5M-') || q.includes('15M-') || q.includes('5-MINUTE') || q.includes('15-MINUTE');
                  if (isMicroMarket) continue;

                  const endDateMs = m.endDateIso ? new Date(m.endDateIso).getTime() : (ev.endDate ? new Date(ev.endDate).getTime() : 0);
                  
                  // Must be a 1-Hour Up or Down market or end within 48 hours
                  const is1HMarket = (q.includes('UP OR DOWN') || q.includes('1H') || q.includes('HOURLY')) && (endDateMs > 0 ? (endDateMs - nowMs) <= (48 * 60 * 60 * 1000) : true);

                  if (is1HMarket) {
                    const clobTokenIds = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;

                    if (Array.isArray(clobTokenIds) && clobTokenIds.length >= 2) {
                      const marketObj: Polymarket1HMarket = {
                        coin: coin,
                        question: m.question || ev.title,
                        conditionId: m.conditionId,
                        upTokenId: clobTokenIds[0],
                        downTokenId: clobTokenIds[1],
                        slug: ev.slug || '',
                        endDateISO: m.endDateIso || ev.endDate || ''
                      };

                      // Set active 1-Hour market
                      if (!this.activeMarkets.has(coin) || q.includes('UP OR DOWN')) {
                        this.activeMarkets.set(coin, marketObj);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[PolyCLOB] Error consultando mercados activos de Polymarket: ${err.message}`);
    }

    return this.activeMarkets;
  }

  public async getBestOdds(upTokenId: string, downTokenId: string): Promise<BestOdds> {
    const odds: BestOdds = { upBestAsk: 1.0, downBestAsk: 1.0, upBestBid: 0.0, downBestBid: 0.0 };

    try {
      // Query orderbook for UP token
      const urlUp = `${CONFIG.CLOB_API_URL}/book?token_id=${upTokenId}`;
      const respUp = await fetch(urlUp);

      if (respUp.ok) {
        const dataUp: any = await respUp.json();
        if (dataUp && Array.isArray(dataUp.asks) && dataUp.asks.length > 0) {
          odds.upBestAsk = parseFloat(dataUp.asks[0].price);
        }
        if (dataUp && Array.isArray(dataUp.bids) && dataUp.bids.length > 0) {
          odds.upBestBid = parseFloat(dataUp.bids[0].price);
        }
      }

      // Query orderbook for DOWN token
      const urlDown = `${CONFIG.CLOB_API_URL}/book?token_id=${downTokenId}`;
      const respDown = await fetch(urlDown);

      if (respDown.ok) {
        const dataDown: any = await respDown.json();
        if (dataDown && Array.isArray(dataDown.asks) && dataDown.asks.length > 0) {
          odds.downBestAsk = parseFloat(dataDown.asks[0].price);
        }
        if (dataDown && Array.isArray(dataDown.bids) && dataDown.bids.length > 0) {
          odds.downBestBid = parseFloat(dataDown.bids[0].price);
        }
      }

    } catch (err: any) {
      // Soft fallback for network timeouts
    }

    return odds;
  }

  public getActiveMarket(coin: string): Polymarket1HMarket | undefined {
    return this.activeMarkets.get(coin.toUpperCase());
  }

  public getClobClient(): ClobClient | null {
    return this.clobClient;
  }
}
