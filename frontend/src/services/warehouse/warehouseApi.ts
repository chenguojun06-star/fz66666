/**
 * 仓库管理 API 服务
 * 覆盖成品库存、原料库存、样衣库存等仓库相关功能
 */

import api from '@/utils/api';

/**
 * 成品库存接口
 */
export interface FinishedInventory {
  id: string;
  orderNo: string;
  styleNo: string;
  styleName: string;
  styleImage?: string;
  color: string;
  size: string;
  sku: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  warehouseLocation: string;
  lastInboundDate: string;
  qualityInspectionNo?: string;
  lastInboundBy?: string;
  colors?: string[];
  sizes?: string[];
}

/**
 * SKU明细接口
 */
export interface SKUDetail {
  color: string;
  size: string;
  sku: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  warehouseLocation: string;
  outboundQty?: number;
}

/**
 * 入库记录接口
 */
export interface InboundHistory {
  id: string;
  inboundDate: string;
  qualityInspectionNo: string;
  quantity: number;
  operator: string;
  warehouseLocation: string;
  remark?: string;
}

/**
 * 出库请求接口
 */
export interface OutboundRequest {
  items: Array<{
    sku: string;
    color: string;
    size: string;
    quantity: number;
    warehouseLocation: string;
  }>;
  orderNo?: string;
  styleNo?: string;
  operator?: string;
  remark?: string;
}

/**
 * 库存统计接口
 */
export interface InventoryStats {
  totalQty: number;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
}

/**
 * 成品库存 API
 */
export const finishedInventoryApi = {
  /**
   * 获取成品库存列表
   */
  list: async (params?: {
    searchText?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }) => {
    return api.post<{
      list: FinishedInventory[];
      total: number;
      stats: InventoryStats;
    }>('/warehouse/finished-inventory/list', params || {});
  },

  /**
   * 获取SKU明细
   */
  getSKUDetails: async (styleNo: string, orderNo: string) => {
    return api.post<SKUDetail[]>('/warehouse/finished-inventory/sku-details', {
      styleNo,
      orderNo,
    });
  },

  /**
   * 成品出库
   */
  outbound: async (request: OutboundRequest) => {
    return api.post<{ success: boolean; message: string }>('/warehouse/finished-inventory/outbound', request);
  },

  /**
   * 获取入库记录
   */
  getInboundHistory: async (styleNo: string, sku: string) => {
    return api.post<InboundHistory[]>('/warehouse/finished-inventory/inbound-history', {
      styleNo,
      sku,
    });
  },

  /**
   * 获取库存统计
   */
  getStats: async () => {
    return api.get<InventoryStats>('/warehouse/finished-inventory/stats');
  },
};
