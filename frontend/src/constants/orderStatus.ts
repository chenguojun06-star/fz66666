/**
 * 生产订单状态共享常量
 * 避免各组件各自硬编码或遗漏导致英文状态值直接显示
 * 数据来源：types/production.ts 枚举 + CommandPalette.tsx 映射表
 */

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending:    '待生产',
  production: '生产中',
  completed:  '已完成',
  delayed:    '已逾期',
  scrapped:   '已报废',
  cancelled:  '已取消',
  canceled:   '已取消',   // 兼容拼写变体
  paused:     '已暂停',
  returned:   '已退回',
  closed:     '已关单',
  archived:   '已归档',
};

export const ORDER_STATUS_COLOR: Record<string, string> = {
  pending:    'default',
  production: 'processing',
  completed:  'success',
  delayed:    'warning',
  scrapped:   'error',
  cancelled:  'default',
  canceled:   'default',
  paused:     'orange',
  returned:   'volcano',
  closed:     'blue',
  archived:   'default',
};

/**
 * 历史款式订单状态（StyleQuote 场景，值为大写英文）
 */
export const STYLE_ORDER_STATUS_LABEL: Record<string, string> = {
  COMPLETED:   '已完成',
  WAREHOUSED:  '已入库',
  IN_PROGRESS: '生产中',
  DRAFT:       '草稿',
  CANCELLED:   '已取消',
};

export const STYLE_ORDER_STATUS_COLOR: Record<string, string> = {
  COMPLETED:   '#52c41a',
  WAREHOUSED:  '#52c41a',
  IN_PROGRESS: '#1677ff',
  DRAFT:       '#d9d9d9',
  CANCELLED:   '#ff4d4f',
};
