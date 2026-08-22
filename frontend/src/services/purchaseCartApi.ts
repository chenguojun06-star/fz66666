import api, { unwrapApiData } from '@/utils/api';
import type {
  PurchaseCart,
  AddCartItemRequest,
  UpdateCartItemRequest,
  MergeRequest,
  SplitRequest,
  CartPreview,
  MergeSuggestion,
  AddItemResult,
  ConfirmResult,
} from '@/types/purchaseCart';
import type {
  SmartSourcingFilter,
  SmartSourcingOrdersPage,
  SmartSourcingOverviewResponse,
  NetDemandDetail,
} from '@/types/smartSourcing';

export const purchaseCartApi = {
  getCart: async (): Promise<PurchaseCart> => {
    const res = await api.get('/production/purchase-cart');
    return unwrapApiData<PurchaseCart>(res, '获取购物车失败');
  },

  addItem: async (data: AddCartItemRequest): Promise<AddItemResult> => {
    const res = await api.post('/production/purchase-cart/items', data);
    return unwrapApiData<AddItemResult>(res, '添加物料失败');
  },

  batchAddItems: async (items: AddCartItemRequest[]): Promise<{
    totalCount: number;
    successCount: number;
    mergedCount: number;
    mergeSuggestions: MergeSuggestion[];
  }> => {
    const res = await api.post('/production/purchase-cart/items/batch', { items });
    return unwrapApiData(res, '批量添加失败');
  },

  updateItem: async (itemId: string, data: UpdateCartItemRequest): Promise<void> => {
    await api.put(`/production/purchase-cart/items/${itemId}`, data);
  },

  deleteItem: async (itemId: string): Promise<void> => {
    await api.delete(`/production/purchase-cart/items/${itemId}`);
  },

  mergeItems: async (data: MergeRequest): Promise<void> => {
    await api.post('/production/purchase-cart/items/merge', data);
  },

  splitItem: async (data: SplitRequest): Promise<void> => {
    await api.post('/production/purchase-cart/items/split', data);
  },

  getMergeSuggestions: async (): Promise<MergeSuggestion[]> => {
    const res = await api.get('/production/purchase-cart/merge-suggestions');
    return unwrapApiData<MergeSuggestion[]>(res, '获取合并建议失败');
  },

  preview: async (): Promise<CartPreview> => {
    const res = await api.post('/production/purchase-cart/preview');
    return unwrapApiData<CartPreview>(res, '预览失败');
  },

  confirm: async (itemIds?: string[]): Promise<ConfirmResult> => {
    const res = await api.post('/production/purchase-cart/confirm', itemIds || []);
    return unwrapApiData<ConfirmResult>(res, '下单失败');
  },

  clearCart: async (): Promise<void> => {
    await api.delete('/production/purchase-cart');
  },

  // ── 智能采购建议 ──

  /** 为单个订单生成智能采购建议（推送到购物车草稿） */
  generateSmartSourcing: async (orderNo: string): Promise<Record<string, unknown>> => {
    const res = await api.post(`/production/smart-sourcing/generate/${encodeURIComponent(orderNo)}`);
    return unwrapApiData<Record<string, unknown>>(res, '生成智能采购建议失败');
  },

  /** 批量为多个订单生成智能采购建议 */
  generateSmartSourcingBatch: async (orderNos: string[]): Promise<Record<string, unknown>> => {
    const res = await api.post('/production/smart-sourcing/generate-batch', orderNos);
    return unwrapApiData<Record<string, unknown>>(res, '批量生成智能采购建议失败');
  },

  /** 查询订单的物料净需求（预览，含智能推荐：供应商/历史采购价/推荐理由） */
  getNetDemand: async (orderNo: string): Promise<NetDemandDetail[]> => {
    const res = await api.get(`/production/smart-sourcing/net-demand/${encodeURIComponent(orderNo)}`);
    return unwrapApiData<NetDemandDetail[]>(res, '查询物料净需求失败');
  },

  // ── 智能采购推荐 V2：待采购订单列表 & 批量概览 & 详情缓存 ──
  // 契约核对记录（2026-08-22）：后端 SmartSourcingController + dto/smart/* 逐字段对齐

  /**
   * 分页查询待采购订单（轻量，1次SQL，仅订单表，不做净需求计算）
   * 请求体 = SmartSourcingFilter（后端有默认值 + clamp 硬保护）
   */
  listSourcingOrders: async (filter: SmartSourcingFilter): Promise<SmartSourcingOrdersPage> => {
    const res = await api.post('/production/smart-sourcing/orders', filter);
    return unwrapApiData<SmartSourcingOrdersPage>(res, '查询待采购订单失败');
  },

  /**
   * 批量计算订单缺料概览（后端批量SQL优化 + Caffeine 2h缓存，单次≤20单）
   * ⚠️ 后端 @RequestBody Map：必须传 { orderNos: [...], forceRefresh? }，
   *    不能直接传数组（会导致 JSON 反序列化 400）
   */
  buildOrdersOverview: async (
    orderNos: string[],
    forceRefresh = false,
  ): Promise<SmartSourcingOverviewResponse> => {
    const res = await api.post('/production/smart-sourcing/orders-overview', {
      orderNos,
      forceRefresh,
    });
    return unwrapApiData<SmartSourcingOverviewResponse>(res, '批量计算订单缺料失败');
  },

  /** 单订单明细（同 net-demand 结构，读 Caffeine 2h 缓存；forceRefresh=true 忽略缓存重算） */
  getOrderDetailCached: async (
    orderNo: string,
    forceRefresh = false,
  ): Promise<NetDemandDetail[]> => {
    const res = await api.get(
      `/production/smart-sourcing/orders-detail/${encodeURIComponent(orderNo)}`,
      { params: forceRefresh ? { forceRefresh: true } : undefined },
    );
    return unwrapApiData<NetDemandDetail[]>(res, '查询订单采购详情失败');
  },
};

export default purchaseCartApi;