import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  normalizePageSize,
} from '@/utils/pageSizeStore';

export const normalizePageSizeOptions = (
  pageSizeOptions?: Array<string | number>,
  pageSize?: number,
  defaultPageSize?: number
): string[] => {
  const fallback = [...DEFAULT_PAGE_SIZE_OPTIONS] as string[];
  const effectivePageSize = pageSize ?? defaultPageSize;
  if (effectivePageSize == null) {
    return fallback;
  }
  const currentPageSize = String(normalizePageSize(effectivePageSize, DEFAULT_PAGE_SIZE));
  if (fallback.includes(currentPageSize)) {
    return fallback;
  }
  return fallback;
};

export const hashString = (input: string) => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

export const buildColumnsSignature = (cols: any): string => {
  if (!Array.isArray(cols) || cols.length === 0) return 'empty';

  const parts: string[] = [];
  const walk = (list: unknown[], path: number[]) => {
    for (let i = 0; i < list.length; i += 1) {
      const col = list[i] as any;
      const p = [...path, i];
      const key = col?.key ?? col?.dataIndex;
      const keyText = Array.isArray(key) ? key.join('.') : key == null ? '' : String(key);
      const titleText = typeof col?.title === 'string' ? col.title : '';
      const dataIndexText = Array.isArray(col?.dataIndex)
        ? col.dataIndex.join('.')
        : col?.dataIndex == null
          ? ''
          : String(col.dataIndex);
      parts.push(`${p.join('.')}:${keyText}:${dataIndexText}:${titleText}`);
      if (Array.isArray(col?.children) && col.children.length > 0) {
        walk(col.children as unknown[], p);
      }
    }
  };

  walk(cols, []);
  return parts.join('|') || 'empty';
};

/**
 * 限制数值在指定范围内
 * @param value 要限制的数值
 * @param min 最小值
 * @param max 最大值
 * @returns 限制后的数值
 */
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * 解析宽度值为像素数值
 * @param width 宽度值，可能是数字、字符串或px单位
 * @returns 解析后的像素数值，解析失败则返回undefined
 */
export const parseWidthPx = (width: any): number | undefined => {
  if (typeof width === 'number') return width;
  if (typeof width !== 'string') return undefined;
  const raw = width.trim();
  const pxMatch = raw.match(/^([0-9.]+)px$/i);
  if (pxMatch) return Number(pxMatch[1]);
  const plain = Number(raw);
  if (Number.isFinite(plain)) return plain;
  return undefined;
};

/**
 * 判断是否为叶子列（没有子列）
 * @param col 列配置
 * @returns 是否为叶子列
 */
export const isLeafColumn = (col: any) => !col?.children || (Array.isArray(col.children) && col.children.length === 0);

/**
 * 获取列的唯一标识
 * @param col 列配置
 * @param indexPath 索引路径
 * @returns 列的唯一标识
 */
export const getColumnId = (col: any, indexPath: number[]) => {
  const key = col?.key ?? col?.dataIndex;
  if (Array.isArray(key)) return key.join('.') || indexPath.join('.');
  if (typeof key === 'string' || typeof key === 'number') return String(key);
  return indexPath.join('.');
};

/**
 * 从本地存储读取数据
 * @param key 存储键名
 * @returns 读取的数据，读取失败则返回null
 */
export const readStorage = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Record<string, number>;
  } catch {
    // Intentionally empty
    // 忽略错误
    return null;
  }
};

/**
 * 写入数据到本地存储
 * @param key 存储键名
 * @param value 要存储的数据
 */
export const writeStorage = (key: string, value: Record<string, number>) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Intentionally empty
    // 忽略错误
  }
};

/**
 * 从本地存储读取数组数据
 * @param key 存储键名
 * @returns 读取的数组数据，读取失败则返回null
 */
export const readArrayStorage = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x) => typeof x === 'string') as string[];
  } catch {
    // Intentionally empty
    // 忽略错误
    return null;
  }
};

/**
 * 写入数组数据到本地存储
 * @param key 存储键名
 * @param value 要存储的数组数据
 */
export const writeArrayStorage = (key: string, value: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Intentionally empty
    // 忽略错误
  }
};

/**
 * 数组去重
 * @param list 字符串数组
 * @returns 去重后的字符串数组
 */
export const uniqueStrings = (list: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
};

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}\u{30000}-\u{3134f}\u3000-\u303f\uff00-\uffef]/u;

export const estimateTextWidth = (text: string, fontSize: number = 14): number => {
  let width = 0;
  for (const ch of text) {
    if (CJK_RANGE.test(ch)) {
      width += fontSize;
    } else if (/[A-Z]/.test(ch)) {
      width += fontSize * 0.7;
    } else if (/[a-z0-9]/.test(ch)) {
      width += fontSize * 0.55;
    } else if (/\s/.test(ch)) {
      width += fontSize * 0.3;
    } else {
      width += fontSize * 0.6;
    }
  }
  return Math.ceil(width);
};

const getHeaderFontSize = (): number => {
  if (typeof window === 'undefined') return 14;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--table-header-font-size').trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
};

const getViewportScale = (): number => {
  if (typeof window === 'undefined') return 1;
  const w = window.innerWidth;
  if (w >= 2560) return 1.2;
  if (w <= 768) return 0.7;
  if (w <= 1024) return 0.8;
  if (w <= 1280) return 0.9;
  return 1;
};

export const computeAdaptiveWidth = (col: any): { width?: number } => {
  if (typeof col?.width === 'number' && col.width > 0) return {};

  const titleText = typeof col?.title === 'string' ? col.title : '';

  if (!titleText) return { width: 60 };

  const fontSize = getHeaderFontSize();
  const textWidth = estimateTextWidth(titleText, fontSize);
  const padding = 32;
  const naturalWidth = textWidth + padding;
  const scale = getViewportScale();

  const scaledMin = Math.round(60 * scale);
  const scaledMax = Math.round(200 * scale);

  return { width: Math.max(scaledMin, Math.min(Math.round(naturalWidth * scale), scaledMax)) };
};
