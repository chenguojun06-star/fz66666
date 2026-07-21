import type { Payable, PayableStats } from '@/services/finance/payableApi';

/** 应付状态配置：label + 颜色 */
export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待付款', color: 'blue' },
  PARTIAL:  { label: '部分付款', color: 'orange' },
  PAID:     { label: '已全额付款', color: 'green' },
  OVERDUE:  { label: '已逾期', color: 'red' },
};

/** 顶部筛选状态下拉选项 */
export const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待付款' },
  { value: 'PARTIAL', label: '部分付款' },
  { value: 'OVERDUE', label: '已逾期' },
  { value: 'PAID', label: '已全额付款' },
];

/** 统计初始值，避免 useState 写冗长对象 */
export const INITIAL_STATS: PayableStats = {
  pendingAmount: 0,
  overdueAmount: 0,
  overdueCount: 0,
  paidAmount: 0,
  newThisMonth: 0,
};

/** 计算待付余额 */
export function getRemaining(record: Payable | null | undefined): number {
  if (!record) return 0;
  return Number(record.amount) - Number(record.paidAmount ?? 0);
}

/** 判断应付单是否可登记付款 */
export function canMarkPaid(record: Payable): boolean {
  return record.status === 'PENDING' || record.status === 'PARTIAL' || record.status === 'OVERDUE';
}

/** 判断到期日是否已逾期 */
export function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

/** 获取状态配置，缺失时回退到 default */
export function getStatusConfig(status?: string): { label: string; color: string } {
  if (!status) return { label: '-', color: 'default' };
  return STATUS_CONFIG[status] ?? { label: status, color: 'default' };
}
