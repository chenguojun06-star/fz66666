// BillingTab 辅助常量与纯函数

export const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  TRIAL: { label: '免费试用', color: 'default' },
  BASIC: { label: '基础版', color: 'blue' },
  PRO: { label: '专业版', color: 'gold' },
  ENTERPRISE: { label: '企业版', color: 'purple' },
};

export const BILL_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待支付', color: 'orange' },
  PAID: { label: '已支付', color: 'green' },
  OVERDUE: { label: '逾期', color: 'red' },
  WAIVED: { label: '已减免', color: 'default' },
};

export const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: '月付',
  YEARLY: '年付',
};

export const INVOICE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  NOT_REQUIRED: { label: '无需', color: 'default' },
  PENDING: { label: '待开票', color: 'processing' },
  ISSUED: { label: '已开', color: 'success' },
  MAILED: { label: '已寄', color: 'success' },
};

export const formatStorageSize = (mb: number): string => {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
};
