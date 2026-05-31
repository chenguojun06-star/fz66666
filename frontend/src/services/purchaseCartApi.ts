import api from '@/utils/api';
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
  getCart: (): Promise<PurchaseCart> => {
    return api.get('/production/purchase-cart');
  },

  addItem: (data: AddCartItemRequest): Promise<AddItemResult> => {
    return api.post('/production/purchase-cart/items', data);
  },

  updateItem: (itemId: string, data: UpdateCartItemRequest): Promise<void> => {
    return api.put(`/production/purchase-cart/items/${itemId}`, data);
  },

  deleteItem: (itemId: string): Promise<void> => {
    return api.delete(`/production/purchase-cart/items/${itemId}`);
  },

  mergeItems: (data: MergeRequest): Promise<void> => {
    return api.post('/production/purchase-cart/items/merge', data);
  },

  splitItem: (data: SplitRequest): Promise<void> => {
    return api.post('/production/purchase-cart/items/split', data);
  },

  getMergeSuggestions: (): Promise<MergeSuggestion[]> => {
    return api.get('/production/purchase-cart/merge-suggestions');
  },

  preview: (): Promise<CartPreview> => {
    return api.post('/production/purchase-cart/preview');
  },

  confirm: (itemIds?: string[]): Promise<ConfirmResult> => {
    return api.post('/production/purchase-cart/confirm', itemIds || []);
  },

  clearCart: (): Promise<void> => {
    return api.delete('/production/purchase-cart');
  },
};

export default purchaseCartApi;
