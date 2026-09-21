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
  // D-513：补「全部」卡片。
  // 背景：菜单红点（/dashboard/menu-badge-counts → /production/material）只统计 status='pending'，
  // 而本页默认 activeStatFilter='all' 显示全部，但卡片里原本没有「全部」这张卡，
  // 导致用户看到"红点 10 条 / 列表 138 条"且页面上找不到 138 这个数字 → 以为数据对不上。
  // 补上后：卡片「全部 138」= 列表条数，「待采购 10」= 菜单红点，每个数字都能对上。
  {
    key: 'all',
    items: [
      { label: '全部', value: purchaseStats.totalCount, unit: '条', color: 'var(--color-text-secondary)' },
      { label: '数量', value: purchaseStats.totalQuantity, color: 'var(--color-success)' },
    ],
    onClick: () => handleStatClick('all'),
    activeColor: 'var(--color-primary)',
  },
  {
    key: 'pending',
    items: [
      { label: '待采购', value: purchaseStats.pendingCount, unit: '条', color: 'var(--color-warning)' },
      { label: '数量', value: purchaseStats.pendingQuantity, color: 'var(--color-success)' },
    ],
    onClick: () => handleStatClick('pending'),
    activeColor: 'var(--color-warning)',
  },
  {
    key: 'received',
    items: [
      { label: '已领取', value: purchaseStats.receivedCount, unit: '条', color: 'var(--color-primary)' },
      { label: '数量', value: purchaseStats.receivedQuantity, color: 'var(--color-success)' },
    ],
    onClick: () => handleStatClick('received'),
    activeColor: 'var(--color-primary)',
  },
  {
    key: 'partial',
    items: [
      { label: '部分到货', value: purchaseStats.partialCount, unit: '条', color: 'var(--color-warning)' },
      { label: '数量', value: purchaseStats.partialQuantity, color: 'var(--color-success)' },
    ],
    onClick: () => handleStatClick('partial'),
    activeColor: 'var(--color-warning)',
  },
  {
    key: 'completed',
    items: [
      { label: '全部到货', value: purchaseStats.completedCount, unit: '条', color: 'var(--color-success)' },
      { label: '数量', value: purchaseStats.completedQuantity, color: 'var(--color-success)' },
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
