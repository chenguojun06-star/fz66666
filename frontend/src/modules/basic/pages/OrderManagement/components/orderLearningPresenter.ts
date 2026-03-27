import type { OrderLearningRecommendationResponse } from '@/services/intelligence/orderLearningApi';

const pricingModeTextMap: Record<string, string> = {
  PROCESS: '工序单价',
  SIZE: '尺码单价',
  COST: '外发整件单价',
  QUOTE: '报价单价',
  MANUAL: '手动单价',
};

const factoryModeTextMap: Record<string, string> = {
  INTERNAL: '内部自产',
  EXTERNAL: '外发加工',
};

export interface PresentedOrderLearningRecommendation {
  title: string;
  summary: string;
  recommendationLines: string[];
  gapLines: string[];
  tags: string[];
  recentCaseLines: string[];
  similarCaseLines: string[];
  factoryScoreLines: string[];
}

const pricingModeText = (value?: string) => pricingModeTextMap[value || ''] || value || '-';
const factoryModeText = (value?: string) => factoryModeTextMap[value || ''] || value || '-';

export const presentOrderLearningRecommendation = (
  payload?: OrderLearningRecommendationResponse | null,
): PresentedOrderLearningRecommendation | null => {
  if (!payload) return null;
  return {
    title: payload.recommendationTitle || 'AI 学习建议',
    summary: payload.recommendationSummary || '当前还没有可用的智能学习结果。',
    recommendationLines: [
      `推荐生产方式：${factoryModeText(payload.recommendedFactoryMode)}`,
      `推荐单价口径：${pricingModeText(payload.recommendedPricingMode)}`,
      payload.recommendedUnitPrice ? `推荐参考单价：¥${Number(payload.recommendedUnitPrice).toFixed(2)}/件` : '',
      payload.costInsight || '',
      payload.deliveryInsight || '',
      payload.riskInsight || '',
    ].filter(Boolean),
    gapLines: [
      payload.gapInsight || '',
      payload.actionSuggestion || '',
      payload.extraUnitCostIfKeepCurrent && payload.extraUnitCostIfKeepCurrent > 0
        ? `继续当前方案，预计单件多花 ¥${Number(payload.extraUnitCostIfKeepCurrent).toFixed(2)}`
        : '',
      payload.extraTotalCostIfKeepCurrent && payload.extraTotalCostIfKeepCurrent > 0
        ? `继续当前方案，整单预计多花 ¥${Number(payload.extraTotalCostIfKeepCurrent).toFixed(2)}`
        : '',
    ].filter(Boolean),
    tags: payload.recommendationTags || [],
    recentCaseLines: (payload.recentCases || []).slice(0, 3).map((item) => {
      const parts = [
        item.orderNo || '-',
        factoryModeText(item.factoryMode),
        pricingModeText(item.pricingMode),
        item.selectedUnitPrice ? `下单 ¥${Number(item.selectedUnitPrice).toFixed(2)}` : '',
        item.delayDays ? `延期 ${item.delayDays} 天` : '',
        item.outcomeSummary || '',
      ].filter(Boolean);
      return parts.join(' · ');
    }),
    similarCaseLines: (payload.similarStyleCases || []).slice(0, 3).map((item) => {
      const parts = [
        item.styleNo || '-',
        item.styleName || '',
        factoryModeText(item.factoryMode),
        pricingModeText(item.pricingMode),
        item.selectedUnitPrice ? `下单 ¥${Number(item.selectedUnitPrice).toFixed(2)}` : '',
        item.outcomeSummary || '',
      ].filter(Boolean);
      return parts.join(' · ');
    }),
    factoryScoreLines: (payload.factoryScores || []).slice(0, 4).map((item) => {
      const parts = [
        item.factoryName || factoryModeText(item.factoryMode),
        typeof item.orderCount === 'number' ? `${item.orderCount} 单` : '',
        typeof item.avgUnitPrice === 'number' ? `均价 ¥${Number(item.avgUnitPrice).toFixed(2)}` : '',
        typeof item.avgDelayDays === 'number' ? `平均延期 ${item.avgDelayDays} 天` : '',
        typeof item.avgOutcomeScore === 'number' ? `综合分 ${Number(item.avgOutcomeScore).toFixed(1)}` : '',
      ].filter(Boolean);
      return parts.join(' · ');
    }),
  };
};
