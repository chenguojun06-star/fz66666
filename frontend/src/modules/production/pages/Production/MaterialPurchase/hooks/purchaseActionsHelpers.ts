/**
 * purchaseActionsHelpers — usePurchaseActions 的纯函数与 API 调用
 * 仅包含无状态的 helper，供子 hook 复用
 */
import api from '@/utils/api';

export const postReturnConfirm = (payload: { purchaseId: string; confirmerId?: string; confirmerName: string; returnQuantity: number; evidenceImageUrls?: string }) =>
  api.post<{ code: number; message: string; data: boolean }>('/production/purchase/return-confirm', payload);

export const postReturnConfirmReset = (payload: { purchaseId: string; reason?: string }) =>
  api.post<{ code: number; message: string; data: boolean }>('/production/purchase/return-confirm/reset', payload);

export interface ConfirmCompletePayload {
  purchaseId: string;
  /** D-321b: 物料去向——inbound=入库到仓库 / direct_use=直接使用；缺省仅完成不记出入库 */
  movementAction?: 'inbound' | 'direct_use';
  movementQuantity?: number;
  warehouseLocation?: string;
  receiverId?: string;
  receiverName?: string;
}

export const postConfirmComplete = (payload: ConfirmCompletePayload) =>
  api.post<{ code: number; message: string; data: any }>('/production/purchase/confirm-complete', payload);

export const normalizeStatus = (status?: string) => String(status || '').trim().toLowerCase();
