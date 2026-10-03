// CRM 仪表盘 - 常量与纯函数
//
// D-732：本模块**已取消付费门禁**（原 LockedView / useSubscription /
// CRM_APP_CODE_ALIASES / LOCKED_FEATURES / hasActiveSubscription 一并移除）。
// 依据：商店 CRM_MODULE 虽标价，但无任何租户开通、0 笔付款 → 收费只挡住了使用。

// 初始统计
export const INITIAL_STATS = { total: 0, activeCount: 0, newThisMonth: 0, vip: 0 };

// 应收账款状态配置（详情弹窗使用）
export const RECEIVABLE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待收款', color: 'blue' },
  PARTIAL:  { label: '部分到账', color: 'orange' },
  PAID:     { label: '已全额到账', color: 'green' },
  OVERDUE:  { label: '已逾期', color: 'red' },
};

// 客户列表状态过滤项
export const CUSTOMER_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'ACTIVE', label: '合作中' },
  { value: 'INACTIVE', label: '已停合作' },
];

// 客户等级选项（表单）
export const CUSTOMER_LEVEL_OPTIONS = [
  { value: 'NORMAL', label: '普通客户' },
  { value: 'VIP', label: 'VIP客户' },
];

// 客户状态选项（表单）
export const CUSTOMER_FORM_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '合作中' },
  { value: 'INACTIVE', label: '已停合作' },
];
