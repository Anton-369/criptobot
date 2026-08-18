import { TokenMapping } from '../v4/LocalOrderbook';
import { ClobClient, Chain } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
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
  upAskDepth: number;   // Total size at best ask (shares)
  downAskDepth: number; // Total size at best ask (shares)
}

export class PolymarketClobConnector {
  private clobClient: ClobClient | null = null;
  private activeMarkets: Map<string, Polymarket1HMarket> = new Map(); // key: coin (XRP, SOL, DOGE)
  private proxyAgent: HttpsProxyAgent | null = null;

  constructor() {
    if (CONFIG.HTTP_PROXY) {
      const agent = new HttpsProxyAgent(CONFIG.HTTP_PROXY);
      this.proxyAgent = agent;
      axios.defaults.httpsAgent = agent;
      axios.defaults.httpAgent = agent;
      console.log(`[PolyCLOB] 🌐 Proxy HTTP configurado correctamente: ${CONFIG.HTTP_PROXY} (Bypassing Geoblock)`);
    }

    if (CONFIG.PK) {
      try {
        const wallet = new Wallet(CONFIG.PK) as any;
        const creds = {
          key: process.env.CLOB_API_KEY || '',
          secret: process.env.CLOB_SECRET || '',
          passphrase: process.env.CLOB_PASSPHRASE || ''
        };
        this.clobClient = new ClobClient(
          CONFIG.CLOB_API_URL,
          Chain.POLYGON,
          wallet,
          creds,
          3 as any, // POLY_1271 — el correcto para esta cuenta (verificado en Washybot)
          CONFIG.PROXY_WALLET
        );
        console.log("[PolyCLOB] Cliente TypeScript oficial v5 inicializado con Proxy Wallet (POLY_1271).");
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
      // Query Polymarket Gamma API specifically for tag_slug=1h ordered by endDate ascending
      const url = `https://gamma-api.polymarket.com/events?tag_slug=1h&closed=false&order=endDate&ascending=true&limit=100`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });

      if (resp.ok) {
        const events: any = await resp.json();

        if (Array.isArray(events)) {
          const nowMs = Date.now();
          const candidateMarkets = new Map<string, { market: Polymarket1HMarket; diffMins: number }>();

          for (const ev of events) {
            const title = (ev.title || '').toUpperCase();
            const slug = (ev.slug || '').toLowerCase();
            
            for (const pair of CONFIG.PAIRS) {
              const coin = pair.coin;
              
              const isMatch = (
                title.includes(coin) ||
                (coin === 'BTC' && (title.includes('BITCOIN') || slug.includes('bitcoin'))) ||
                (coin === 'ETH' && (title.includes('ETHEREUM') || slug.includes('ethereum'))) ||
                (coin === 'DOGE' && (title.includes('DOGECOIN') || slug.includes('doge'))) ||
                (coin === 'SOL' && (title.includes('SOLANA') || slug.includes('sol'))) ||
                (coin === 'BNB' && (title.includes('BNB') || slug.includes('bnb'))) ||
                (coin === 'HYPE' && (title.includes('HYPE') || slug.includes('hype'))) ||
                slug.includes(coin.toLowerCase())
              );

              if (isMatch && ev.markets && ev.markets.length > 0) {
                for (const m of ev.markets) {
                  const q = (m.question || ev.title || '').toUpperCase();
                  const s = slug.toLowerCase();

                  // STRICT 1-HOUR MARKET FILTER: Exclude 5-minute and 15-minute micro markets
                  const isMicroMarket = s.includes('-5m-') || s.includes('-15m-') || q.includes('5M-') || q.includes('15M-') || q.includes('5-MINUTE') || q.includes('15-MINUTE')
                    || /\\d{1,2}:\\d{2}\\s*(AM|PM)\\s*-\\s*\\d{1,2}:\\d{2}\\s*(AM|PM)/i.test(q); // time ranges like "11:50AM-11:55AM"
                  if (isMicroMarket) continue;

                  const endDateMs = ev.endDate ? new Date(ev.endDate).getTime() : (m.endDateIso ? new Date(m.endDateIso).getTime() : (m.endDate ? new Date(m.endDate).getTime() : 0));
                  const diffMins = (endDateMs - nowMs) / (60 * 1000);

                  // Must be a 1-Hour Up or Down market ending in the current/next cycle (0 to 120 minutes from now)
                  const is1HMarket = (q.includes('UP OR DOWN') || q.includes('1H') || q.includes('HOURLY')) && (diffMins > 0 && diffMins <= 120);

                  if (is1HMarket) {
                    const clobTokenIds = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;

                    if (Array.isArray(clobTokenIds) && clobTokenIds.length >= 2) {
                      // Map outcomes to tokens instead of assuming [0]=UP, [1]=DOWN
                      let upTokenId = clobTokenIds[0];
                      let downTokenId = clobTokenIds[1];
                      if (m.outcomes && Array.isArray(m.outcomes)) {
                        for (let oi = 0; oi < m.outcomes.length && oi < clobTokenIds.length; oi++) {
                          const label = (m.outcomes[oi] || '').toUpperCase();
                          if (label === 'YES' || label === 'UP') upTokenId = clobTokenIds[oi];
                          if (label === 'NO' || label === 'DOWN') downTokenId = clobTokenIds[oi];
                        }
                      }
                      const marketObj: Polymarket1HMarket = {
                        coin: coin,
                        question: m.question || ev.title,
                        conditionId: m.conditionId,
                        upTokenId: upTokenId,
                        downTokenId: downTokenId,
                        slug: ev.slug || '',
                        endDateISO: m.endDateIso || ev.endDate || ''
                      };

                      // Pick the market with the smallest positive time difference (the immediate active hour)
                      const existing = candidateMarkets.get(coin);
                      if (!existing || diffMins < existing.diffMins) {
                        candidateMarkets.set(coin, { market: marketObj, diffMins });
                      }
                    }
                  }
                }
              }
            }
          }

          // Populate activeMarkets with closest active hourly markets
          this.activeMarkets.clear();
          for (const [coin, item] of candidateMarkets.entries()) {
            this.activeMarkets.set(coin, item.market);
          }
        }
      }
    } catch (err: any) {
      console.error(`[PolyCLOB] Error consultando mercados activos de Polymarket: ${err.message}`);
    }

    return this.activeMarkets;
  }

  public async getBestOdds(upTokenId: string, downTokenId: string): Promise<BestOdds> {
    const odds: BestOdds = { upBestAsk: 1.0, downBestAsk: 1.0, upBestBid: 0.0, downBestBid: 0.0, upAskDepth: 0, downAskDepth: 0 };

    try {
      // Query orderbook for UP token
      const urlUp = `${CONFIG.CLOB_API_URL}/book?token_id=${upTokenId}`;
      const respUp = await fetch(urlUp, { signal: AbortSignal.timeout(3000) });

      if (respUp.ok) {
        const dataUp: any = await respUp.json();
        if (dataUp && Array.isArray(dataUp.asks) && dataUp.asks.length > 0) {
          const askPrices = dataUp.asks.map((a: any) => parseFloat(a.price)).filter((p: number) => !isNaN(p) && p > 0);
          if (askPrices.length > 0) odds.upBestAsk = Math.min(...askPrices);
          // Sum size at best ask level for depth check
          odds.upAskDepth = dataUp.asks
            .filter((a: any) => Math.abs(parseFloat(a.price) - odds.upBestAsk) < 0.0001)
            .reduce((sum: number, a: any) => sum + (parseFloat(a.size) || 0), 0);
        }
        if (dataUp && Array.isArray(dataUp.bids) && dataUp.bids.length > 0) {
          const bidPrices = dataUp.bids.map((b: any) => parseFloat(b.price)).filter((p: number) => !isNaN(p) && p > 0);
          if (bidPrices.length > 0) odds.upBestBid = Math.max(...bidPrices);
        }
      }

      // Query orderbook for DOWN token
      const urlDown = `${CONFIG.CLOB_API_URL}/book?token_id=${downTokenId}`;
      const respDown = await fetch(urlDown, { signal: AbortSignal.timeout(3000) });

      if (respDown.ok) {
        const dataDown: any = await respDown.json();
        if (dataDown && Array.isArray(dataDown.asks) && dataDown.asks.length > 0) {
          const askPrices = dataDown.asks.map((a: any) => parseFloat(a.price)).filter((p: number) => !isNaN(p) && p > 0);
          if (askPrices.length > 0) odds.downBestAsk = Math.min(...askPrices);
          // Sum size at best ask level for depth check
          odds.downAskDepth = dataDown.asks
            .filter((a: any) => Math.abs(parseFloat(a.price) - odds.downBestAsk) < 0.0001)
            .reduce((sum: number, a: any) => sum + (parseFloat(a.size) || 0), 0);
        }
        if (dataDown && Array.isArray(dataDown.bids) && dataDown.bids.length > 0) {
          const bidPrices = dataDown.bids.map((b: any) => parseFloat(b.price)).filter((p: number) => !isNaN(p) && p > 0);
          if (bidPrices.length > 0) odds.downBestBid = Math.max(...bidPrices);
        }
      }

    } catch (err: any) {
      // Soft fallback for network timeouts
    }

    return odds;
  }

  public async validateOrderbookLiquidity(tokenId: string, requiredShares: number, maxPrice: number = 0.95): Promise<{ isValid: boolean; bestAsk: number; depth: number; reason: string }> {
    try {
      const url = `${CONFIG.CLOB_API_URL}/book?token_id=${tokenId}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const data: any = await resp.json();
        if (data && Array.isArray(data.asks) && data.asks.length > 0) {
          const validAsks = data.asks
            .map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
            .filter((a: any) => !isNaN(a.price) && a.price > 0 && a.price <= maxPrice);

          if (validAsks.length === 0) {
            return { isValid: false, bestAsk: 1.0, depth: 0, reason: `No hay asks por debajo del precio máximo $${maxPrice}` };
          }

          const bestAsk = Math.min(...validAsks.map((a: any) => a.price));
          const depthAtBest = validAsks
            .filter((a: any) => Math.abs(a.price - bestAsk) < 0.0001)
            .reduce((sum: number, a: any) => sum + a.size, 0);

          if (depthAtBest < requiredShares) {
            return { isValid: false, bestAsk, depth: depthAtBest, reason: `Profundidad insuficiente (${depthAtBest.toFixed(1)} < ${requiredShares.toFixed(1)} acciones requeridas)` };
          }

          return { isValid: true, bestAsk, depth: depthAtBest, reason: 'Liquidez y precio verificados en Orderbook CLOB' };
        }
      }
    } catch (e: any) {
      return { isValid: false, bestAsk: 1.0, depth: 0, reason: `Error consultando orderbook: ${e.message}` };
    }
    return { isValid: false, bestAsk: 1.0, depth: 0, reason: 'Orderbook vacío o no disponible' };
  }

  public getActiveMarket(coin: string): Polymarket1HMarket | undefined {
    return this.activeMarkets.get(coin.toUpperCase());
  }

  
  public async preflightLiveCheck(): Promise<{ ok: boolean; balanceUSDC: number; reason: string }> {
    try {
      const bal = await this.getCollateralBalance();
      if (bal < 1.0) {
        return { ok: false, balanceUSDC: bal, reason: 'INSUFFICIENT_USDC_BALANCE: Balance $' + bal.toFixed(2) + ' USD < .00 USD required' };
      }
      if (!this.clobClient) {
        return { ok: false, balanceUSDC: bal, reason: 'CLOB_CLIENT_NOT_AUTHENTICATED: EIP-712 Private Key or CLOB credentials missing' };
      }
      return { ok: true, balanceUSDC: bal, reason: 'LIVE_PREFLIGHT_OK' };
    } catch (err: any) {
      return { ok: false, balanceUSDC: 0, reason: 'PREFLIGHT_ERROR: ' + err.message };
    }
  }

  public getClobClient(): ClobClient | null {
    return this.clobClient;
  }

    public async fetchActiveAllMarkets(): Promise<TokenMapping[]> {
    const mappings: TokenMapping[] = [];
    const targetCoins = ['SOL', 'XRP', 'DOGE', 'BNB', 'HYPE'];
    const timeframes: ('5M' | '15M' | '1H')[] = ['5M', '15M', '1H'];
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    const nowMs = Date.now();

    for (const tf of timeframes) {
      try {
        const slugTf = tf.toLowerCase();
        const url = `https://gamma-api.polymarket.com/events?tag_slug=${slugTf}&closed=false&order=endDate&ascending=true&limit=100`;
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          const events: any = await resp.json();
          if (Array.isArray(events)) {
            for (const coin of targetCoins) {
              let bestEv: any = null;
              let minDiff = Infinity;

              for (const ev of events) {
                const slug = (ev.slug || '').toLowerCase();
                const title = (ev.title || '').toLowerCase();

                if (slug.includes('bitcoin') || slug.includes('btc') || slug.includes('ethereum') || slug.includes('eth-')) continue;

                let match = false;
                if (coin === 'SOL' && (slug.includes('sol') || title.includes('solana'))) match = true;
                else if (coin === 'XRP' && (slug.includes('xrp') || title.includes('xrp'))) match = true;
                else if (coin === 'DOGE' && (slug.includes('doge') || title.includes('dogecoin'))) match = true;
                else if (coin === 'BNB' && (slug.includes('bnb') || title.includes('bnb'))) match = true;
                else if (coin === 'HYPE' && (slug.includes('hype') || title.includes('hyperliquid'))) match = true;

                if (match && ev.markets && ev.markets.length > 0) {
                  const endIso = ev.endDate || ev.markets[0].endDateIso || ev.markets[0].endDate;
                  if (endIso) {
                    try {
                      const endMs = new Date(endIso).getTime();
                      const diffMs = endMs - nowMs;
                      if (diffMs > 0 && diffMs < minDiff) {
                        minDiff = diffMs;
                        bestEv = ev;
                      }
                    } catch (e) {}
                  }
                }
              }

              if (bestEv && bestEv.markets && bestEv.markets.length > 0) {
                const m = bestEv.markets[0];
                const clobIds = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
                if (Array.isArray(clobIds) && clobIds.length >= 2) {
                  let upTokenId = clobIds[0];
                  let downTokenId = clobIds[1];
                  if (m.outcomes && Array.isArray(m.outcomes)) {
                    for (let oi = 0; oi < m.outcomes.length && oi < clobIds.length; oi++) {
                      const label = (m.outcomes[oi] || '').toUpperCase();
                      if (label === 'YES' || label === 'UP') upTokenId = clobIds[oi];
                      if (label === 'NO' || label === 'DOWN') downTokenId = clobIds[oi];
                    }
                  }
                  mappings.push({ coin, timeframe: tf, side: 'UP', tokenId: upTokenId });
                  mappings.push({ coin, timeframe: tf, side: 'DOWN', tokenId: downTokenId });
                }
              }
            }
          }
        }
      } catch (e: any) {}
    }
    return mappings;
  }
}
