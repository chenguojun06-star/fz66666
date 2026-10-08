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
  /** 快递公司（发货后） */
  expressCompany?: string | null;
  /** 快递单号（发货后） */
  expressNo?: string | null;
  /** 发货时间（发货后） */
  shipTime?: string | null;
  /** 取消原因（取消后） */
  cancelReason?: string | null;
  /** 取消时间（取消后） */
  cancelTime?: string | null;
  remark?: string;
  createTime: string;
}

/** 订单商品明细行 */
export interface ShopOrderItem {
  id: string;
  skuCode?: string;
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
  unitPrice?: number | null;
  quantity?: number | null;
  amount?: number | null;
}

/** 订单详情（订单头 + 明细） */
export interface ShopOrderDetail {
  order: ShopOrder;
  items: ShopOrderItem[];
}

/** 订单概览统计 */
export interface ShopOrderStats {
  pendingShip: number;
  todayOrders: number;
  todayAmount: number;
  totalOrders: number;
  totalAmount: number;
}

/** 批量发货结果 */
export interface BatchShipResult {
  shipped: number;
  failed: string[];
}

/** 款式维度的 SKU 聚合（D-768 店铺商品列表用） */
export interface ShopSkuSummary {
  minPrice?: number | null;
  maxPrice?: number | null;
  totalStock?: number;
  colorCount?: number;
  skuCount?: number;
}

/** 店铺商品运营：SKU 售价 + 库存（D-768） */
export interface BatchSaveSkuItem {
  skuId: number | string;
  /** 不传表示不改售价 */
  salesPrice?: number | null;
  /** 不传表示不改库存；传的是「目标值」，服务端换算增减量 */
  stockQuantity?: number | null;
}

export interface BatchSaveSkuResult {
  priceChanged: number;
  stockChanged: number;
  /** skuId → 更新后的真实库存（可能被钳制，用于回显提示） */
  stockAfter: Record<string, number>;
}

/** 店铺商品的 SKU 原始行（来自 /style/sku/search） */
export interface ShopStyleSku {
  id: number;
  skuCode?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  skuColorImage?: string | null;
  salesPrice?: number | null;
  tagPrice?: number | null;
  stockQuantity?: number | null;
  skuMode?: 'AUTO' | 'MANUAL';
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

  /** 订单发货（待发货 → 已发货；快递公司与单号选填，自提/同城配送可不填） */
  shipOrder: (orderId: string, body?: { expressCompany?: string; expressNo?: string }) =>
    api.post<null>(`/shop/admin/orders/${orderId}/ship`, body ?? {}),

  /** 批量发货（逐条独立，返回成功数与被跳过原因） */
  batchShipOrders: (orderIds: string[], body?: { expressCompany?: string; expressNo?: string }) =>
    api.post<BatchShipResult>('/shop/admin/orders/batch-ship', {
      orderIds,
      expressCompany: body?.expressCompany,
      expressNo: body?.expressNo,
    }),

  /** 订单详情（订单头 + 商品明细） */
  orderDetail: (orderId: string) => api.post<ShopOrderDetail>(`/shop/admin/orders/${orderId}/detail`, {}),

  /** 取消订单（仅待发货；会回补库存并撤销挂账应收） */
  cancelOrder: (orderId: string, reason?: string) =>
    api.post<null>(`/shop/admin/orders/${orderId}/cancel`, { reason }),

  /** 商家备注（买家不可见） */
  updateOrderRemark: (orderId: string, remark: string) =>
    api.post<null>(`/shop/admin/orders/${orderId}/remark`, { remark }),

  /** 订单概览统计 */
  orderStats: () => api.get<ShopOrderStats>('/shop/admin/orders/stats'),

  /** 款式维度 SKU 聚合：售价区间 / 可售总量 / 颜色数（列表展示用，避免逐行 N+1） */
  skuSummary: (styleIds: Array<number | string>) =>
    api.post<{ items: Record<string, ShopSkuSummary> }>('/shop/admin/sku/summary', { styleIds }),

  /** 批量保存 SKU 售价 + 库存（库存为「目标值」，服务端换算增减量并留操作日志） */
  batchSaveSku: (styleId: number | string, items: BatchSaveSkuItem[]) =>
    api.post<BatchSaveSkuResult>('/shop/admin/sku/batch-save', { styleId, items }),
};

/**
 * 店铺商品编辑依赖的「款式 / SKU」接口（系统既有能力，非店铺专属）。
 * D-768：单独成组，避免与 /shop/admin/** 混淆。
 */
export const shopProductApi = {
  /** 款式列表（keyword 对 款号/款名/品类 做 OR 模糊匹配；勿同时传 styleName+styleNo） */
  listStyles: (params: { keyword?: string; page?: number; pageSize?: number }) =>
    api.get<{ records: ShopStyleInfoRow[]; total: number }>('/style/info/list', { params }),

  /** 款式详情（取 cover / remark 等） */
  getStyle: (id: number | string) => api.get<ShopStyleInfoRow>(`/style/info/${id}`),

  /** 保存款式字段（主图 cover / 商品说明 remark） */
  updateStyle: (body: { id: number | string; cover?: string | null; remark?: string | null }) =>
    api.put<unknown>('/style/info', body),

  /** 某款式全部 SKU */
  searchSkus: (styleId: number | string) =>
    api.post<ShopStyleSku[]>('/style/sku/search', { styleId }),

  /** 某款号的颜色 → 图片映射 */
  listColorImages: (styleNo: string) =>
    api.get<Record<string, string>>(`/style/sku/color-images/${encodeURIComponent(styleNo)}`),

  /** 保存颜色 → 图片映射 */
  saveColorImages: (styleId: number | string, map: Record<string, string>) =>
    api.put<unknown>(`/style/sku/color-images/${styleId}`, map),
};

/** /style/info/list 返回的行（只声明店铺运营用到的字段） */
export interface ShopStyleInfoRow {
  id: number;
  styleNo?: string;
  styleName?: string;
  cover?: string | null;
  remark?: string | null;
  salesPrice?: number | null;
  tagPrice?: number | null;
  shopListed?: number;
  shopListingTime?: string | null;
}

export default shopAdminApi;
