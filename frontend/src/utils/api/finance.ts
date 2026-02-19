import type { ApiResponse } from '../../types/api';
import { createApiClient } from './core';

const api = createApiClient();

export const updateFinanceReconciliationStatus = async (
  id: string,
  status: string
): Promise<ApiResponse> => {
  const rid = String(id || '').trim();
  const st = String(status || '').trim();
  if (!rid || !st) {
    return { code: 400, message: '参数错误', data: null };
  }
  return api.put<ApiResponse, ApiResponse>('/finance/reconciliation/status', null, {
    params: { id: rid, status: st },
  });
};

export const returnFinanceReconciliation = async (
  id: string,
  reason: string
): Promise<ApiResponse> => {
  const rid = String(id || '').trim();
  const r = String(reason || '').trim();
  if (!rid || !r) {
    return { code: 400, message: '参数错误', data: null };
  }
  return api.post<ApiResponse, ApiResponse>('/finance/reconciliation/return', { id: rid, reason: r });
};
