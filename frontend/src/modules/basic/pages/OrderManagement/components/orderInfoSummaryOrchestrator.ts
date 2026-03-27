import { sortSizeNames } from '@/utils/api';
import type { OrderLine } from '../types';

const toText = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text || '-';
};

export interface SizeQuantityColorRow {
  color: string;
  quantities: Record<string, number>;
}

export interface SizeQuantitySummaryData {
  sizes: string[];
  rows: SizeQuantityColorRow[];
}

interface BuildStyleSampleSizeQuantityArgs {
  sizeColorConfig?: unknown;
  fallbackSizeText?: string | null;
  fallbackColorText?: string | null;
  sampleQuantity?: number | null;
}

const parseSizeColorConfig = (raw: unknown) => {
  if (!raw) {
    return { sizes: [] as string[], colors: [] as string[], quantities: [] as number[], matrixRows: [] as Array<{ color?: string; quantities?: unknown[] }> };
  }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    const next = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
    return {
      sizes: Array.isArray(next.sizes) ? next.sizes.map((item) => String(item || '').trim()).filter(Boolean) : [],
      colors: Array.isArray(next.colors) ? next.colors.map((item) => String(item || '').trim()).filter(Boolean) : [],
      quantities: Array.isArray(next.quantities) ? next.quantities.map((item) => Number(item || 0)) : [],
      matrixRows: Array.isArray(next.matrixRows) ? next.matrixRows as Array<{ color?: string; quantities?: unknown[] }> : [],
    };
  } catch {
    return { sizes: [] as string[], colors: [] as string[], quantities: [] as number[], matrixRows: [] as Array<{ color?: string; quantities?: unknown[] }> };
  }
};

export const buildOrderColorSummary = (orderLines: OrderLine[]): SizeQuantitySummaryData => {
  const sizeSet = new Set<string>();
  const rowMap = new Map<string, Record<string, number>>();

  (orderLines || []).forEach((line) => {
    const color = String(line?.color || '').trim() || '-';
    const size = String(line?.size || '').trim();
    const quantity = Number(line?.quantity || 0);
    if (!size) return;
    sizeSet.add(size);
    const quantities = rowMap.get(color) || {};
    quantities[size] = (quantities[size] || 0) + quantity;
    rowMap.set(color, quantities);
  });

  return {
    sizes: sortSizeNames(Array.from(sizeSet)),
    rows: Array.from(rowMap.entries()).map(([color, quantities]) => ({ color, quantities })),
  };
};

export const buildStyleSampleColorSummary = ({
  sizeColorConfig,
  fallbackSizeText,
  fallbackColorText,
  sampleQuantity,
}: BuildStyleSampleSizeQuantityArgs): SizeQuantitySummaryData => {
  const config = parseSizeColorConfig(sizeColorConfig);
  const sizeSet = new Set<string>();
  const rowMap = new Map<string, Record<string, number>>();

  config.matrixRows.forEach((row) => {
    const color = String(row?.color || '').trim() || '-';
    const quantities = Array.isArray(row?.quantities) ? row.quantities : [];
    const colorQuantities = rowMap.get(color) || {};
    config.sizes.forEach((size, index) => {
      const qty = Number(quantities[index] || 0);
      if (!size || qty <= 0) return;
      sizeSet.add(size);
      colorQuantities[size] = (colorQuantities[size] || 0) + qty;
    });
    if (Object.keys(colorQuantities).length) {
      rowMap.set(color, colorQuantities);
    }
  });

  if (!rowMap.size && config.sizes.length) {
    const color = toText(fallbackColorText);
    const quantities: Record<string, number> = {};
    config.sizes.forEach((size, index) => {
      const qty = Number(config.quantities[index] || 0);
      if (!size || qty <= 0) return;
      sizeSet.add(size);
      quantities[size] = (quantities[size] || 0) + qty;
    });
    if (Object.keys(quantities).length) {
      rowMap.set(color, quantities);
    }
  }

  if (!rowMap.size) {
    const fallbackSizes = String(fallbackSizeText || '')
      .split(/[/,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (fallbackSizes.length === 1 && Number(sampleQuantity || 0) > 0) {
      sizeSet.add(fallbackSizes[0]);
      rowMap.set(toText(fallbackColorText), {
        [fallbackSizes[0]]: Number(sampleQuantity || 0),
      });
    }
  }

  return {
    sizes: sortSizeNames(Array.from(sizeSet)),
    rows: Array.from(rowMap.entries()).map(([color, quantities]) => ({ color, quantities })),
  };
};
