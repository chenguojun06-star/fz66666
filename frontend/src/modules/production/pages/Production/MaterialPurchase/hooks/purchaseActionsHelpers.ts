/**
 * purchaseActionsHelpers — usePurchaseActions 的纯函数与 API 调用
 * 仅包含无状态的 helper，供子 hook 复用
 */
import api from '@/utils/api';

export const postReturnConfirm = (payload: { purchaseId: string; confirmerId?: string; confirmerName: string; returnQuantity: number; evidenceImageUrls?: string }) =>
  api.post<{ code: number; message: string; data: boolean }>('/production/purchase/return-confirm', payload);

export const postReturnConfirmReset = (payload: { purchaseId: string; reason?: string }) =>
  api.post<{ code: number; message: string; data: boolean }>('/production/purchase/return-confirm/reset', payload);

export const postConfirmComplete = (payload: { purchaseId: string }) =>
  api.post<{ code: number; message: string; data: any }>('/production/purchase/confirm-complete', payload);

export const normalizeStatus = (status?: string) => String(status || '').trim().toLowerCase();
