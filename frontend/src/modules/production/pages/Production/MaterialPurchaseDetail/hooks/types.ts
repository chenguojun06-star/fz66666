import api from '@/utils/api';
import type { MaterialPurchase } from '@/types/production';

// ===== API 响应类型 =====
export interface ApiResult<T> {
  code: number;
  data: T;
  message?: string;
}

export interface PageResult<T> {
  records: T[];
  total?: number;
}

export type MaterialPurchaseListResponse = ApiResult<PageResult<MaterialPurchase>> & { records?: MaterialPurchase[] };

export interface PurchaseListParams {
  orderNo?: string;
  styleNo?: string;
  sourceType?: string;
  page: number;
  pageSize: number;
}

// ===== API 调用函数 =====
// 注意：_postSave 保留与原文件一致的私有未使用状态（下划线前缀）
const _postSave = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase', payload);

export const postReceive = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase/receive', payload);

export const postReturnConfirm = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase/return-confirm', payload);

export const postCancelReceive = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase/cancel-receive', payload);

export const postConfirmComplete = (payload: { purchaseId: string }) =>
  api.post<{ code: number; message?: string }>('/production/purchase/confirm-complete', payload);

// ===== 校验常量 =====
export const REQUIRED_FIELDS: (keyof MaterialPurchase)[] = ['materialType', 'materialCode', 'materialName', 'unit', 'supplierName'];

/**
 * 采购硬阻断字段（供应商缺失不阻断采购操作，仅保存时要求补全）
 * 修复：此前任一行缺供应商会禁用整单所有物料的采购/批量采购按钮（过度惩罚）
 */
const PURCHASE_CRITICAL_FIELDS: (keyof MaterialPurchase)[] = ['materialType', 'materialCode', 'materialName', 'unit'];
const PURCHASE_FIELD_LABELS: Record<string, string> = {
  materialType: '物料类型',
  materialCode: '物料编码',
  materialName: '物料名称',
  unit: '单位',
};

/** 单条采购记录是否具备采购操作所需的本体信息（不含供应商） */
export const isPurchaseRowComplete = (record: MaterialPurchase): boolean =>
  PURCHASE_CRITICAL_FIELDS.every((field) => {
    const val = record[field];
    return !(val === undefined || val === null || String(val).trim() === '');
  });

/** 返回单条采购记录缺失的硬阻断字段中文名（用于行级禁用与提示） */
export const getPurchaseMissingFields = (record: MaterialPurchase): string[] =>
  PURCHASE_CRITICAL_FIELDS
    .filter((field) => {
      const val = record[field];
      return val === undefined || val === null || String(val).trim() === '';
    })
    .map((field) => PURCHASE_FIELD_LABELS[field] || String(field));

void _postSave;
