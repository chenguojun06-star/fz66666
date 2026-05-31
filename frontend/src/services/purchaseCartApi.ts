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
};

export default purchaseCartApi;