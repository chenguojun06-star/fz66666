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

void _postSave;
