import type { StatCard } from '@/components/common/PageStatCards';

interface PurchaseStats {
  totalCount: number;
  totalQuantity: number;
  pendingCount: number;
  pendingQuantity: number;
  receivedCount: number;
  receivedQuantity: number;
  partialCount: number;
  partialQuantity: number;
  completedCount: number;
  completedQuantity: number;
}

export const buildStatCards = (
  purchaseStats: PurchaseStats,
  overdueCount: number,
  handleStatClick: (key: string) => void,
): StatCard[] => [
  {
    key: 'pending',
    items: [
      { label: '待采购', value: purchaseStats.pendingCount, unit: '条', color: 'var(--color-warning)' },
      { label: '数量', value: purchaseStats.pendingQuantity, unit: '件', color: 'var(--color-success)' },
    ],
    onClick: () => handleStatClick('pending'),
    activeColor: 'var(--color-warning)',
  },
  {
    key: 'received',
    items: [
      { label: '已采购', value: purchaseStats.receivedCount, unit: '条', color: 'var(--color-primary)' },
      { label: '数量', value: purchaseStats.receivedQuantity, unit: '件', color: 'var(--color-success)' },
    ],
    onClick: () => handleStatClick('received'),
    activeColor: 'var(--color-primary)',
  },
  {
    key: 'partial',
    items: [
      { label: '部分到货', value: purchaseStats.partialCount, unit: '条', color: 'var(--color-warning)' },
      { label: '数量', value: purchaseStats.partialQuantity, unit: '件', color: 'var(--color-success)' },
    ],
    onClick: () => handleStatClick('partial'),
    activeColor: 'var(--color-warning)',
  },
  {
    key: 'completed',
    items: [
      { label: '全部到货', value: purchaseStats.completedCount, unit: '条', color: 'var(--color-success)' },
      { label: '数量', value: purchaseStats.completedQuantity, unit: '件', color: 'var(--color-success)' },
    ],
    onClick: () => handleStatClick('completed'),
    activeColor: 'var(--color-success)',
  },
  {
    key: 'overdue',
    items: [{ label: '逾期未到', value: overdueCount, unit: '条', color: 'var(--error-color, var(--color-danger))' }],
    onClick: () => handleStatClick('overdue'),
    activeColor: 'var(--error-color, var(--color-danger))',
  },
];
