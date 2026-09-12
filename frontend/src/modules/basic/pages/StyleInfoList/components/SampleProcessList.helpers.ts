// SampleProcessList 的常量、类型与纯函数
// 从原 SampleProcessList.tsx 拆分而来，保持原 API/字段名不变

import type { ProcessColorItem } from './useSampleProcessProgress';

export interface SubProcessRow {
  key: string;
  name: string;
  processCode: string;
  styleNo: string;
  color: string;
  size: string;
  quantity: string;
  receiver: string;
  time: string;
  status: 'completed' | 'in_progress' | 'claimed' | 'pending';
  percent: number;
  unitPrice?: number;
  /** D-382：多色多码——该工序按颜色拆分的完成明细（PC 端展示"x/y 色"并提供批量完成） */
  colorItems?: ProcessColorItem[];
  /** D-384：该工序的指派安排（张三 2 件 / 李四 1 件） */
  assignments?: Array<{ assignee: string; quantity: number }>;
}

export const STAGE_COLORS: Record<string, string> = {
  procurement: 'var(--color-info)',
  cutting: 'var(--color-accent-purple)',
  secondary: 'var(--color-magenta)',
  sewing: 'var(--color-warning)',
  tail: 'var(--color-accent-cyan)',
  warehousing: 'var(--color-success)',
};

export const OPERATION_TYPE_MAP: Record<string, string> = {
  procurement: 'PROCUREMENT',
  cutting: 'CUTTING',
  secondary: 'SECONDARY',
  sewing: 'SEWING',
  tail: 'TAIL',
  warehousing: 'WAREHOUSE_IN',
};

export function parseSizeDisplay(sizeRaw: string | undefined): string {
  if (!sizeRaw) return '-';
  if (sizeRaw.startsWith('{')) {
    try {
      const parsed = JSON.parse(sizeRaw);
      if (Array.isArray(parsed.sizes) && parsed.sizes.length > 0) {
        return parsed.sizes.join(', ');
      }
      if (Array.isArray(parsed.commonSizes) && parsed.commonSizes.length > 0) {
        return parsed.commonSizes.join(', ');
      }
    } catch {
      // ignore parse error
    }
    return '-';
  }
  return sizeRaw || '-';
}
