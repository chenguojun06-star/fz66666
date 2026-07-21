import type { StyleBom } from '@/types/style';
import type { useBomEditorHelpers, BomEditorContext } from './bomCellEditors';

/**
 * 库存状态配置
 */
export interface StockStatusConfig {
  color: string;
  text: string;
}

const STOCK_STATUS_CONFIG: Record<string, StockStatusConfig> = {
  sufficient: { color: 'success', text: '库存充足' },
  insufficient: { color: 'warning', text: '库存不足' },
  none: { color: 'error', text: '无库存' },
  unchecked: { color: 'default', text: '未检查' },
};

export const getStockStatusConfig = (status: string): StockStatusConfig => {
  return STOCK_STATUS_CONFIG[status] || { color: 'default', text: '未知' };
};

/**
 * 解析 imageUrls JSON 字符串为 URL 数组
 */
export const parseImageUrls = (raw?: string): string[] => {
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
};

/**
 * 单件用量异常检测结果
 */
export interface UsageAnomaly {
  pct: number;
  isHigh: boolean;
  avg: number;
}

/**
 * 计算单件用量异常（同类面料偏差 > 20% 才返回结果）
 */
export const computeUsageAnomaly = (
  displayValue: number,
  sameTypeRows: StyleBom[],
): UsageAnomaly | null => {
  if (sameTypeRows.length < 2 || !displayValue || displayValue <= 0) return null;
  const avg = sameTypeRows.reduce((s, r) => s + (r.usageAmount ?? 0), 0) / sameTypeRows.length;
  const deviation = Math.abs(displayValue - avg) / avg;
  if (deviation <= 0.2) return null;
  const pct = Math.round(deviation * 100);
  const isHigh = displayValue > avg;
  return { pct, isHigh, avg };
};

/**
 * 列构建上下文：editor 输入（BomEditorContext）+ editor 输出（useBomEditorHelpers 返回值）
 * 各列组工厂函数共享此上下文
 */
export type BomColumnsContext = BomEditorContext & ReturnType<typeof useBomEditorHelpers>;
