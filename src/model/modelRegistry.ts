import * as fs from 'fs';
import * as path from 'path';

export interface CoinCalibration {
  beta_0_intercept: number;
  beta_1_racha_down: number;
  beta_2_delta_spot_temprano: number;
  normalizacion_media: [number, number]; // [mean_racha, mean_delta]
  normalizacion_std: [number, number];   // [std_racha, std_delta]
  metricas_oos: {
    n_folds: number;
    accuracy: number;
    logloss: number;
  };
}

export class ModelRegistry {
  private rawData: any = null;
  private isV2Manifest: boolean = false;
  private activeCoins: Set<string> = new Set([
    'XRPUSDT', 'SOLUSDT', 'DOGEUSDT', 'BNBUSDT', 'ETHUSDT', 'BTCUSDT', 'HYPEUSDT'
  ]);

  constructor(private paramsPath: string) {
    this.loadModels();
  }

  public loadModels(): void {
    const candidatePaths = [
      path.resolve(__dirname, '../../data/parametros_calibrados_v2.json'),
      this.paramsPath,
      path.resolve(__dirname, '../../data/parametros_calibrados.json'),
      '/home/anton/oraculo-calibracion/data/parametros_calibrados.json'
    ];

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf-8');
          const data = JSON.parse(raw);

          if (data && (data['XRPUSDT'] || data['SOLUSDT'])) {
            this.rawData = data;
            this.isV2Manifest = true;
            console.log(`[ModelRegistry] 🧠 Loaded v2 multi-cut manifest from '${p}' with ${Object.keys(data).length} coins.`);
            return;
          }

          if (data && data.coins && Object.keys(data.coins).length > 0) {
            this.rawData = data.coins;
            this.isV2Manifest = false;
            console.log(`[ModelRegistry] 🧠 Loaded v1 single-cut manifest from '${p}' with ${Object.keys(data.coins).length} coins.`);
            return;
          }
        }
      } catch (err) {
        console.error(`[ModelRegistry] ⚠️ Warning reading manifest at '${p}':`, err);
      }
    }

    console.warn(`[ModelRegistry] ⚠️ No valid calibration manifest found in candidate paths.`);
  }

  public isCoinActive(symbol: string): boolean {
    const key = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : symbol.toUpperCase() + 'USDT';
    return this.activeCoins.has(key);
  }

  public getCalibration(symbol: string, minute: number = 15): CoinCalibration | null {
    if (!this.rawData) return null;
    const key = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : symbol.toUpperCase() + 'USDT';

    if (!this.isCoinActive(key)) {
      return null;
    }

    if (this.isV2Manifest) {
      const coinCuts = this.rawData[key];
      if (!coinCuts) return null;

      let cutName = 'min_15';
      if (minute <= 8) {
        cutName = 'min_5';
      } else if (minute >= 22) {
        cutName = 'min_30';
      }

      const cutData = coinCuts[cutName] || coinCuts['min_15'] || coinCuts[Object.keys(coinCuts)[0]];
      if (!cutData) return null;

      return {
        beta_0_intercept: cutData.beta_0,
        beta_1_racha_down: cutData.beta_1_racha,
        beta_2_delta_spot_temprano: cutData.beta_2_momentum,
        normalizacion_media: cutData.normalizacion_media,
        normalizacion_std: cutData.normalizacion_std,
        metricas_oos: {
          n_folds: cutData.n_folds,
          accuracy: cutData.accuracy_oos,
          logloss: cutData.logloss_oos
        }
      };
    } else {
      const calib = this.rawData[key];
      if (calib && calib.metricas_oos && calib.metricas_oos.n_folds >= 400) {
        return calib;
      }
    }

    return null;
  }
}
