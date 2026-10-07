import api from '@/utils/api';

/**
 * D-763：C端店铺管理服务。
 * 公开侧（游客）接口在 /shop/public/**，不走这里；这里是管理端 /shop/admin/**。
 */

export interface ShopConfig {
  id: string;
  tenantId: number;
  slug: string;
  shopName: string;
  notice?: string;
  enabled: number;
}

export interface ShopOrder {
  id: string;
  orderNo: string;
  customerId?: string;
  customerName: string;
  phone: string;
  address: string;
  totalAmount: number;
  itemCount: number;
  status: 'PENDING_SHIP' | 'SHIPPED' | 'CANCELLED';
  receivableId?: string;
  outstockNo?: string;
  remark?: string;
  createTime: string;
}

export const shopAdminApi = {
  /** 店铺配置（首次访问自动建档，slug=t{tenantId}，默认打烊） */
  getConfig: () => api.get<ShopConfig>('/shop/admin/config'),

  /** 更新配置（名称/公告/打烊开关） */
  saveConfig: (body: { shopName?: string; notice?: string; enabled?: number | boolean }) =>
    api.post<null>('/shop/admin/config', body),

  /** 上架/下架款式 */
  setListing: (styleId: number | string, listed: boolean) =>
    api.post<null>(`/shop/admin/listing/${styleId}?listed=${listed}`),

  /** 店铺订单分页 */
  orders: (params: { page?: number; pageSize?: number; status?: string; keyword?: string }) =>
    api.post<{ records: ShopOrder[]; total: number; current: number; pages: number }>(
      '/shop/admin/orders',
      params,
    ),
};

export default shopAdminApi;
