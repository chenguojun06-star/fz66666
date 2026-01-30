import React from 'react';
import { UserInfo } from './AuthContext';

/**
 * 权限检查工具函数
 */

/**
 * 检查用户是否拥有指定权限
 * @param user 用户信息
 * @param permissionCode 权限编码
 * @returns 是否拥有权限
 */
export function hasPermission(user: UserInfo | null, permissionCode: string): boolean {
  if (!user) return false;

  // 管理员拥有所有权限
  const role = (user.role || '').toLowerCase();
  if (role.includes('admin') || role.includes('管理员') || user.roleId === '1') {
    return true;
  }

  // 检查权限列表
  const permissions = user.permissions || [];
  if (permissions.includes('all')) return true;

  return permissions.includes(permissionCode);
}

/**
 * 检查用户是否拥有任意一个权限
 * @param user 用户信息
 * @param permissionCodes 权限编码数组
 * @returns 是否拥有权限
 */
export function hasAnyPermission(user: UserInfo | null, permissionCodes: string[]): boolean {
  if (!user || !permissionCodes || permissionCodes.length === 0) return false;
  return permissionCodes.some(code => hasPermission(user, code));
}

/**
 * 检查用户是否拥有所有权限
 * @param user 用户信息
 * @param permissionCodes 权限编码数组
 * @returns 是否拥有权限
 */
export function hasAllPermissions(user: UserInfo | null, permissionCodes: string[]): boolean {
  if (!user || !permissionCodes || permissionCodes.length === 0) return false;
  return permissionCodes.every(code => hasPermission(user, code));
}

/**
 * 权限按钮组件包装器
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  permissionCode: string
): React.FC<P> {
  return (props: P) => {
    void permissionCode;
    // 这个组件需要在AuthContext中使用
    // 实际使用时需要配合useAuth hook
    return React.createElement(Component, props);
  };
}

// 功能按钮权限编码定义
export const PERMISSION_CODES = {
  // 样衣开发
  STYLE_CREATE: 'STYLE_CREATE',
  STYLE_EDIT: 'STYLE_EDIT',
  STYLE_DELETE: 'STYLE_DELETE',
  STYLE_IMPORT: 'STYLE_IMPORT',
  STYLE_EXPORT: 'STYLE_EXPORT',

  // 订单管理
  ORDER_CREATE: 'ORDER_CREATE',
  ORDER_EDIT: 'ORDER_EDIT',
  ORDER_DELETE: 'ORDER_DELETE',
  ORDER_CANCEL: 'ORDER_CANCEL',
  ORDER_COMPLETE: 'ORDER_COMPLETE',
  ORDER_IMPORT: 'ORDER_IMPORT',
  ORDER_EXPORT: 'ORDER_EXPORT',
  ORDER_TRANSFER: 'ORDER_TRANSFER',

  // 物料采购
  PURCHASE_CREATE: 'PURCHASE_CREATE',
  PURCHASE_EDIT: 'PURCHASE_EDIT',
  PURCHASE_DELETE: 'PURCHASE_DELETE',
  PURCHASE_RECEIVE: 'PURCHASE_RECEIVE',
  PURCHASE_RETURN_CONFIRM: 'PURCHASE_RETURN_CONFIRM',
  PURCHASE_GENERATE: 'PURCHASE_GENERATE',

  // 裁剪管理
  CUTTING_CREATE: 'CUTTING_CREATE',
  CUTTING_EDIT: 'CUTTING_EDIT',
  CUTTING_DELETE: 'CUTTING_DELETE',
  CUTTING_SCAN: 'CUTTING_SCAN',

  // 生产进度
  PROGRESS_SCAN: 'PROGRESS_SCAN',
  PROGRESS_EDIT: 'PROGRESS_EDIT',
  PROGRESS_DELETE: 'PROGRESS_DELETE',

  // 质检入库
  WAREHOUSING_CREATE: 'WAREHOUSING_CREATE',
  WAREHOUSING_EDIT: 'WAREHOUSING_EDIT',
  WAREHOUSING_DELETE: 'WAREHOUSING_DELETE',
  WAREHOUSING_ROLLBACK: 'WAREHOUSING_ROLLBACK',

  // 物料对账
  MATERIAL_RECON_CREATE: 'MATERIAL_RECON_CREATE',
  MATERIAL_RECON_EDIT: 'MATERIAL_RECON_EDIT',
  MATERIAL_RECON_DELETE: 'MATERIAL_RECON_DELETE',
  MATERIAL_RECON_AUDIT: 'MATERIAL_RECON_AUDIT',
  MATERIAL_RECON_SETTLEMENT: 'MATERIAL_RECON_SETTLEMENT',

  // 成品结算
  SHIPMENT_RECON_CREATE: 'SHIPMENT_RECON_CREATE',
  SHIPMENT_RECON_EDIT: 'SHIPMENT_RECON_EDIT',
  SHIPMENT_RECON_DELETE: 'SHIPMENT_RECON_DELETE',
  SHIPMENT_RECON_AUDIT: 'SHIPMENT_RECON_AUDIT',

  // 审批付款
  PAYMENT_APPROVE: 'PAYMENT_APPROVE',
  PAYMENT_REJECT: 'PAYMENT_REJECT',
  PAYMENT_CANCEL: 'PAYMENT_CANCEL',

  // 系统管理
  USER_CREATE: 'USER_CREATE',
  USER_EDIT: 'USER_EDIT',
  USER_DELETE: 'USER_DELETE',
  USER_RESET_PASSWORD: 'USER_RESET_PASSWORD',

  ROLE_CREATE: 'ROLE_CREATE',
  ROLE_EDIT: 'ROLE_EDIT',
  ROLE_DELETE: 'ROLE_DELETE',

  FACTORY_CREATE: 'FACTORY_CREATE',
  FACTORY_EDIT: 'FACTORY_EDIT',
  FACTORY_DELETE: 'FACTORY_DELETE',

  // 数据导入导出
  DATA_IMPORT: 'DATA_IMPORT',
  DATA_EXPORT: 'DATA_EXPORT',

  // 模板中心
  TEMPLATE_UPLOAD: 'TEMPLATE_UPLOAD',
  TEMPLATE_DELETE: 'TEMPLATE_DELETE',
} as const;

export type PermissionCode = typeof PERMISSION_CODES[keyof typeof PERMISSION_CODES];
