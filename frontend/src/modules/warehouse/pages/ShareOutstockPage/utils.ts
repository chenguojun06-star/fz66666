export const formatDate = (value?: string | number | Date) => {
  if (value == null || value === '') return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('zh-CN');
  } catch {
    return String(value);
  }
};

export const formatDateTime = (value?: string | number | Date) => {
  if (value == null || value === '') return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

export const paymentLabel = (status?: string) => {
  if (status === 'paid') return { text: '已收款', color: 'var(--color-accent-emerald)' };
  if (status === 'partial') return { text: '部分收款', color: '#f59e0b' };
  return { text: '待收款', color: 'var(--color-text-tertiary)' };
};
