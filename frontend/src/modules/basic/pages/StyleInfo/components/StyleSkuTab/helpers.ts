import type { MenuProps } from 'antd';
import type { ProductSku } from '@/types/style';

let tempIdCounter = -1;

export const nextTempId = (): number => tempIdCounter--;

export const getRowKey = (record: ProductSku): number | string => {
  if (record.id) return record.id;
  return String((record as any)._tempKey ?? '');
};

export const buildAddMenuItems = (
  addRows: (count: number, autoGenerate?: boolean) => void,
): MenuProps['items'] => [
  { key: 'quick-1', label: '快速生成 +1行', onClick: () => addRows(1, true) },
  { key: 'quick-5', label: '快速生成 +5行', onClick: () => addRows(5, true) },
  { key: 'quick-10', label: '快速生成 +10行', onClick: () => addRows(10, true) },
  { type: 'divider' as const },
  { key: 'manual-1', label: '自编辑 +1行', onClick: () => addRows(1, false) },
  { key: 'manual-5', label: '自编辑 +5行', onClick: () => addRows(5, false) },
  { key: 'manual-10', label: '自编辑 +10行', onClick: () => addRows(10, false) },
];
