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
