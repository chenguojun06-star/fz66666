import type { Message } from './types';

export const INITIAL_MSG: Message = {
  id: 'init-msg',
  role: 'ai',
  text: '你好呀～我是小云 🌤️ 你的服装供应链智能助手。我可以帮你查订单进度、分析生产异常、核算工资成本、管理库存物料、查看数据报表等。直接用自然语言跟我说就行！',
};

const GENERAL_SUGGESTIONS = [
  '📄 今日日报',
  '📊 本周周报',
  '📈 本月月报',
  '🔍 检测今日异常',
];

const PAGE_SUGGESTION_MAP: Record<string, string[]> = {
  '/production': [
    '🏭 查看今日生产进度',
    '📅 预测订单交期',
    '🔍 检测生产异常',
    '📊 排产建议',
  ],
  '/style-info': [
    '✂️ 分析这款样衣工序',
    '💰 报价建议',
    '📋 BOM清单检查',
    '🏭 推荐工厂',
  ],
  '/finance': [
    '💰 工资成本分析',
    '📊 对账异常检测',
    '📈 利润估算',
    '🧾 费用报销统计',
  ],
  '/warehouse': [
    '📦 库存预警',
    '🔍 物料短缺检测',
    '📊 入库统计',
    '🏭 供应商评分',
  ],
  '/system': [
    '🏭 供应商管理建议',
    '📊 工厂效率排行',
    '👥 工人技能分析',
    '⚙️ 系统健康检查',
  ],
  '/cockpit': [
    '🧠 AI大脑总快照',
    '📊 智能运营报告',
    '🔍 异常工单追踪',
    '📈 学习效果评估',
  ],
  '/crm': [
    '📊 客户订单分析',
    '💰 应收账款概览',
    '📈 客户趋势预测',
    '🔍 逾期订单提醒',
  ],
};

export function getPageSuggestions(pathname: string): string[] {
  for (const [path, suggestions] of Object.entries(PAGE_SUGGESTION_MAP)) {
    if (pathname.startsWith(path)) {
      return suggestions;
    }
  }
  return GENERAL_SUGGESTIONS;
}

/** 聊天表情面板数据 */
export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: '常用',
    emojis: [
      '😊', '👍', '🎉', '❤️', '😂', '🤝', '💪', '🙏',
      '✅', '⭐', '🔥', '💯', '👏', '🙌', '😄', '🥳',
    ],
  },
  {
    label: '工作',
    emojis: [
      '📦', '🚚', '✂️', '🧵', '🧶', '📋', '📊', '📈',
      '⏰', '🏭', '🔔', '💰', '📎', '🗂️', '🔍', '📝',
    ],
  },
  {
    label: '心情',
    emojis: [
      '😊', '😅', '🤔', '😮', '😢', '😤', '🥱', '😴',
      '🤗', '😎', '🫡', '🫠', '😬', '🫣', '🤩', '🥺',
    ],
  },
];
