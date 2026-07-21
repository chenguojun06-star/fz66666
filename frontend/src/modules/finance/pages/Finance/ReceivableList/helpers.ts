export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: '待收款', color: 'blue' },
  PARTIAL:  { label: '部分到账', color: 'orange' },
  PAID:     { label: '已全额到账', color: 'green' },
  OVERDUE:  { label: '已逾期', color: 'red' },
};
