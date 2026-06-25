import type { Message } from './types';

// 页面建议逻辑已统一到 routeConfig.ts 的 pageMetaMap，此处重导出以保持调用方兼容
export { getPageSuggestions } from '@/routeConfig';

export const INITIAL_MSG: Message = {
  id: 'init-msg',
  role: 'ai',
  text: '你好呀～我是小云 🌤️ 你的服装供应链智能助手。我可以帮你查订单进度、分析生产异常、核算工资成本、管理库存物料、查看数据报表等。直接用自然语言跟我说就行！',
};

/** 业务实体识别正则 */
export const ENTITY_PATTERNS = {
  ORDER_NO: /([A-Z]{2,}\d{6,}|\d{10,}|订单[：:]?[A-Z0-9]+)/g,
  STYLE_NO: /(款号[：:]?[A-Z0-9-]+|[A-Z]{2,}[-]?\d{3,}[-]?\w*)/g,
  FACTORY_NAME: /(东方制衣|云裳|智联|锦和|恒润|华鑫)/g,
  PHONE: /(1[3-9]\d{9}|\d{3,4}[-]?\d{7,8})/g,
};

/** 从文本中提取业务实体 */
export function extractEntities(text: string): Record<string, string[]> {
  const entities: Record<string, string[]> = {};
  
  for (const [type, pattern] of Object.entries(ENTITY_PATTERNS)) {
    const matches = text.match(pattern);
    if (matches) {
      entities[type] = [...new Set(matches)];
    }
  }
  
  return entities;
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
