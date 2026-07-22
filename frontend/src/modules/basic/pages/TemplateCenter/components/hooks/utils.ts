import { toNumberSafe, sortSizeNames } from '@/utils/api';

export const FALLBACK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export const norm = (v: unknown) => String(v || '').trim();

export interface StyleProcessRow {
  id: string | number;
  processCode: string;
  processName: string;
  progressStage: string;
  machineType: string;
  difficulty?: string;
  standardTime: number;
  price: number;
  sortOrder: number;
  sizePrices?: Record<string, number>;
  sizePriceTouched?: Record<string, boolean>;
}

export type MatchedScope = 'style' | 'order' | 'empty';

export const buildRowsFromContent = (content: any, fallbackSizes: string[] = FALLBACK_SIZES): { rows: StyleProcessRow[]; sizes: string[] } => {
  const rawSteps = Array.isArray(content?.steps) ? content.steps : [];
  const rawSizes = Array.isArray(content?.sizes)
    ? content.sizes.map((item: unknown) => String(item || '').trim().toUpperCase()).filter(Boolean)
    : [];
  const sizes = sortSizeNames(rawSizes.length ? rawSizes : fallbackSizes);

  const rows: StyleProcessRow[] = rawSteps.map((item: any, index: number) => {
    const sizePrices: Record<string, number> = {};
    const sizePriceTouched: Record<string, boolean> = {};
    sizes.forEach((size) => {
      const sizePrice = toNumberSafe(item?.sizePrices?.[size]);
      const basePrice = toNumberSafe(item?.unitPrice ?? item?.price);
      sizePrices[size] = sizePrice || basePrice;
      sizePriceTouched[size] = item?.sizePrices?.[size] != null;
    });

    return {
      id: item?.processCode || `loaded-${index}`,
      processCode: String(item?.processCode || String(index + 1).padStart(2, '0')),
      processName: String(item?.processName || item?.name || ''),
      progressStage: String(item?.progressStage || '车缝'),
      machineType: String(item?.machineType || ''),
      difficulty: String(item?.difficulty || ''),
      standardTime: toNumberSafe(item?.standardTime),
      price: toNumberSafe(item?.unitPrice ?? item?.price),
      sortOrder: index + 1,
      sizePrices,
      sizePriceTouched,
    };
  });

  return { rows, sizes };
};
