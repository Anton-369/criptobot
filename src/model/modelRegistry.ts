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

export interface ModelManifest {
  model_id: string;
  version: string;
  created_at: string;
  coins: Record<string, CoinCalibration>;
}

export class ModelRegistry {
  private manifest: ModelManifest | null = null;
  // Strictly enable only coins with valid OOS calibration folds >= 500
  private activeCoins: Set<string> = new Set(['XRPUSDT', 'SOLUSDT']);

  constructor(private paramsPath: string) {
    this.loadModels();
  }

  public loadModels(): void {
    const candidatePaths = [
      this.paramsPath,
      path.resolve(__dirname, '../../data/parametros_calibrados.json'),
      '/home/anton/oraculo-calibracion/data/parametros_calibrados.json'
    ];

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf-8');
          const data = JSON.parse(raw);

          if (data && data.coins && Object.keys(data.coins).length > 0) {
            this.manifest = {
              model_id: data.model_id || 'logit_etapa1_binance_6m',
              version: data.version || '3.0.0',
              created_at: data.created_at || data.generado || new Date().toISOString(),
              coins: data.coins
            };
            console.log(`[ModelRegistry] 🧠 Loaded model manifest from '${p}' with ${Object.keys(this.manifest.coins).length} coins.`);
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

  public getCalibration(symbol: string): CoinCalibration | null {
    if (!this.manifest || !this.manifest.coins) return null;
    const key = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : symbol.toUpperCase() + 'USDT';

    // Safety guard: return calibration ONLY if active
    if (!this.isCoinActive(key)) {
      return null;
    }

    const calib = this.manifest.coins[key];
    if (calib && calib.metricas_oos && calib.metricas_oos.n_folds >= 500) {
      return calib;
    }
    return null;
  }
}
