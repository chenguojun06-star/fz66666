import type { StatCard } from '@/components/common/PageStatCards';

interface PurchaseStats {
  totalCount: number;
  totalQuantity: number;
  pendingCount: number;
  receivedCount: number;
  partialCount: number;
  completedCount: number;
}

export const buildStatCards = (
  purchaseStats: PurchaseStats,
  overdueCount: number,
  handleStatClick: (key: string) => void,
): StatCard[] => [
  {
    key: 'all',
    items: [
      { label: '采购总数', value: purchaseStats.totalCount, unit: '条', color: 'var(--color-primary)' },
      { label: '总数量', value: purchaseStats.totalQuantity, color: 'var(--color-success)' },
    ],
    onClick: () => handleStatClick('all'),
    activeColor: 'var(--color-primary)',
  },
  {
    key: 'pending',
    items: [{ label: '待采购', value: purchaseStats.pendingCount, unit: '条', color: 'var(--color-warning)' }],
    onClick: () => handleStatClick('pending'),
    activeColor: 'var(--color-warning)',
  },
  {
    key: 'received',
    items: [{ label: '已采购', value: purchaseStats.receivedCount, unit: '条', color: 'var(--color-primary)' }],
    onClick: () => handleStatClick('received'),
    activeColor: 'var(--color-primary)',
  },
  {
    key: 'partial',
    items: [{ label: '部分到货', value: purchaseStats.partialCount, unit: '条', color: 'var(--color-warning)' }],
    onClick: () => handleStatClick('partial'),
    activeColor: 'var(--color-warning)',
  },
  {
    key: 'completed',
    items: [{ label: '全部到货', value: purchaseStats.completedCount, unit: '条', color: 'var(--color-success)' }],
    onClick: () => handleStatClick('completed'),
    activeColor: 'var(--color-success)',
  },
  {
    key: 'overdue',
    items: [{ label: '逆期未到', value: overdueCount, unit: '条', color: 'var(--error-color, var(--color-danger))' }],
    onClick: () => handleStatClick('overdue'),
    activeColor: 'var(--error-color, var(--color-danger))',
  },
];
