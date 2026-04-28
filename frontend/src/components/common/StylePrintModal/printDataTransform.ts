/**
 * 打印数据转换工具
 * 提取自 StylePrintModal/index.tsx
 */
'use client';

type LabelSize = '40x70' | '50x100';

export const LABEL_SIZE_MAP: Record<LabelSize, [number, number]> = {
  '40x70': [70, 40],
  '50x100': [100, 50],
};

export function parseSizeColorMatrix(raw: unknown): { sizes: string[]; matrixRows: Array<{ color: string; quantities: number[] }> } | null {
  if (!raw) return null;
  try {
    const config = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
    const sizes: string[] = Array.isArray(config.sizes) ? (config.sizes as unknown[]).map((s) => String(s || '').trim()).filter(Boolean) : [];
    const matrixRows: Array<{ color: string; quantities: number[] }> = Array.isArray(config.matrixRows)
      ? (config.matrixRows as Array<Record<string, unknown>>).map((row) => ({
          color: String(row?.color || '').trim(),
          quantities: Array.isArray(row?.quantities) ? (row.quantities as unknown[]).map((q) => Number(q || 0)) : [],
        }))
      : [];
    if (sizes.length === 0 && matrixRows.length === 0) return null;
    return { sizes, matrixRows };
  } catch { return null; }
}

export type LabelItem = { color: string; size: string; quantity: number };

export function resolveLabelItems(
  sizeDetails: LabelItem[],
  productionSheet: unknown,
  color: string,
  quantity: number,
): LabelItem[] {
  if (sizeDetails && sizeDetails.length > 0) {
    return sizeDetails.filter((d) => d.quantity > 0);
  }
  const raw = (productionSheet as Record<string, unknown>)?.sizeColorConfig;
  if (raw) {
    try {
      const config = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
      const sizes: string[] = (config.sizes || []) as string[];
      const colors: string[] = (config.colors || []) as string[];
      const matrixRows: Array<{ color: string; quantities: number[] }> = (config.matrixRows || []) as Array<{ color: string; quantities: number[] }>;
      if (matrixRows.length > 0 && sizes.length > 0) {
        return matrixRows.flatMap((row) =>
          row.quantities.map((qty, idx) => ({ color: row.color, size: sizes[idx] || '', quantity: qty || 0 })),
        ).filter((item) => item.quantity > 0 && item.size);
      }
      if (colors.length > 0 && sizes.length > 0) {
        return colors.flatMap((c) => sizes.map((s) => ({ color: c, size: s, quantity: 0 })));
      }
    } catch { /* ignore */ }
  }
  if (color) return [{ color, size: '', quantity: quantity ?? 0 }];
  return [];
}
