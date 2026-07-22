import { parseProductionOrderLines, sortSizeNames } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';

export type ParsedOrderLine = {
  color?: string;
  size?: string;
  quantity?: number;
};

export type StyleLabelCache = Record<string, {
  fabricComposition?: string;
  fabricCompositionParts?: string;
  washInstructions?: string;
  uCode?: string;
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
}>;

export function getOrderLines(order: ProductionOrder): ParsedOrderLine[] {
  return parseProductionOrderLines(order).filter((line) => {
    const color = String(line?.color || '').trim();
    const size = String(line?.size || '').trim();
    return !!color && !!size;
  });
}

export function getDisplayColors(order: ProductionOrder): string[] {
  return Array.from(new Set(
    getOrderLines(order).map((line) => String(line?.color || '').trim()).filter(Boolean),
  ));
}

export function getDisplaySizes(order: ProductionOrder): string[] {
  return sortSizeNames(Array.from(new Set(
    getOrderLines(order).map((line) => String(line?.size || '').trim()).filter(Boolean),
  )));
}

export function getDisplayColorText(order: ProductionOrder): string {
  const colors = getDisplayColors(order);
  if (colors.length > 1) return `${colors.length}色：${colors.join(' / ')}`;
  if (colors.length === 1) return colors[0];
  return String(order.color || '').trim() || '-';
}

export function getDisplaySizeText(order: ProductionOrder): string {
  const sizes = getDisplaySizes(order);
  if (sizes.length > 0) return sizes.join(' / ');
  return String(order.size || '').trim() || '-';
}

export function genUCode(order: ProductionOrder, line?: ParsedOrderLine): string {
  const parts = [
    order.styleNo,
    String(line?.color || order.color || '').trim(),
    String(line?.size || order.size || '').trim(),
  ].filter(Boolean);
  const suffix = String(order.orderNo || '').slice(-6);
  return parts.length ? `${parts.join('-')}-${suffix}` : order.orderNo || '';
}
