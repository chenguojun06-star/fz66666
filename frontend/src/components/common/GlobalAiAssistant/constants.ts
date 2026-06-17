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
  '🚨 查看紧急预警',
];

const PAGE_SUGGESTION_MAP: Record<string, string[]> = {
  '/production': [
    '🏭 查看今日生产进度',
    '📅 预测订单交期',
    '🔍 检测生产异常',
    '📊 排产建议',
    '⚡ 紧急订单有哪些',
    '📉 逾期风险分析',
  ],
  '/production/list': [
    '🔍 查找逾期订单',
    '📋 批量导出今日订单',
    '⚡ 标记紧急订单',
    '📊 按状态分组查看',
  ],
  '/production/progress': [
    '📈 当前工序进度怎样',
    '⚠️ 哪些工序停滞了',
    '🔮 预计什么时候完成',
    '📊 工序效率分析',
  ],
  '/production/cutting': [
    '✂️ 查看裁剪计划',
    '📦 裁剪完成多少了',
    '⚠️ 裁剪异常提醒',
    '📊 裁剪效率统计',
  ],
  '/production/purchase': [
    '🛒 待采购物料有哪些',
    '📦 采购到货情况',
    '⚠️ 物料短缺预警',
    '📊 采购成本分析',
  ],
  '/production/warehousing': [
    '📦 今日入库多少',
    '🔍 入库异常检测',
    '📊 入库效率统计',
    '⚠️ 质检合格率怎样',
  ],
  '/style-info': [
    '✂️ 分析这款样衣工序',
    '💰 报价建议',
    '📋 BOM清单检查',
    '🏭 推荐工厂',
    '📊 开发进度如何',
  ],
  '/style-info/list': [
    '🔍 按状态筛选款式',
    '📋 批量操作选中款式',
    '⚠️ 逾期开发提醒',
    '📊 款式完成率',
  ],
  '/style-info/sample': [
    '✂️ 样衣开发进度',
    '📋 待确认工序',
    '⚠️ 开发逾期提醒',
    '📊 样衣完成率',
  ],
  '/finance': [
    '💰 工资成本分析',
    '📊 对账异常检测',
    '📈 利润估算',
    '🧾 费用报销统计',
    '💵 本月支出多少',
  ],
  '/finance/reconciliation': [
    '📋 待对账明细',
    '⚠️ 对账异常提醒',
    '💵 已对账金额',
    '📊 对账完成率',
  ],
  '/finance/wage': [
    '💰 工资结算情况',
    '📋 待结算人员',
    '⚠️ 结算异常提醒',
    '📊 计件统计',
  ],
  '/warehouse': [
    '📦 库存预警',
    '🔍 物料短缺检测',
    '📊 入库统计',
    '🏭 供应商评分',
    '⚠️ 库存不足提醒',
  ],
  '/warehouse/inventory': [
    '📦 库存余量查询',
    '⚠️ 库存预警提醒',
    '📋 呆滞物料',
    '📊 库存周转率',
  ],
  '/warehouse/material': [
    '🧵 面料库存情况',
    '📦 辅料库存预警',
    '⚠️ 短缺物料提醒',
    '📊 物料使用统计',
  ],
  '/warehouse/finished': [
    '📦 成品库存情况',
    '🚚 待发货订单',
    '⚠️ 库存积压提醒',
    '📊 成品周转率',
  ],
  '/warehouse/check': [
    '📋 盘点任务',
    '⚠️ 盘点差异提醒',
    '📊 盘点完成率',
    '📦 差异明细',
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
    '🚨 风险预警汇总',
  ],
  '/crm': [
    '📊 客户订单分析',
    '💰 应收账款概览',
    '📈 客户趋势预测',
    '🔍 逾期订单提醒',
  ],
  '/crm/receivable': [
    '💰 应收金额汇总',
    '⚠️ 逾期应收提醒',
    '📊 回款进度',
    '📋 客户欠款明细',
  ],
  '/selection': [
    '🛍️ 今日选品动态',
    '📈 选品转化分析',
    '⚠️ 爆款预警',
    '📊 选品成功率',
  ],
  '/ecommerce': [
    '📦 电商订单处理',
    '🚚 发货状态跟踪',
    '⚠️ 异常订单提醒',
    '📊 订单转化统计',
  ],
  '/intelligence': [
    '🤖 小云AI能力中心',
    '📊 AI执行轨迹',
    '🔍 AI建议采纳率',
    '⚙️ AI模型配置',
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
