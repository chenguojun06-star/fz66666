import type { MaterialPurchase } from '@/types/production';
import { getMaterialTypeSortKey } from '@/utils/materialType';

export interface InlinePurchasePanelProps {
  /** D-360g：嵌入 NodeDetailModal 时由外部统一头展示款式信息，自身不再重复渲染头（修复采购节点弹窗双矩阵） */
  embedded?: boolean;
  orderId?: string;
  orderNo?: string;
  patternId?: string;
  sourceType?: 'order' | 'sample';
  styleNo?: string;
  color?: string;
  quantity?: number;
}

export const MATERIAL_TYPE_OPTIONS = [
  { value: 'fabricA', label: '面料A' },
  { value: 'fabricB', label: '面料B' },
  { value: 'fabricC', label: '面料C' },
  { value: 'fabricD', label: '面料D' },
  { value: 'fabricE', label: '面料E' },
  { value: 'liningA', label: '里料A' },
  { value: 'liningB', label: '里料B' },
  { value: 'liningC', label: '里料C' },
  { value: 'liningD', label: '里料D' },
  { value: 'liningE', label: '里料E' },
  { value: 'accessoryA', label: '辅料A' },
  { value: 'accessoryB', label: '辅料B' },
  { value: 'accessoryC', label: '辅料C' },
  { value: 'accessoryD', label: '辅料D' },
  { value: 'accessoryE', label: '辅料E' },
];

export const unwrapRecords = (res: any): MaterialPurchase[] => {
  if (res?.code !== 200) return [];
  return (
    (Array.isArray(res?.data?.records) && res.data.records) ||
    (Array.isArray(res?.data) && res.data) ||
    []
  );
};

export const sortPurchases = (arr: MaterialPurchase[]) =>
  [...arr].sort((a, b) => {
    const ka = getMaterialTypeSortKey(a?.materialType);
    const kb = getMaterialTypeSortKey(b?.materialType);
    return ka !== kb ? ka.localeCompare(kb) : String(a?.materialName || '').localeCompare(String(b?.materialName || ''), 'zh');
  });

export const normalizeStatus = (status?: MaterialPurchase['status'] | string) =>
  String(status || '').trim().toLowerCase();
