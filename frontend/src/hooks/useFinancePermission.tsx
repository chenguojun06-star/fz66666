/**
 * 财务数据权限Hook
 * 提供三级权限判断和工具方法
 *
 * 🔴 最高权限：FINANCE_TOTAL_AMOUNT_VIEW - 查看所有单价和金额
 * 🟡 中级权限：FINANCE_SEWING_PRICE_ONLY - 只能查看车缝单价
 * 🟢 基础权限：FINANCE_BASIC_DATA_ONLY - 只能查看基础数据
 */

import React from 'react';
import { useAppContext } from '@/utils/AppContext';

/**
 * 财务权限Hook返回类型
 */
export interface FinancePermission {
  /** 🔴 是否有最高权限（查看所有单价和金额） */
  canViewTotalAmount: boolean;

  /** 🟡 是否有中级权限（只能查看车缝单价） */
  canViewSewingOnly: boolean;

  /** 🟢 是否只有基础权限（只看基础数据，无单价） */
  canViewBasicOnly: boolean;

  /**
   * 判断特定工序是否可见单价
   * @param processName 工序名称（如：裁剪、车缝、质检、包装）
   * @returns true 表示可见单价，false 表示隐藏
   */
  canViewProcessPrice: (processName: string) => boolean;

  /**
   * 格式化单价显示（自动根据权限判断）
   * @param value 单价金额
   * @param processName 工序名称（可选，用于中级权限判断）
   * @returns 格式化后的字符串或 JSX 元素
   */
  formatPrice: (value: number, processName?: string) => string | React.ReactNode;

  /**
   * 格式化金额显示（自动根据权限判断）
   * @param value 金额
   * @param processName 工序名称（可选，用于中级权限判断）
   * @returns 格式化后的字符串或 JSX 元素
   */
  formatAmount: (value: number, processName?: string) => string | React.ReactNode;
}

/**
 * 车缝相关工序列表（车间主任可见）
 */
const SEWING_PROCESSES = ['车缝', '上领', '缝纫', '锁边', '包边'];

/**
 * 格式化金额为货币字符串
 * @param value 金额
 * @returns 格式化后的字符串（如：1,234.56）
 */
const toMoneyText = (value: number): string => {
  if (value === null || value === undefined) return '0.00';
  return value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * 财务数据权限Hook
 *
 * @example
 * ```typescript
 * const { canViewTotalAmount, canViewSewingOnly, formatPrice } = useFinancePermission();
 *
 * // 条件渲染
 * {canViewTotalAmount && <Statistic title="总金额" value={12345} />}
 *
 * // 格式化单价
 * <span>{formatPrice(15.5, '车缝')}</span>
 * ```
 */
export const useFinancePermission = (): FinancePermission => {
  const { userPermissions } = useAppContext();

  // 🔴 最高权限：查看所有单价和金额
  const canViewTotalAmount = userPermissions.includes('FINANCE_TOTAL_AMOUNT_VIEW');

  // 🟡 中级权限：只能查看车缝单价
  const canViewSewingOnly = userPermissions.includes('FINANCE_SEWING_PRICE_ONLY');

  // 🟢 基础权限：只能查看基础数据（无单价）
  const canViewBasicOnly = userPermissions.includes('FINANCE_BASIC_DATA_ONLY');

  /**
   * 判断特定工序是否可见单价
   */
  const canViewProcessPrice = (processName: string): boolean => {
    // 🔴 最高权限：所有工序可见
    if (canViewTotalAmount) {
      return true;
    }

    // 🟡 中级权限：只有车缝相关工序可见
    if (canViewSewingOnly) {
      return SEWING_PROCESSES.includes(processName);
    }

    // 🟢 基础权限：所有工序不可见
    return false;
  };

  /**
   * 格式化单价显示
   */
  const formatPrice = (value: number, processName?: string): string | React.ReactNode => {
    // 🔴 最高权限：显示所有单价
    if (canViewTotalAmount) {
      return `¥${toMoneyText(value)}`;
    }

    // 🟡 中级权限：只显示车缝单价
    if (canViewSewingOnly && processName) {
      if (SEWING_PROCESSES.includes(processName)) {
        return `¥${toMoneyText(value)}`;
      }
    }

    // 🟢 无权限或非车缝工序：显示 ***
    return '***';
  };

  /**
   * 格式化金额显示
   */
  const formatAmount = (value: number, processName?: string): string | React.ReactNode => {
    // 🔴 最高权限：显示所有金额
    if (canViewTotalAmount) {
      return `¥${toMoneyText(value)}`;
    }

    // 🟡 中级权限：只显示车缝金额
    if (canViewSewingOnly && processName) {
      if (SEWING_PROCESSES.includes(processName)) {
        return `¥${toMoneyText(value)}`;
      }
    }

    // 🟢 无权限或非车缝工序：显示 ***
    return '***';
  };

  return {
    canViewTotalAmount,
    canViewSewingOnly,
    canViewBasicOnly,
    canViewProcessPrice,
    formatPrice,
    formatAmount,
  };
};

/**
 * 扩展：格式化颜色单价（根据权限返回不同颜色）
 *
 * @example
 * ```typescript
 * const ColoredPrice = ({ value, processName }: { value: number; processName: string }) => {
 *   const { canViewTotalAmount, canViewSewingOnly, formatPrice } = useFinancePermission();
 *
 *   return (
 *     <span style={{
 *       color: canViewTotalAmount ? '#f59e0b' : canViewSewingOnly ? '#10b981' : '#999',
 *       fontWeight: canViewTotalAmount || canViewSewingOnly ? 600 : 400
 *     }}>
 *       {formatPrice(value, processName)}
 *     </span>
 *   );
 * };
 * ```
 */
export const formatColoredPrice = (
  value: number,
  processName: string,
  permissions: FinancePermission
): React.ReactNode => {
  const { canViewTotalAmount, canViewSewingOnly, formatPrice } = permissions;

  const style: React.CSSProperties = {
    color: canViewTotalAmount ? '#f59e0b' : canViewSewingOnly ? '#10b981' : '#999',
    fontWeight: canViewTotalAmount || canViewSewingOnly ? 600 : 400,
    fontSize: '14px',
  };

  return <span style={style}>{formatPrice(value, processName)}</span>;
};

/**
 * 扩展：格式化颜色金额（根据权限返回不同颜色）
 */
export const formatColoredAmount = (
  value: number,
  processName: string,
  permissions: FinancePermission
): React.ReactNode => {
  const { canViewTotalAmount, canViewSewingOnly, formatAmount } = permissions;

  const style: React.CSSProperties = {
    color: canViewTotalAmount ? '#ef4444' : canViewSewingOnly ? '#10b981' : '#999',
    fontWeight: canViewTotalAmount || canViewSewingOnly ? 700 : 400,
    fontSize: canViewTotalAmount ? '15px' : '14px',
  };

  return <span style={style}>{formatAmount(value, processName)}</span>;
};
