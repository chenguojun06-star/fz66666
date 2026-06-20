import { Tag } from 'antd';
import DisplayStatusTag from '@/components/common/DisplayStatusTag';
import { displayMaterialPurchaseStatus } from '@/utils/display';
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

export const renderStatusTag = (status: string) => {
  const { text, color } = displayMaterialPurchaseStatus(status);
  return <Tag color={color}>{text}</Tag>;
};
