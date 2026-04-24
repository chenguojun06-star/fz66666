import type { Message } from './types';

export const INITIAL_MSG: Message = {
  id: 'init-msg',
  role: 'ai',
  text: '你好呀～我是小云 🌤️ 你的服装供应链智能助手。我可以帮你查订单进度、分析生产异常、核算工资成本、管理库存物料、查看数据报表等。直接用自然语言跟我说就行！',
};

export const SUGGESTIONS = [
  '🏭 查看今日生产进度',
  '⚠️ 有哪些逾期订单',
  '💰 本月工资汇总',
];

export function getPageSuggestions(pathname: string): string[] {
  if (pathname.includes('/production')) {
    return ['🏭 查看我的订单进度', '✂️ 裁剪完成情况', '⚠️ 有哪些逾期订单'];
  }
  if (pathname.includes('/finance')) {
    return ['💰 本月工资汇总', '📋 待审核对账单', '📊 订单成本分析'];
  }
  if (pathname.includes('/warehouse') || pathname.includes('/material')) {
    return ['📦 库存预警物料', '🛒 采购单状态', '📦 成品出库情况'];
  }
  if (pathname.includes('/style-info') || pathname.includes('/basic')) {
    return ['🎨 款式BOM完整性检查', '📏 样衣打样进度', '💰 款式成本估算'];
  }
  if (pathname.includes('/dashboard') || pathname.includes('/cockpit')) {
    return ['📄 今日运营日报', '📊 本月运营月报', '⚠️ 系统异常概览'];
  }
  return SUGGESTIONS;
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
