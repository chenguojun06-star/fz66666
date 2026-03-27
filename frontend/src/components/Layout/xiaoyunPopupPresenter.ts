import type { XiaoyunInsightCardData } from '../common/XiaoyunInsightCard';

export interface XiaoyunPopupTopPriorityOrder {
  orderNo: string;
  styleNo: string;
  factoryName: string;
  progress: number;
  daysLeft: number;
}

export interface XiaoyunPopupBriefData {
  overdueOrderCount: number;
  highRiskOrderCount: number;
  suggestions: string[];
  topPriorityOrder?: XiaoyunPopupTopPriorityOrder;
  decisionCards?: XiaoyunInsightCardData[];
}

export interface XiaoyunPopupUrgentEvent {
  id: string;
  type: 'overdue' | 'defective' | 'approval' | 'material';
  title: string;
  orderNo: string;
  time: string;
}

export interface XiaoyunPopupIntroMessage {
  content: string;
  suggestions: string[];
  cards: XiaoyunInsightCardData[];
}

const fallbackContent = '我是小云。你可以直接给我下指令。我会结合上面的今日预警，帮你判断先处理哪几单、解释为什么风险高，也能继续处理下单学习和事件刷新。';

const fallbackSuggestions = ['先告诉我今天最急的三单', '分析这单为什么成本高', '刷新这单学习结果', '把这个款号的学习样本重刷一下'];

const fallbackCards: XiaoyunInsightCardData[] = [
  {
    level: 'info',
    title: '今日预警联动',
    summary: '我会优先结合上面的今日预警来给你排序，不是单独摆一段欢迎词。',
    painPoint: '最好直接点上面的订单号，或者在提问里带订单号/款号。',
    execute: '例如：先告诉我今天最急的三单',
    confidence: '联动今日预警',
    source: '小云能力',
  },
  {
    level: 'success',
    title: '下单学习',
    summary: '可以直接分析这单为什么贵、推荐更划算的下单方式，还能刷新学习结果。',
    painPoint: '最好直接带订单号或款号。',
    execute: '例如：分析 PO20260320001 为什么成本高',
    confidence: '可直接处理',
    source: '下单学习',
  },
];

export const buildXiaoyunPopupIntroMessage = (
  brief: XiaoyunPopupBriefData | null,
  events: XiaoyunPopupUrgentEvent[],
): XiaoyunPopupIntroMessage => {
  const topOrder = brief?.topPriorityOrder;
  const cards: XiaoyunInsightCardData[] = [];

  if (topOrder) {
    cards.push({
      level: topOrder.daysLeft <= 0 ? 'danger' : 'warning',
      title: '今日最急订单',
      summary: `${topOrder.orderNo} 剩 ${topOrder.daysLeft} 天，当前进度 ${topOrder.progress}%`,
      painPoint: `${topOrder.factoryName || '当前工厂'} 的 ${topOrder.styleNo || '该款'} 已进入今日预警最前列。`,
      execute: `你可以直接问我：先处理 ${topOrder.orderNo} 的什么问题`,
      confidence: '来自今日预警',
      source: '今日跟踪预警',
    });
  }

  const riskCount = Number(brief?.overdueOrderCount || 0) + Number(brief?.highRiskOrderCount || 0);
  if (riskCount > 0) {
    cards.push({
      level: riskCount > 8 ? 'warning' : 'info',
      title: '今日风险概览',
      summary: `当前共有 ${riskCount} 条高优先风险待处理`,
      painPoint: `延期 ${brief?.overdueOrderCount || 0} 单，高风险 ${brief?.highRiskOrderCount || 0} 单。`,
      execute: '你可以直接问我：先处理哪几单',
      confidence: '风险汇总',
      source: '今日跟踪预警',
    });
  }

  if (brief?.decisionCards?.length) {
    cards.push(...brief.decisionCards.slice(0, 2));
  }

  if (!cards.length && events.length > 0) {
    const firstEvent = events[0];
    cards.push({
      level: 'warning',
      title: '当前首要事件',
      summary: firstEvent.title,
      painPoint: `涉及订单 ${firstEvent.orderNo || '-'}`,
      execute: `你可以直接问我：${firstEvent.orderNo || '这单'} 现在先怎么处理`,
      confidence: '首要事件',
      source: '今日预警',
    });
  }

  return {
    content: topOrder
      ? `我是小云。我已经把上面的今日预警接进来了，当前最急的是 ${topOrder.orderNo}，剩 ${topOrder.daysLeft} 天、进度 ${topOrder.progress}%。你直接问我，我会按今天的预警顺序给你判断和处理。`
      : fallbackContent,
    suggestions: brief?.suggestions?.length ? brief.suggestions.slice(0, 4) : fallbackSuggestions,
    cards: cards.length ? cards : fallbackCards,
  };
};
