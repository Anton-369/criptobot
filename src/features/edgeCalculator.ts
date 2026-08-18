import { CoinCalibration } from '../model/modelRegistry';

export interface EdgeResult {
  p_ia: number;
  z: number;
  x1_norm: number;
  x2_norm: number;
  edge_gross_yes: number;
  edge_gross_no: number;
  edge_net_yes: number;
  edge_net_no: number;
  selected_side: 'YES' | 'NO' | 'NONE';
  selected_edge_net: number;
  target_ask_price: number;
  approved: boolean;
  reject_reason?: string;
}

export class EdgeCalculator {
  private static readonly ESTIMATED_COSTS = 0.015; // 1.5% buffer (fees + slippage + latency)
  private static readonly MIN_NET_EDGE = 0.04;      // Minimum +3% Net Edge required

  /**
   * Calculates Sigmoid Logit Probability and Net Edge against best_ask
   */
  public static calculateEdge(
    rachaDownRaw: number,
    deltaSpotRaw: number,
    calib: CoinCalibration,
    bestAskYes: number,
    bestAskNo: number
  ): EdgeResult {
    // 1. Standardize features using exact Python mean & std
    const meanRacha = calib.normalizacion_media[0];
    const meanDelta = calib.normalizacion_media[1];
    const stdRacha = calib.normalizacion_std[0];
    const stdDelta = calib.normalizacion_std[1];

    const x1_norm = (rachaDownRaw - meanRacha) / (stdRacha || 1);
    const x2_norm = (deltaSpotRaw - meanDelta) / (stdDelta || 1);

    // 2. Calculate Logit Z and Sigmoidal Probability P(IA)
    const z = calib.beta_0_intercept + (calib.beta_1_racha_down * x1_norm) + (calib.beta_2_delta_spot_temprano * x2_norm);
    const p_ia = 1 / (1 + Math.exp(-z));

    // 3. Calculate Gross and Net Edge for YES and NO
    const edge_gross_yes = p_ia - bestAskYes;
    const edge_gross_no = (1 - p_ia) - bestAskNo;

    const edge_net_yes = edge_gross_yes - this.ESTIMATED_COSTS;
    const edge_net_no = edge_gross_no - this.ESTIMATED_COSTS;

    let selected_side: 'YES' | 'NO' | 'NONE' = 'NONE';
    let selected_edge_net = 0;
    let target_ask_price = 0;

    // Evaluate best side
    if (edge_net_yes >= this.MIN_NET_EDGE && edge_net_yes >= edge_net_no && bestAskYes >= 0.55 && bestAskYes <= 0.60) {
      selected_side = 'YES';
      selected_edge_net = edge_net_yes;
      target_ask_price = bestAskYes;
    } else if (edge_net_no >= this.MIN_NET_EDGE && edge_net_no > edge_net_yes && bestAskNo >= 0.55 && bestAskNo <= 0.60) {
      selected_side = 'NO';
      selected_edge_net = edge_net_no;
      target_ask_price = bestAskNo;
    }

    const approved = selected_side !== 'NONE';
    let reject_reason: string | undefined;

    if (!approved) {
      reject_reason = `INSUFFICIENT_NET_EDGE: max_net_edge=${Math.max(edge_net_yes, edge_net_no).toFixed(4)} < min=${this.MIN_NET_EDGE}`;
    }

    return {
      p_ia,
      z,
      x1_norm,
      x2_norm,
      edge_gross_yes,
      edge_gross_no,
      edge_net_yes,
      edge_net_no,
      selected_side,
      selected_edge_net,
      target_ask_price,
      approved,
      reject_reason
    };
  }
}
