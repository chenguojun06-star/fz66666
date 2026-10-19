import api, { unwrapApiData } from '../../utils/api';
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
  ship: async (params: ShipParams): Promise<FactoryShipment> =>
    unwrapApiData<FactoryShipment>(
      await api.post('/production/factory-shipment/ship', params),
      '发货失败',
    ),

  receive: async (id: string, params: ReceiveParams = {}): Promise<FactoryShipment> =>
    unwrapApiData<FactoryShipment>(
      await api.post(`/production/factory-shipment/${encodeURIComponent(id)}/receive`, params),
      '收货失败',
    ),

  list: async (params: Record<string, unknown>): Promise<{ records: FactoryShipment[]; total: number }> =>
    unwrapApiData<{ records: FactoryShipment[]; total: number }>(
      await api.post('/production/factory-shipment/list', params),
      '加载外发发货记录失败',
    ),

  listByOrder: async (orderId: string): Promise<FactoryShipment[]> =>
    unwrapApiData<FactoryShipment[]>(
      await api.post('/production/factory-shipment/search', { orderId }),
      '加载订单发货记录失败',
    ),

  shippable: async (orderId: string): Promise<ShippableInfo> =>
    unwrapApiData<ShippableInfo>(
      await api.get(`/production/factory-shipment/shippable/${encodeURIComponent(orderId)}`),
      '加载可发货数量失败',
    ),

  delete: async (id: string): Promise<void> => {
    await unwrapApiData<void>(
      await api.delete(`/production/factory-shipment/${encodeURIComponent(id)}`),
      '删除发货记录失败',
    );
  },

  getDetails: async (id: string): Promise<FactoryShipmentDetail[]> =>
    unwrapApiData<FactoryShipmentDetail[]>(
      await api.get(`/production/factory-shipment/${encodeURIComponent(id)}/details`),
      '加载发货明细失败',
    ),

  getOrderDetailSum: async (orderId: string): Promise<ShippedDetailSum[]> =>
    unwrapApiData<ShippedDetailSum[]>(
      await api.get(`/production/factory-shipment/order-detail-sum/${encodeURIComponent(orderId)}`),
      '加载发货汇总失败',
    ),
};
