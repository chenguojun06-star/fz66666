import api from '../../utils/api';
import type { FactoryShipment, FactoryShipmentDetail } from '../../types/production';

export interface ShipDetailItem {
  color: string;
  sizeName: string;
  quantity: number;
}

export interface ShipParams {
  orderId: string;
  details: ShipDetailItem[];
  shipMethod?: string;
  trackingNo?: string;
  expressCompany?: string;
  remark?: string;
}

export interface ShippableInfo {
  cuttingTotal: number;
  shippedTotal: number;
  remaining: number;
}

export const factoryShipmentApi = {
  ship: (params: ShipParams) =>
    api.post<{ code: number; data: FactoryShipment }>('/production/factory-shipment/ship', params),

  receive: (id: string) =>
    api.post<{ code: number; data: FactoryShipment }>(`/production/factory-shipment/${encodeURIComponent(id)}/receive`),

  list: (params: Record<string, unknown>) =>
    api.post<{ code: number; data: { records: FactoryShipment[]; total: number } }>('/production/factory-shipment/list', params),

  listByOrder: (orderId: string) =>
    api.get<{ code: number; data: FactoryShipment[] }>(`/production/factory-shipment/by-order/${encodeURIComponent(orderId)}`),

  shippable: (orderId: string) =>
    api.get<{ code: number; data: ShippableInfo }>(`/production/factory-shipment/shippable/${encodeURIComponent(orderId)}`),

  delete: (id: string) =>
    api.delete<{ code: number; message: string }>(`/production/factory-shipment/${encodeURIComponent(id)}`),
  getDetails: (id: string) =>
    api.get<{ code: number; data: FactoryShipmentDetail[] }>(`/production/factory-shipment/${encodeURIComponent(id)}/details`),
};
