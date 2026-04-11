import type { Message } from './types';

export const INITIAL_MSG: Message = {
  id: 'init-msg',
  role: 'ai',
  text: '你好呀～我是小云 🌤️ 你直接用自然语言跟我说就行，我会分析、执行，或者把任务分派给真实同事去处理。下面这些按钮只是示例，不是必须点。',
};

export const SUGGESTIONS = [
  '📄 今日运营日报',
  '📅 本周工作总结',
  '📊 本月经营报告',
  '🚨 逾期订单预警',
  '⚠️ 异常订单排查',
  '👥 通知跟单跟进这单',
];

/** 页面上下文感知：根据当前路由返回相关建议 */
export function getPageSuggestions(pathname: string): string[] {
  if (pathname.startsWith('/production')) {
    return [
      '🚨 逾期订单有哪些',
      '📊 各工厂生产进度汇总',
      '⏸ 停滞订单排查',
      '🏭 工厂产能对比',
      '✂️ 今日裁剪任务',
      '📦 待入库订单列表',
    ];
  }
  if (pathname.startsWith('/finance')) {
    return [
      '💰 待审批结算单',
      '📊 本月成本分析',
      '🧾 对账单异常排查',
      '👷 工人工资汇总',
      '📈 各工厂结算对比',
      '💳 本月付款计划',
    ];
  }
  if (pathname.startsWith('/style') || pathname.startsWith('/StyleInfo')) {
    return [
      '👗 最新款式列表',
      '💲 BOM成本估算',
      '🧵 面料成分查询',
      '📋 款式开发进度',
      '🧺 洗水唛规范查询',
      '📊 款式下单率分析',
    ];
  }
  if (pathname.startsWith('/warehouse')) {
    return [
      '📦 库存总览',
      '⚠️ 低库存预警物料',
      '🚚 今日出入库记录',
      '📋 待收货采购单',
      '📊 库存周转分析',
      '🔍 查询指定物料库存',
    ];
  }
  if (pathname.startsWith('/dashboard')) {
    return [
      '📄 今日运营日报',
      '🚨 逾期订单预警',
      '📊 本周生产数据',
      '🏭 工厂效率排名',
      '⚠️ 高风险订单',
      '📈 产能趋势分析',
    ];
  }
  if (pathname.startsWith('/cockpit') || pathname.startsWith('/intelligence')) {
    return [
      '🤖 AI助手能力说明',
      '📊 智能月报生成',
      '🧠 知识库搜索',
      '📈 AI调用统计',
      '🔍 异常订单智能排查',
      '💡 智能建议汇总',
    ];
  }
  if (pathname.startsWith('/system')) {
    return [
      '👥 在线用户查询',
      '🔐 权限配置说明',
      '📋 操作日志查询',
      '⚙️ 系统状态检查',
      '🔔 通知管理',
      '📱 应用模块管理',
    ];
  }
  if (pathname.startsWith('/crm')) {
    return [
      '👤 客户档案查询',
      '📋 跟单记录汇总',
      '⭐ 客户信用评级',
      '📊 客户订单分析',
      '🔔 待跟进客户',
      '📈 客户成交趋势',
    ];
  }
  // 默认建议
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
