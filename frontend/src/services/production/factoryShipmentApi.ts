import api from '../../utils/api';
import type { FactoryShipment, FactoryShipmentDetail } from '../../types/production';

export interface ShipDetailItem {
  color: string;
  sizeName: string;
  quantity: number;
}

export interface ReceiveDetailItem {
  color: string;
  sizeName: string;
  quantity: number;
}

export interface QualityDetailItem {
  color: string;
  sizeName: string;
  qualifiedQty: number;
  defectiveQty: number;
}

export interface ShipParams {
  orderId: string;
  details: ShipDetailItem[];
  shipMethod?: string;
  trackingNo?: string;
  expressCompany?: string;
  remark?: string;
}

export interface ReceiveParams {
  receivedQuantity?: number;
  details?: ReceiveDetailItem[];
}

export interface QualityCheckParams {
  qualifiedQty: number;
  defectiveQty: number;
  details?: QualityDetailItem[];
}

export interface ReturnDefectiveParams {
  returnQty: number;
  details?: ShipDetailItem[];
}

export interface ShippableInfo {
  cuttingTotal: number;
  shippedTotal: number;
  remaining: number;
}

export interface ShippedDetailSum {
  color: string;
  sizes: Array<{ sizeName: string; quantity: number }>;
  total: number;
}

export const factoryShipmentApi = {
  ship: (params: ShipParams) =>
    api.post<{ code: number; data: FactoryShipment }>('/production/factory-shipment/ship', params),

  /** 收货确认（支持整单或颜色×尺码明细收货） */
  receive: (id: string, params: ReceiveParams = {}) =>
    api.post<{ code: number; data: FactoryShipment }>(
      `/production/factory-shipment/${encodeURIComponent(id)}/receive`, params),

  /** 质检 — 区分合格品/次品 */
  qualityCheck: (id: string, params: QualityCheckParams) =>
    api.post<{ code: number; data: FactoryShipment }>(
      `/production/factory-shipment/${encodeURIComponent(id)}/quality-check`, params),

  /** 次品退回返修 */
  returnDefective: (id: string, params: ReturnDefectiveParams) =>
    api.post<{ code: number; data: FactoryShipment }>(
      `/production/factory-shipment/${encodeURIComponent(id)}/return-defective`, params),

  list: (params: Record<string, unknown>) =>
    api.post<{ code: number; data: { records: FactoryShipment[]; total: number } }>(
      '/production/factory-shipment/list', params),

  listByOrder: (orderId: string) =>
    api.get<{ code: number; data: FactoryShipment[] }>(
      `/production/factory-shipment/by-order/${encodeURIComponent(orderId)}`),

  shippable: (orderId: string) =>
    api.get<{ code: number; data: ShippableInfo }>(
      `/production/factory-shipment/shippable/${encodeURIComponent(orderId)}`),

  delete: (id: string) =>
    api.delete<{ code: number; message: string }>(
      `/production/factory-shipment/${encodeURIComponent(id)}`),

  getDetails: (id: string) =>
    api.get<{ code: number; data: FactoryShipmentDetail[] }>(
      `/production/factory-shipment/${encodeURIComponent(id)}/details`),

  getOrderDetailSum: (orderId: string) =>
    api.get<{ code: number; data: ShippedDetailSum[] }>(
      `/production/factory-shipment/order-detail-sum/${encodeURIComponent(orderId)}`
    ),
};
