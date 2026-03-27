import type { XiaoyunInsightCardData } from '../common/XiaoyunInsightCard';

export interface XiaoyunPopupIntroMessage {
  content: string;
  suggestions: string[];
  cards: XiaoyunInsightCardData[];
}

const introContent = '我是小云。上面的内容只负责正常提醒；任务处理、指令执行、分析判断都交给我。你可以直接给我下指令，我来处理。';

const introSuggestions = ['分析这单为什么成本高', '推荐这单怎么下更划算', '刷新这单学习结果', '把这个款号的学习样本重刷一下'];

const introCards: XiaoyunInsightCardData[] = [
  {
    level: 'info',
    title: '任务处理入口',
    summary: '只有我负责聊天、接收指令、处理任务；上面的区域只保留提醒。',
    painPoint: '如果要我执行任务，直接说订单号、款号或你要做的动作。',
    execute: '例如：刷新 PO20260320001 的学习结果',
    confidence: '执行入口',
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

export const buildXiaoyunPopupIntroMessage = (): XiaoyunPopupIntroMessage => {
  return {
    content: introContent,
    suggestions: introSuggestions,
    cards: introCards,
  };
};
