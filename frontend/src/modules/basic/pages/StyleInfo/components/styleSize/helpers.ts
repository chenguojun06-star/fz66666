import { toNumberSafe } from '@/utils/api';
import { GradingZone } from './shared';

export type SizeStepColumn = { key: string; sizes: string[]; step: number };

export const createEmptySizeStepColumn = (): SizeStepColumn => ({
  key: `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  sizes: [],
  step: 0,
});

/** 计算放码预览值 */
export const computePreview = (
  baseValue: number,
  baseIndex: number,
  sizeColumns: string[],
  zones: GradingZone[],
): Record<string, number> => {
  const result: Record<string, number> = {};
  result[sizeColumns[baseIndex]] = baseValue;

  for (let i = 0; i < sizeColumns.length; i++) {
    if (i === baseIndex) continue;
    const sizeName = sizeColumns[i];
    let step = 0;
    for (const zone of zones) {
      if ((zone.frontSizes || []).includes(sizeName)) { step = toNumberSafe(zone.frontStep); break; }
      if ((zone.backSizes || []).includes(sizeName)) { step = toNumberSafe(zone.backStep); break; }
      for (const col of zone.sizeStepColumns || []) {
        if ((col.sizes || []).includes(sizeName)) { step = toNumberSafe(col.step); break; }
      }
    }
    const distance = Math.abs(i - baseIndex);
    result[sizeName] = Number((i < baseIndex ? baseValue - step * distance : baseValue + step * distance).toFixed(2));
  }
  return result;
};
