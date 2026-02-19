/**
 * 敏感数据脱敏工具
 *
 * 用于前端价格、金额等敏感数据的角色化显示控制。
 * 非管理员/主管角色看到的价格字段将被脱敏为 "***"。
 *
 * 使用方式：
 * import { renderMaskedPrice, usePriceVisible } from '@/utils/sensitiveDataMask';
 *
 * // 在表格列中使用
 * render: (value) => renderMaskedPrice(value, user)
 *
 * // 或使用 Hook
 * const canSeePrice = usePriceVisible();
 */

import type { UserInfo } from './AuthContext';
import { isSupervisorOrAbove } from './AuthContext';

/** 脱敏占位符 */
const MASKED_VALUE = '***';

/**
 * 判断用户是否有权查看价格/金额信息
 * 主管及以上角色可见
 */
export function canViewPrice(user: UserInfo | null): boolean {
  return isSupervisorOrAbove(user);
}

/**
 * 渲染脱敏后的价格
 * @param value 原始价格值
 * @param user 当前用户
 * @param prefix 前缀（默认 '¥'）
 * @returns 格式化的价格字符串或脱敏占位符
 */
export function renderMaskedPrice(
  value: unknown,
  user: UserInfo | null,
  prefix = '¥'
): string {
  if (!canViewPrice(user)) {
    return MASKED_VALUE;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${prefix}${n.toFixed(2)}`;
}

/**
 * 渲染脱敏后的数字（不带前缀）
 * @param value 原始数值
 * @param user 当前用户
 * @param decimals 小数位数（默认2）
 * @returns 格式化的数字字符串或脱敏占位符
 */
export function renderMaskedNumber(
  value: unknown,
  user: UserInfo | null,
  decimals = 2
): string {
  if (!canViewPrice(user)) {
    return MASKED_VALUE;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(decimals);
}
