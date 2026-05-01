import api, { type ApiResult } from '@/utils/api';

let recommendationEndpointUnavailable = false;
const ENDPOINT_UNAVAILABLE_STORAGE_KEY = 'orderLearningRecommendationEndpointUnavailable';
const recommendationInflight = new Map<string, Promise<any>>();

const readEndpointUnavailable = () => {
  if (recommendationEndpointUnavailable) return true;
  try {
    const saved = String(sessionStorage.getItem(ENDPOINT_UNAVAILABLE_STORAGE_KEY) || '').trim();
    if (saved === '1') {
      recommendationEndpointUnavailable = true;
      return true;
    }
  } catch {}
  return false;
};

const markEndpointUnavailable = () => {
  recommendationEndpointUnavailable = true;
  try {
    sessionStorage.setItem(ENDPOINT_UNAVAILABLE_STORAGE_KEY, '1');
  } catch {}
};

const normalizeParamsKey = (params: { styleNo: string; orderQuantity?: number; factoryMode?: string; pricingMode?: string; currentUnitPrice?: number }) =>
  JSON.stringify({
    styleNo: String(params.styleNo || '').trim(),
    orderQuantity: params.orderQuantity ?? null,
    factoryMode: params.factoryMode ?? null,
    pricingMode: params.pricingMode ?? null,
    currentUnitPrice: params.currentUnitPrice ?? null,
  });

export interface OrderLearningCaseItem {
  orderNo?: string;
  factoryMode?: string;
  factoryName?: string;
  pricingMode?: string;
  selectedUnitPrice?: number;
  totalCostUnitPrice?: number;
  actualUnitCost?: number;
  orderQuantity?: number;
  delayDays?: number;
  scatterExtraPerPiece?: number;
  outcomeSummary?: string;
  createdAt?: string;
}

export interface SimilarStyleCaseItem {
  styleNo?: string;
  styleName?: string;
  factoryMode?: string;
  pricingMode?: string;
  selectedUnitPrice?: number;
  orderQuantity?: number;
  scatterExtraPerPiece?: number;
  outcomeSummary?: string;
  createdAt?: string;
}

export interface FactoryScoreItem {
  factoryMode?: string;
  factoryName?: string;
  orderCount?: number;
  avgUnitPrice?: number;
  avgDelayDays?: number;
  avgOutcomeScore?: number;
  scoreSummary?: string;
}

export interface OrderLearningRecommendationResponse {
  hasLearningData: boolean;
  styleNo?: string;
  sameStyleCaseCount?: number;
  recommendationTitle?: string;
  recommendationSummary?: string;
  recommendedFactoryMode?: string;
  recommendedPricingMode?: string;
  recommendedUnitPrice?: number;
  costInsight?: string;
  deliveryInsight?: string;
  riskInsight?: string;
  currentFactoryMode?: string;
  currentPricingMode?: string;
  currentUnitPrice?: number;
  factoryModeAligned?: boolean;
  pricingModeAligned?: boolean;
  extraUnitCostIfKeepCurrent?: number;
  extraTotalCostIfKeepCurrent?: number;
  gapInsight?: string;
  actionSuggestion?: string;
  confidenceLevel?: 'high' | 'medium' | 'low' | string;
  recommendationTags?: string[];
  recentCases?: OrderLearningCaseItem[];
  similarStyleCases?: SimilarStyleCaseItem[];
  factoryScores?: FactoryScoreItem[];
}

export const orderLearningApi = {
  async getRecommendation(params: { styleNo: string; orderQuantity?: number; factoryMode?: string; pricingMode?: string; currentUnitPrice?: number }) {
    if (readEndpointUnavailable()) {
      return { code: 200, data: null, message: 'order-learning recommendation endpoint unavailable' } as ApiResult<null>;
    }

    const requestKey = normalizeParamsKey(params);
    const existingRequest = recommendationInflight.get(requestKey);
    if (existingRequest) {
      return existingRequest;
    }

    const requestPromise = (async () => {
      try {
        return await api.get<ApiResult<OrderLearningRecommendationResponse>>('/intelligence/order-learning/recommendation', { params });
      } catch (error: unknown) {
        const status = typeof error === 'object' && error !== null && 'response' in error ? Number((error as Record<string, any>).response?.status || 0) : 0;
        if (status === 404 || status === 500) {
          if (status === 404) {
            markEndpointUnavailable();
          }
          return { code: 200, data: null, message: 'order-learning recommendation temporarily unavailable' } as ApiResult<null>;
        }
        throw error;
      } finally {
        recommendationInflight.delete(requestKey);
      }
    })();

    recommendationInflight.set(requestKey, requestPromise);
    return requestPromise;
  },
  async refreshOutcome(orderId: string) {
    return api.post('/intelligence/order-learning/outcome/refresh', null, { params: { orderId } });
  },
  async refreshRecent(limit = 50) {
    return api.post('/intelligence/order-learning/refresh/recent', null, { params: { limit } });
  },
  async refreshStyle(styleNo: string, limit = 50) {
    return api.post('/intelligence/order-learning/refresh/style', null, { params: { styleNo, limit } });
  },
};
