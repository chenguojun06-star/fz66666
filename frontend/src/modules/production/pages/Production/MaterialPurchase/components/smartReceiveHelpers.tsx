import { Tag } from 'antd';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';

export const getMaterialTypeName = (type: string): string => {
  return getMaterialTypeLabel(type);
};

export const getMaterialTypeColor = (type: string): string => {
  if (type.startsWith('fabric')) return 'blue';
  if (type.startsWith('lining')) return 'cyan';
  if (type.startsWith('accessory')) return 'green';
  return 'default';
};

export const renderStatusTag = (status: string) => {
  const info = (MATERIAL_PURCHASE_STATUS as Record<string, { color?: string; label?: string }>)[status];
  if (!info) return <Tag>{status}</Tag>;
  return <Tag color={info.color}>{info.label}</Tag>;
};
