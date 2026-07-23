import api, { type ApiResult } from '@/utils/api';

let recommendationEndpointUnavailableUntil = 0;
const ENDPOINT_UNAVAILABLE_STORAGE_KEY = 'orderLearningRecommendationUnavailableUntil';
const UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000; // 5 分钟冷却，避免永久禁用
const recommendationInflight = new Map<string, Promise<any>>();

const readEndpointUnavailable = () => {
  const now = Date.now();
  if (recommendationEndpointUnavailableUntil > now) return true;
  // 冷却期已过，自动恢复
  if (recommendationEndpointUnavailableUntil > 0) {
    recommendationEndpointUnavailableUntil = 0;
    try { sessionStorage.removeItem(ENDPOINT_UNAVAILABLE_STORAGE_KEY); } catch { /* ignore */ }
  }
  try {
    const saved = Number(sessionStorage.getItem(ENDPOINT_UNAVAILABLE_STORAGE_KEY) || '0');
    if (saved > now) {
      recommendationEndpointUnavailableUntil = saved;
      return true;
    }
  } catch { /* sessionStorage 不可用，忽略 */ }
  return false;
};

const markEndpointUnavailable = () => {
  const until = Date.now() + UNAVAILABLE_COOLDOWN_MS;
  recommendationEndpointUnavailableUntil = until;
  try {
    sessionStorage.setItem(ENDPOINT_UNAVAILABLE_STORAGE_KEY, String(until));
  } catch { /* sessionStorage 不可用，忽略 */ }
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
