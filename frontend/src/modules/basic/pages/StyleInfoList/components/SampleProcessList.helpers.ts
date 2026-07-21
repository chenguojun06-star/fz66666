// SampleProcessList 的常量、类型与纯函数
// 从原 SampleProcessList.tsx 拆分而来，保持原 API/字段名不变

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
  status: 'completed' | 'in_progress' | 'pending';
  percent: number;
  unitPrice?: number;
}

export const STAGE_COLORS: Record<string, string> = {
  procurement: 'var(--color-info)',
  cutting: 'var(--color-accent-purple)',
  secondary: '#eb2f96',
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
