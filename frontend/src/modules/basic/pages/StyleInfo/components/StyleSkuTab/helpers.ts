import type { MenuProps } from 'antd';
import type { ProductSku } from '@/types/style';

let tempIdCounter = -1;

export const nextTempId = (): number => tempIdCounter--;

export const getRowKey = (record: ProductSku): number | string => {
  if (record.id) return record.id;
  return String((record as any)._tempKey ?? '');
};

export const buildAddMenuItems = (
  addRows: (count: number, autoGenerate?: boolean) => void,
): MenuProps['items'] => [
  { key: 'quick-1', label: '按款号生成 +1行', onClick: () => addRows(1, true) },
  { key: 'quick-5', label: '按款号生成 +5行', onClick: () => addRows(5, true) },
  { key: 'quick-10', label: '按款号生成 +10行', onClick: () => addRows(10, true) },
  { type: 'divider' as const },
  { key: 'manual-1', label: '手动输入 +1行', onClick: () => addRows(1, false) },
  { key: 'manual-5', label: '手动输入 +5行', onClick: () => addRows(5, false) },
  { key: 'manual-10', label: '手动输入 +10行', onClick: () => addRows(10, false) },
];

/**
 * 尺码语义排序值：从小到大
 * - 常见字母码：XXXS < XXS < XS < S < M < L < XL < XXL < XXXL（2XL=XXL、3XL=XXXL）
 * - 数字码（如 155/72A）：按首个数字大小 ×10，与字母码区间(-30~50)错开
 * - 定制/均码（含"定"、F/FREE）：靠后
 * - 其他未知尺码：最后
 */
const LETTER_ORDER: Record<string, number> = {
  XXXS: -30, XXS: -20, XS: -10, S: 0, M: 10, L: 20, XL: 30, XXL: 40, '2XL': 40, XXXL: 50, '3XL': 50, '4XL': 60,
};

export const getSizeSortValue = (size?: string): number => {
  if (!size) return 9999;
  const s = size.trim().toUpperCase();
  if (!s) return 9999;
  const letter = s.match(/^(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[234]XL)/);
  if (letter && LETTER_ORDER[letter[1]] !== undefined) return LETTER_ORDER[letter[1]];
  const num = s.match(/^(\d+(\.\d+)?)/);
  if (num) return parseFloat(num[1]) * 10;
  if (s.includes('定') || s === 'F' || s.startsWith('FREE') || s.startsWith('OS')) return 8000;
  return 9000;
};

/**
 * SKU 展示排序：先按颜色分组（中文拼音序），组内优先用户自定义 sortOrder（>0），
 * 未自定义（=0）时按尺码语义从小到大
 */
export const sortSkusForDisplay = (list: ProductSku[]): ProductSku[] =>
  [...list].sort((a, b) => {
    const ca = a.color || '';
    const cb = b.color || '';
    if (ca !== cb) return ca.localeCompare(cb, 'zh-Hans-CN');
    const soa = a.sortOrder || 0;
    const sob = b.sortOrder || 0;
    if (soa !== sob) return soa - sob;
    return getSizeSortValue(a.size) - getSizeSortValue(b.size);
  });
