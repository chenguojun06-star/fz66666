import type { ApiResponse } from '../../types/api';
import { createApiClient } from './core';

const api = createApiClient();

export const isDuplicateScanMessage = (serverMessage: unknown): boolean => {
  const msg = String(serverMessage || '').trim();
  if (!msg) return false;
  return msg.includes('忽略') || msg.includes('无需重复') || msg.includes('已扫码');
};

export const getProductionProcessTracking = async (productionOrderId: string): Promise<ApiResponse> => {
  return api.get(`/production/process-tracking/order/${productionOrderId}`);
};

export const resetProcessTrackingRecord = async (trackingId: number, resetReason?: string): Promise<ApiResponse> => {
  return api.post(`/production/process-tracking/${trackingId}/reset`, { resetReason });
};

export const getProcessSummary = async (params?: Record<string, any>): Promise<ApiResponse> => {
  return api.post('/production/process-tracking/process-summary', params || {});
};

export const getNodeStats = async (params?: Record<string, any>): Promise<ApiResponse> => {
  return api.post('/production/process-tracking/node-stats', params || {});
};

export const toggleScanBlocked = async (bundleId: string, blocked: boolean): Promise<ApiResponse> => {
  return api.post('/production/cutting/toggle-scan-blocked', { bundleId, blocked });
};

export const qualityInspect = async (params: Record<string, any>): Promise<ApiResponse> => {
  return api.post('/production/process-tracking/quality-inspect', params);
};

export const batchQualityPass = async (trackingIds: string[]): Promise<ApiResponse> => {
  return api.post('/production/process-tracking/batch-quality-pass', { trackingIds });
};

export const lockBundle = async (trackingId: string): Promise<ApiResponse> => {
  return api.post(`/production/process-tracking/lock-bundle/${trackingId}`);
};

export const unlockBundle = async (trackingId: string): Promise<ApiResponse> => {
  return api.post(`/production/process-tracking/unlock-bundle/${trackingId}`);
};

export const repairComplete = async (trackingId: string): Promise<ApiResponse> => {
  return api.post(`/production/process-tracking/repair-complete/${trackingId}`);
};
