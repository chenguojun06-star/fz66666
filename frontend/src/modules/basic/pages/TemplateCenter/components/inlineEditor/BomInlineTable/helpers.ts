import { getMaterialTypeLabel } from '@/utils/materialType';
import type { BomEditableRow } from './types';

export const EMPTY_TEXT = '-';

export const MATERIAL_TYPE_OPTIONS = [
  'fabricA',
  'fabricB',
  'fabricC',
  'fabricD',
  'fabricE',
  'liningA',
  'liningB',
  'liningC',
  'liningD',
  'liningE',
  'accessoryA',
  'accessoryB',
  'accessoryC',
  'accessoryD',
  'accessoryE',
].map((value) => ({ value, label: getMaterialTypeLabel(value) }));

export const normalizeText = (value: unknown) => String(value ?? '').trim();

export const pickNumericValue = (...values: unknown[]) => {
  for (const value of values) {
    if (value == null || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return undefined;
};

export const formatNumber = (value: unknown, precision = 4) => {
  if (value == null || value === '') return EMPTY_TEXT;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return normalizeText(value) || EMPTY_TEXT;
  }
  const safePrecision = Math.max(0, Math.min(precision, 6));
  return numericValue
    .toFixed(safePrecision)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
};

export const formatMapValue = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return EMPTY_TEXT;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return text;
    }
    const entries = Object.entries(parsed)
      .map(([key, item]) => `${key}:${item ?? ''}`)
      .filter((item) => item !== ':');
    return entries.length > 0 ? entries.join(' / ') : EMPTY_TEXT;
  } catch {
    return text;
  }
};

export const formatCellValue = (key: string, value: unknown) => {
  if (key === 'materialType') {
    return getMaterialTypeLabel(value);
  }
  if (key === 'sizeUsageMap' || key === 'patternSizeUsageMap' || key === 'sizeSpecMap') {
    return formatMapValue(value);
  }
  return normalizeText(value) || EMPTY_TEXT;
};

export const parseNumericMap = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return {} as Record<string, number>;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {} as Record<string, number>;
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, item]) => [key, Number(item)])
        .filter(([, item]) => Number.isFinite(item))
    ) as Record<string, number>;
  } catch {
    return {} as Record<string, number>;
  }
};

export const stringifyNumericMap = (map: Record<string, number>) => JSON.stringify(map);

export const formatSpecWidthValue = (specification: unknown, fabricWidth: unknown) => {
  const specificationText = normalizeText(specification);
  const fabricWidthText = normalizeText(fabricWidth);
  if (specificationText && fabricWidthText) {
    return `${specificationText} / ${fabricWidthText}`;
  }
  return specificationText || fabricWidthText || EMPTY_TEXT;
};

export const buildMaterialTypeOptions = (currentValue: unknown) => {
  const normalizedValue = normalizeText(currentValue);
  if (!normalizedValue || MATERIAL_TYPE_OPTIONS.some((option) => option.value === normalizedValue)) {
    return MATERIAL_TYPE_OPTIONS;
  }
  return [{ value: normalizedValue, label: getMaterialTypeLabel(normalizedValue) }, ...MATERIAL_TYPE_OPTIONS];
};

export const createEmptyBomRow = () =>
  ({
    materialCode: '',
    materialName: '',
    materialType: '',
    fabricComposition: '',
    spec: '',
    specification: '',
    fabricWidth: '',
    fabricWeight: '',
    color: '',
    size: '',
    usageAmount: 0,
    quantity: 0,
    dosage: 0,
    sizeUsageMap: '',
    sizeSpecMap: '',
    unit: '',
    patternUnit: '',
    conversionRate: 0,
    lossRate: 0,
    unitPrice: 0,
    totalPrice: 0,
    supplier: '',
    supplierContactPerson: '',
    supplierContactPhone: '',
    stockStatus: '',
    availableStock: 0,
    requiredPurchase: 0,
    remark: '',
  }) as BomEditableRow;
