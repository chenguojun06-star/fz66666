/**
 * 数据类型转换和验证工具
 * 提供安全的类型转换和校验
 */

/**
 * 安全地转换为数字
 * @param value 输入值
 * @param fallback 默认值
 * @returns 数字值
 */
export function toNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 安全地转换为整数
 * @param value 输入值
 * @param fallback 默认值
 * @returns 整数值
 */
export function toInteger(value: any, fallback = 0): number {
  const n = toNumber(value, fallback);
  return Number.isInteger(n) ? n : Math.floor(n);
}

/**
 * 安全地转换为正整数
 * @param value 输入值
 * @param fallback 默认值
 * @returns 正整数值（最小为 1）
 */
export function toPositiveInteger(value: any, fallback = 1): number {
  const n = toInteger(value, fallback);
  return Math.max(1, n);
}

/**
 * 安全地转换为字符串
 * @param value 输入值
 * @param fallback 默认值
 * @returns 字符串值
 */
export function toString(value: any, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

/**
 * 安全地转换为布尔值
 * @param value 输入值
 * @returns 布尔值
 */
export function toBoolean(value: any): boolean {
  return Boolean(value);
}

/**
 * 安全地转换为日期
 * @param value 输入值
 * @returns Date 对象或 null
 */
export function toDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 精确的浮点数运算
 * @param a 第一个数
 * @param b 第二个数
 * @param precision 精度（小数位数）
 * @returns 相加结果
 */
export function add(a: number, b: number, precision = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round((a + b) * factor) / factor;
}

/**
 * 精确的减法
 */
export function subtract(a: number, b: number, precision = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round((a - b) * factor) / factor;
}

/**
 * 精确的乘法
 */
export function multiply(a: number, b: number, precision = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round((a * b) * factor) / factor;
}

/**
 * 精确的除法
 */
export function divide(a: number, b: number, precision = 2): number {
  if (b === 0) return 0;
  const factor = Math.pow(10, precision);
  return Math.round((a / b) * factor) / factor;
}

/**
 * 数值范围限制
 * @param value 值
 * @param min 最小值
 * @param max 最大值
 * @returns 限制后的值
 */
export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 百分比计算
 * @param value 值
 * @param total 总数
 * @param precision 精度
 * @returns 百分比数值
 */
export function percentage(value: number, total: number, precision = 2): number {
  if (total === 0) return 0;
  const factor = Math.pow(10, precision);
  return Math.round((value / total) * 100 * factor) / factor;
}

/**
 * 格式化数字显示
 * @param value 数值
 * @param decimals 小数位数
 * @returns 格式化后的字符串
 */
export function formatNumber(value: number, decimals = 2): string {
  return toNumber(value).toFixed(decimals);
}

/**
 * 格式化货币
 * @param value 数值
 * @param currency 货币符号
 * @returns 格式化后的字符串
 */
export function formatCurrency(value: number, currency = '¥'): string {
  return `${currency}${formatNumber(value, 2)}`;
}

/**
 * 检查值是否为空
 * @param value 值
 * @returns 是否为空
 */
export function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * 检查值是否不为空
 * @param value 值
 * @returns 是否不为空
 */
export function isNotEmpty(value: any): boolean {
  return !isEmpty(value);
}

/**
 * 批量转换和验证对象
 * @param data 数据对象
 * @param schema 转换规则 { fieldName: transformFunction }
 * @returns 转换后的对象
 */
export function transformData(data: Record<string, any>, schema: Record<string, (value: any) => any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, transformer] of Object.entries(schema)) {
    try {
      result[key] = transformer(data[key]);
    } catch (error) {
      result[key] = null;
    }
  }
  return result;
}

/**
 * 验证数据对象
 * @param data 数据对象
 * @param validators 验证规则 { fieldName: validatorFunction }
 * @returns 验证错误对象，无错误则返回空对象
 */
export function validateData(
  data: Record<string, any>,
  validators: Record<string, (value: any) => string | null>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, validator] of Object.entries(validators)) {
    const error = validator(data[key]);
    if (error) {
      errors[key] = error;
    }
  }
  return errors;
}

/**
 * 深度克隆对象
 * @param obj 对象
 * @returns 克隆后的对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as any;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as any;
  if (obj instanceof Object) {
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        (cloned as any)[key] = deepClone((obj as any)[key]);
      }
    }
    return cloned;
  }
  return obj;
}

/**
 * 提取对象子集
 * @param obj 原对象
 * @param keys 要提取的键名
 * @returns 子集对象
 */
export function pick<T extends Record<string, any>>(obj: T, keys: (keyof T)[]): Partial<T> {
  const result = {} as Partial<T>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * 排除对象属性
 * @param obj 原对象
 * @param keys 要排除的键名
 * @returns 排除后的对象
 */
export function omit<T extends Record<string, any>>(obj: T, keys: (keyof T)[]): Partial<T> {
  const result = { ...obj } as Partial<T>;
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * 合并对象（浅合并）
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 */
export function merge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  return { ...target, ...source };
}

/**
 * 去重数组
 * @param array 数组
 * @param key 去重键（可选，用于对象数组）
 * @returns 去重后的数组
 */
export function unique<T>(array: T[], key?: keyof T): T[] {
  if (!key) {
    return [...new Set(array)];
  }
  const seen = new Set();
  return array.filter(item => {
    const val = (item as any)[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

/**
 * 数组分页
 * @param array 数组
 * @param pageNum 页码（从 1 开始）
 * @param pageSize 页面大小
 * @returns 分页结果 { data, total, pageNum, pageSize, pages }
 */
export function paginate<T>(array: T[], pageNum = 1, pageSize = 10): {
  data: T[];
  total: number;
  pageNum: number;
  pageSize: number;
  pages: number;
} {
  const total = array.length;
  const pages = Math.ceil(total / pageSize);
  const start = (pageNum - 1) * pageSize;
  const end = start + pageSize;
  return {
    data: array.slice(start, end),
    total,
    pageNum,
    pageSize,
    pages
  };
}
