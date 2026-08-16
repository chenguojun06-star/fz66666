/**
 * 尺码排序工具（全系统统一）
 * 规则：标准字母码从小到大 → 数字码(26/28...)升序 → 未知码（如D码）排最底
 */

const LETTER_SIZE_ORDER: Record<string, number> = {
  XXS: 1,
  XS: 2,
  XSS: 2,
  S: 3,
  M: 4,
  L: 5,
  XL: 6,
  XXL: 7,
  '2XL': 7,
  XXXL: 8,
  '3XL': 8,
  '4XL': 9,
  '5XL': 10,
  '6XL': 11,
  '7XL': 12,
};

/** 计算尺码权重：值越小越靠前 */
export function getSizeWeight(size?: string | null): number {
  if (!size) return 9999;
  const s = String(size).trim().toUpperCase();
  if (!s) return 9999;
  if (LETTER_SIZE_ORDER[s] !== undefined) return LETTER_SIZE_ORDER[s];
  // 纯数字码（26、28、30、36...）按数值升序，排在字母码之后
  if (/^\d{1,3}(\.\d)?$/.test(s)) return 100 + Number(s);
  // 数字+单位（26W、30R等）
  const numMatch = s.match(/^(\d{1,3})/);
  if (numMatch) return 100 + Number(numMatch[1]);
  // 未知码（D码、均码自定义等）排最底
  return 9000;
}

/** 按尺码从小到大排序（稳定排序，未知码如D码垫底） */
export function sortBySize<T>(items: T[], getSize: (item: T) => string | undefined | null): T[] {
  return [...items].sort((a, b) => getSizeWeight(getSize(a)) - getSizeWeight(getSize(b)));
}
