import type { PredictionServiceHandler } from '../../../../src/generated/server/worldmonitor/prediction/v1/service_server';

import { getPredictionMarketDetail } from './get-prediction-market-detail';
import { listPredictionMarkets } from './list-prediction-markets';

export const predictionHandler: PredictionServiceHandler = {
  getPredictionMarketDetail,
  listPredictionMarkets,
};
