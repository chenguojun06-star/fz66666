import type { DecisionInsight } from '@/components/common/DecisionInsightCard';
import type { MarketAnalysis, MarketAnalysisInput, ShoppingItem, SourceOption } from './types';

export const HOT_KEYWORDS = ['连衣裙', '卫衣', '外套', '牛仔裤', 'T恤', '衬衫', '半身裙', '针织衫', '风衣', '西装', '夹克', '羽绒服'];

export const SEARCH_HISTORY_STORAGE_KEY = 'selection-market-search-history';

export const computeMarketAnalysis = (input: MarketAnalysisInput | null | undefined): MarketAnalysis | null => {
  if (!input?.items?.length) return null;
  const prices = input.items.map(i => i.extractedPrice).filter((p): p is number => p != null && p > 0);
  const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const sources = [...new Set(input.items.map(i => i.source).filter(Boolean))];
  const ratedCount = input.items.filter(i => i.rating != null && i.rating > 0).length;
  return { avgPrice, minPrice, maxPrice, sources, ratedCount, trendScore: input.trendScore, total: input.items.length };
};

export const buildSourceOptions = (
  dailySources: Array<{ dataSource: string; label: string }> | undefined,
  searchSources: Array<{ dataSource: string; label: string }> | undefined,
): SourceOption[] => {
  const map = new Map<string, string>();
  [...(dailySources ?? []), ...(searchSources ?? [])].forEach(item => {
    if (item?.dataSource && item?.label) {
      map.set(item.dataSource, item.label);
    }
  });
  return [{ dataSource: 'ALL', label: '全部渠道' }, ...Array.from(map.entries()).map(([dataSource, label]) => ({ dataSource, label }))];
};

export const buildMarketInsight = (
  item: ShoppingItem,
  analysis: MarketAnalysis | null,
): DecisionInsight => {
  const price = item.extractedPrice;
  const avg = analysis?.avgPrice || 0;
  const trendScore = analysis?.trendScore ?? -1;
  const lowPrice = Boolean(price && avg > 0 && price < avg * 0.8);
  const highPrice = Boolean(price && avg > 0 && price > avg * 1.2);
  const level: DecisionInsight['level'] = trendScore >= 70 ? 'success' : trendScore >= 40 ? 'warning' : 'info';
  const title = trendScore >= 70 ? '适合作为热卖参考' : trendScore >= 40 ? '适合作为跟踪观察款' : '更适合作为渠道样本';
  const summary = trendScore >= 70
    ? '热度高、渠道覆盖足，适合进选品池继续审款。'
    : trendScore >= 40
    ? '有一定热度，还需结合价格带和评分确认。'
    : '目前更像渠道样本，建议先观察不直接推进。';
  const evidence = [
    trendScore >= 0 ? `关键词热度 ${trendScore}/100` : '关键词热度未返回',
    price && avg > 0
      ? `价格 ${item.price}，${lowPrice ? '低于均价 20%+' : highPrice ? '高于均价 20%+' : '接近市场均价'}`
      : '价格数据不足',
    item.rankScore != null ? `榜单权重 ${item.rankScore}` : null,
    item.rating != null ? `商品评分 ${item.rating} / 5（${item.reviews ?? 0} 条）` : null,
    item.sourceLabel ? `渠道 ${item.sourceLabel}` : null,
  ].filter(Boolean) as string[];
  return {
    level,
    title,
    summary,
    painPoint: trendScore >= 70
      ? '热度不等于利润，需同步确认供应链承接能力。'
      : trendScore >= 40
      ? '热度有了，但价格带和评分还没坐实。'
      : '当前信号偏弱，直接推进容易变成无效试错。',
    source: item.sourceLabel || '多源热榜',
    confidence: item.rankScore != null && item.rankScore >= 90 ? '把握较高' : '建议复核',
    evidence,
    note: item.delivery ? `配送信息：${item.delivery}` : undefined,
    execute: trendScore >= 70
      ? '先加入选品池，再走审款。'
      : '先比价、看评分，再决定是否加入。',
    actionLabel: trendScore >= 70 ? '建议加入选品后继续审款' : '建议先比价再决定是否加入',
    labels: {
      summary: '现状',
      painPoint: '关注点',
      execute: '下一步',
      evidence: '数据',
      note: '补充',
    },
  };
};
