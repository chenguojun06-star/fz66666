import type { StyleInfo } from '@/types/style';
import type { ProductionOrder } from '@/types/production';
import { parseProductionOrderLines } from '@/utils/api';

export interface CardSizeQuantityItem {
  color?: string;
  size: string;
  quantity: number;
}

const toNonEmptyText = (value: unknown) => String(value || '').trim();

const toPositiveNumber = (value: unknown) => {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
};

const parseStyleSizeColorConfig = (raw: unknown) => {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const buildStyleTopLevelItems = (record: Partial<StyleInfo>) => {
  const config = parseStyleSizeColorConfig(record.sizeColorConfig);
  const directColor = toNonEmptyText(record.color);
  const sizes = Array.isArray(config.sizes) ? config.sizes : [];
  const quantities = Array.isArray(config.quantities) ? config.quantities : [];

  return sizes
    .map((size, index) => ({
      color: directColor,
      size: toNonEmptyText(size),
      quantity: toPositiveNumber(quantities[index]),
    }))
    .filter((item) => item.size && item.quantity > 0);
};

const buildStyleMatrixItems = (config: Record<string, unknown>) => {
  const matrixRows = Array.isArray(config.matrixRows) ? config.matrixRows : [];
  const sizes = Array.isArray(config.sizes) ? config.sizes : Array.isArray(config.commonSizes) ? config.commonSizes : [];

  return matrixRows.flatMap((row) => {
    const nextRow = typeof row === 'object' && row !== null ? row as Record<string, unknown> : {};
    const color = toNonEmptyText(nextRow.color);
    const quantities = Array.isArray(nextRow.quantities) ? nextRow.quantities : [];

    return sizes
      .map((size, index) => ({
        color,
        size: toNonEmptyText(size),
        quantity: toPositiveNumber(quantities[index]),
      }))
      .filter((item) => item.size && item.quantity > 0);
  });
};

export const getStyleCardSizeQuantityItems = (record: Partial<StyleInfo>) => {
  const config = parseStyleSizeColorConfig(record.sizeColorConfig);
  const matrixItems = buildStyleMatrixItems(config);
  if (matrixItems.length > 0) return matrixItems;

  const topLevelItems = buildStyleTopLevelItems(record);
  if (topLevelItems.length > 0) return topLevelItems;

  const fallbackSizes = toNonEmptyText(record.size)
    .split(/[/,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const fallbackQuantity = toPositiveNumber(record.sampleQuantity);
  const fallbackColor = toNonEmptyText(record.color);

  if (fallbackSizes.length === 1 && fallbackQuantity > 0) {
    return [{ color: fallbackColor, size: fallbackSizes[0], quantity: fallbackQuantity }];
  }

  return [];
};

export const getStyleCardColorText = (record: Partial<StyleInfo>) => {
  const items = getStyleCardSizeQuantityItems(record);
  return items.length ? Array.from(new Set(items.map((item) => item.color).filter(Boolean))).join(' / ') : '';
};

export const getStyleCardSizeText = (record: Partial<StyleInfo>) => {
  const items = getStyleCardSizeQuantityItems(record);
  return items.length ? items.map((item) => item.size).join(' / ') : '';
};

export const getStyleCardQuantityText = (record: Partial<StyleInfo>) => {
  const items = getStyleCardSizeQuantityItems(record);
  return items.length ? items.map((item) => `${item.quantity}`).join(' / ') : '';
};

export const getOrderCardSizeQuantityItems = (record: Partial<ProductionOrder>) => {
  return parseProductionOrderLines(record)
    .map((item) => ({
      color: toNonEmptyText(item.color) || toNonEmptyText(record.color),
      size: toNonEmptyText(item.size),
      quantity: toPositiveNumber(item.quantity),
    }))
    .filter((item) => item.size);
};
