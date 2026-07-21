import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

// 物料类型选项（编辑模式下拉）
export const MATERIAL_TYPE_OPTIONS = [
  { value: 'fabricA', label: '面料A' }, { value: 'fabricB', label: '面料B' },
  { value: 'fabricC', label: '面料C' }, { value: 'fabricD', label: '面料D' }, { value: 'fabricE', label: '面料E' },
  { value: 'liningA', label: '里料A' }, { value: 'liningB', label: '里料B' },
  { value: 'liningC', label: '里料C' }, { value: 'liningD', label: '里料D' }, { value: 'liningE', label: '里料E' },
  { value: 'accessoryA', label: '辅料A' }, { value: 'accessoryB', label: '辅料B' },
  { value: 'accessoryC', label: '辅料C' }, { value: 'accessoryD', label: '辅料D' }, { value: 'accessoryE', label: '辅料E' },
];

// 必填字段
export const REQUIRED_FIELDS: (keyof MaterialPurchaseType)[] = ['materialType', 'materialCode', 'materialName', 'unit', 'supplierName'];

// 采购单据记录
export interface PurchaseDocRecord {
  id: string;
  imageUrl: string;
  uploaderName: string;
  createTime: string;
  matchCount: number;
  totalRecognized: number;
}

// 已回料确认行的样式
export const confirmedRowStyle = `
  .row-confirmed-disabled {
    background-color: var(--color-bg-subtle) !important;
    color: var(--color-text-tertiary) !important;
  }
  .row-confirmed-disabled:hover {
    background-color: var(--color-border) !important;
  }
  .row-confirmed-disabled .ant-tag {
    opacity: 0.6;
  }
  .row-confirmed-disabled .ant-btn-link {
    color: var(--color-text-tertiary) !important;
  }
`;

// 解析发票 URL（JSON 字符串 → string[]）
export const parseInvoiceUrls = (raw?: string | null): string[] => {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; }
  catch { return raw.split(',').map((s) => s.trim()).filter(Boolean); }
};

// 标准化状态字符串
export const normalizeStatus = (status?: MaterialPurchaseType['status'] | string) =>
  String(status || '').trim().toLowerCase();
