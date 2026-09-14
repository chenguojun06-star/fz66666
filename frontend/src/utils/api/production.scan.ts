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

// ────────────────────────────────────────────
// 生产环节配置（stage-config）：可操作人 + 预计时长 + 监控开关
// ────────────────────────────────────────────

export interface StageOperator {
  id: string;
  name: string;
}

export interface StageConfigItem {
  /** 后端主键（新建时为空） */
  id?: number;
  /** 父环节名：采购/裁剪/二次工艺/车缝/尾部/入库 */
  stageName: string;
  /** 预计时长（天），仅展示+超期预警，不参与交期计算 */
  expectedDays: number;
  /** 可操作人列表；空=所有人员可操作 */
  operators?: StageOperator[];
  /** 可操作人 JSON 字符串（后端存储载体） */
  operatorsJson?: string;
  /** 监控开关：1=开启超期预警 */
  monitorSwitch: number;
  /** 默认存在环节(采购/入库)=1，不展示在工序列表 */
  defaultStage: number;
}

/** 读取全部生效环节配置（PC配置页 + 小程序/H5 只读展示共用） */
export const getStageConfig = async (): Promise<ApiResponse> => {
  return api.get('/production/stage-config');
};

/** 保存环节配置（仅管理员） */
export const saveStageConfig = async (configs: StageConfigItem[]): Promise<ApiResponse> => {
  return api.put('/production/stage-config', configs);
};
