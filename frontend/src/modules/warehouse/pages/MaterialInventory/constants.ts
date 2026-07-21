// 物料库存页面通用常量
// 与原 index.tsx 内联常量保持完全一致

export const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待出库', color: 'orange' },
  completed: { text: '已出库', color: 'green' },
  cancelled: { text: '已取消', color: 'default' },
};

export const USAGE_TYPE_MAP: Record<string, { text: string; color: string }> = {
  BULK: { text: '大货用料', color: 'orange' },
  SAMPLE: { text: '样衣用料', color: 'purple' },
  STOCK: { text: '备库/补库', color: 'gold' },
  OTHER: { text: '其他', color: 'default' },
};
