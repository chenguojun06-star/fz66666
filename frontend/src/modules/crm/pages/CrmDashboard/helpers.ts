// CRM 仪表盘 - 常量与纯函数
//
// D-732：本模块**已取消付费门禁**（原 LockedView / useSubscription /
// CRM_APP_CODE_ALIASES / LOCKED_FEATURES / hasActiveSubscription 一并移除）。
// 依据：商店 CRM_MODULE 虽标价，但无任何租户开通、0 笔付款 → 收费只挡住了使用。

// 初始统计（D-736：vip → levelOne，1级客户数）
export const INITIAL_STATS = { total: 0, activeCount: 0, newThisMonth: 0, levelOne: 0 };

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

// 客户等级选项（表单）——D-736：数字分级 1~5（1级最高），不再用 VIP/NORMAL
export const CUSTOMER_LEVEL_OPTIONS = [
  { value: '1', label: '1级客户' },
  { value: '2', label: '2级客户' },
  { value: '3', label: '3级客户' },
  { value: '4', label: '4级客户' },
  { value: '5', label: '5级客户' },
];

/** 等级 → 展示（标签文案 + 颜色）。 */
export const CUSTOMER_LEVEL_META: Record<string, { label: string; color: string }> = {
  '1': { label: '1级', color: 'gold' },
  '2': { label: '2级', color: 'orange' },
  '3': { label: '3级', color: 'blue' },
  '4': { label: '4级', color: 'cyan' },
  '5': { label: '5级', color: 'default' },
};

/** 历史值兼容（迁移前的存量数据）：VIP→1，NORMAL→3 */
const LEGACY_LEVEL_MAP: Record<string, string> = { VIP: '1', NORMAL: '3' };

/** 等级展示文案（兼容旧值；未分级显示「未分级」） */
export const customerLevelLabel = (v?: string | null): string => {
  if (!v) return '未分级';
  const lv = LEGACY_LEVEL_MAP[v] ?? v;
  return CUSTOMER_LEVEL_META[lv]?.label ?? `未分级`;
};

/** 等级标签颜色（兼容旧值） */
export const customerLevelColor = (v?: string | null): string => {
  if (!v) return 'default';
  const lv = LEGACY_LEVEL_MAP[v] ?? v;
  return CUSTOMER_LEVEL_META[lv]?.color ?? 'default';
};

// 客户状态选项（表单）
export const CUSTOMER_FORM_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '合作中' },
  { value: 'INACTIVE', label: '已停合作' },
];
