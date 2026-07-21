// 应收账款列表 - 常量与纯函数

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待收款', color: 'blue' },
  PARTIAL:  { label: '部分到账', color: 'orange' },
  PAID:     { label: '已全额到账', color: 'green' },
  OVERDUE:  { label: '已逾期', color: 'red' },
};

export const STATUS_FILTER_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待收款' },
  { value: 'PARTIAL', label: '部分到账' },
  { value: 'OVERDUE', label: '已逾期' },
  { value: 'PAID', label: '已全额到账' },
];

export const SOURCE_BIZ_TYPE_OPTIONS = [
  { value: '', label: '全部来源' },
  { value: 'MATERIAL_PICKUP', label: '面辅料领取' },
];

export const INITIAL_STATS = { totalPending: 0, totalOverdue: 0, overdueCount: 0, newThisMonth: 0 };
