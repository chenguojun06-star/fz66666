/**
 * MyBillingTab 公共常量与纯函数
 * 包含：发票/账单/订阅 状态映射、到期天数计算与颜色映射
 */
import dayjs from 'dayjs';

export const INVOICE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  NOT_REQUIRED: { label: '无需开票', color: 'default' },
  PENDING: { label: '待开票', color: 'processing' },
  ISSUED: { label: '已开票', color: 'success' },
  MAILED: { label: '已寄出', color: 'success' },
};

export const BILL_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待付款', color: 'warning' },
  PAID: { label: '已支付', color: 'success' },
  OVERDUE: { label: '逾期', color: 'error' },
  WAIVED: { label: '已减免', color: 'default' },
};

export const SUB_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: '使用中', color: 'success' },
  EXPIRED: { label: '已过期', color: 'error' },
  SUSPENDED: { label: '已暂停', color: 'default' },
  TRIAL: { label: '试用中', color: 'processing' },
};

/** 计算距到期天数（返回 null 表示永久有效） */
export function daysUntilExpiry(endTime?: string): number | null {
  if (!endTime) return null;
  return dayjs(endTime).diff(dayjs(), 'day');
}

/** 到期天数对应颜色 */
export function expiryColor(days: number | null): string {
  if (days === null) return 'success';
  if (days < 0) return 'error';
  if (days <= 7) return 'error';
  if (days <= 14) return 'orange';
  if (days <= 30) return 'gold';
  return 'success';
}
