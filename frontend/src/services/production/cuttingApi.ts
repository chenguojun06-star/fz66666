import api, { unwrapApiData } from '@/utils/api';

/**
 * D-823 裁剪用料台账 API。
 *
 * 全部走 unwrapApiData 解包（service 层统一返回裸数据），
 * 调用方直接拿 rows/汇总，不再读 .data。
 */

export interface CuttingMaterialUsageRow {
  id: string;
  cuttingTaskId: string;
  materialCode: string;
  materialName: string;
  materialType?: string;
  color?: string;
  size?: string;
  unit?: string;
  plannedAmount: number;
  issuedAmount?: number | null;
  actualUsed?: number | null;
  remnantAmount: number;
  remnantStatus: 'NONE' | 'PENDING' | 'INBOUNDED';
  remnantInboundNo?: string | null;
  unitPrice?: number;
}

export interface CuttingMaterialUsageDetail {
  rows: CuttingMaterialUsageRow[];
  cuttingQuantity?: number;
  orderQuantity?: number;
  orderNo?: string;
  styleNo?: string;
  usageConfirmed?: number;
  remnantTotal?: number;
}

export interface MaterialUsageChain {
  purchaseQuantity: number;
  arrivedQuantity: number;
  usedQuantity: number;
  returnQuantity: number;
  purchaseRemaining: number;
  cuttingPlanned: number;
  cuttingIssued: number;
  cuttingActualUsed: number;
  cuttingRemnant: number;
  remnantInbounded: number;
}

export interface SaveUsageRow {
  materialCode: string;
  issuedAmount?: number;
  actualUsed?: number;
}

export interface RemnantInboundRow {
  materialCode: string;
  quantity?: number;
  warehouseLocation?: string;
}

export const cuttingApi = {
  /** 查询某裁剪任务的用料台账 */
  detail: async (taskId: string): Promise<CuttingMaterialUsageDetail> =>
    unwrapApiData<CuttingMaterialUsageDetail>(
      await api.get(`/production/cutting-task/${encodeURIComponent(taskId)}/material-usage`),
      '用料台账加载失败',
    ),

  /** 登记实际消耗（领出/实际缺省时按 计划=领出=实际 兜底） */
  saveUsage: async (taskId: string, rows: SaveUsageRow[]): Promise<{ success: boolean; remnantTotal: number; message: string }> =>
    unwrapApiData<{ success: boolean; remnantTotal: number; message: string }>(
      await api.post(`/production/cutting-task/${encodeURIComponent(taskId)}/material-usage`, { rows }),
      '登记失败',
    ),

  /** 余料回库（quantity 缺省 = 全部余料，支持部分回库） */
  remnantInbound: async (taskId: string, rows: RemnantInboundRow[]): Promise<{
    success: boolean;
    inboundTotal: number;
    remnantTotal: number;
    message: string;
    inbounds: Array<{ materialCode: string; materialName: string; quantity: number; inboundNo: string }>;
  }> =>
    unwrapApiData<{
      success: boolean;
      inboundTotal: number;
      remnantTotal: number;
      message: string;
      inbounds: Array<{ materialCode: string; materialName: string; quantity: number; inboundNo: string }>;
    }>(
      await api.post(`/production/cutting-task/${encodeURIComponent(taskId)}/remnant-inbound`, { rows }),
      '回库失败',
    ),

  /** 采购↔裁剪全链路汇总 */
  chain: async (orderNo: string, materialCode?: string): Promise<MaterialUsageChain> =>
    unwrapApiData<MaterialUsageChain>(
      await api.get('/production/cutting-task/material-usage-chain', {
        params: { orderNo, ...(materialCode ? { materialCode } : {}) },
      }),
      '链路汇总加载失败',
    ),
};
