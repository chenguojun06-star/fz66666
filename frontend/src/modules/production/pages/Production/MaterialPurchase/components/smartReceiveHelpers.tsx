import { Tag } from 'antd';
import { getMaterialTypeLabel } from '@/utils/materialType';

export const getMaterialTypeName = (type: string): string => {
  return getMaterialTypeLabel(type);
};

export const getMaterialTypeColor = (type: string): string => {
  if (type.startsWith('fabric')) return 'blue';
  if (type.startsWith('lining')) return 'cyan';
  if (type.startsWith('accessory')) return 'green';
  return 'default';
};

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending:           { color: 'default',   label: '待处理' },
  received:          { color: 'success',   label: '已收货' },
  partial:           { color: 'processing', label: '部分到货' },
  partial_arrival:   { color: 'processing', label: '部分到货' },
  awaiting_confirm:  { color: 'warning',   label: '待确认' },
  completed:         { color: 'success',   label: '已完成' },
  cancelled:         { color: 'default',   label: '已取消' },
  warehouse_pending: { color: 'warning',   label: '待入库' },
};

export const renderStatusTag = (status: string) => {
  const info = STATUS_MAP[status];
  if (!info) return <Tag>未知</Tag>;
  return <Tag color={info.color}>{info.label}</Tag>;
};
