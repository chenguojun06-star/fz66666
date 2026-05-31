import { useState, useCallback, useEffect } from 'react';
import { App } from 'antd';
import { purchaseCartApi } from '@/services/purchaseCartApi';
import type {
  PurchaseCart,
  PurchaseCartItem,
  AddCartItemRequest,
  UpdateCartItemRequest,
  MergeRequest,
  SplitRequest,
  CartPreview,
  MergeSuggestion,
  AddItemResult,
  ConfirmResult,
} from '@/types/purchaseCart';

export interface UsePurchaseCartOptions {
  onConfirmSuccess?: (purchaseIds: string[]) => void;
}

export function usePurchaseCart(options?: UsePurchaseCartOptions) {
  const { onConfirmSuccess } = options || {};
  const { message } = App.useApp();

  const [cart, setCart] = useState<PurchaseCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewData, setPreviewData] = useState<CartPreview | null>(null);
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const loadCart = useCallback(async () => {
    setLoading(true);
    try {
      const data = await purchaseCartApi.getCart();
      setCart(data);
      if (data.items) {
        setSelectedItems(new Set(data.items.map(item => item.id)));
      }
    } catch (error) {
      message.error('加载购物车失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  const loadMergeSuggestions = useCallback(async () => {
    try {
      const suggestions = await purchaseCartApi.getMergeSuggestions();
      setMergeSuggestions(suggestions);
    } catch (error) {
      // ignore
    }
  }, []);

  const addItem = useCallback(async (request: AddCartItemRequest): Promise<AddItemResult | null> => {
    setSubmitting(true);
    try {
      const result = await purchaseCartApi.addItem(request);
      await loadCart();
      await loadMergeSuggestions();
      return result;
    } catch (error) {
      message.error('添加物料失败');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions, message]);

  const updateItem = useCallback(async (itemId: string, request: UpdateCartItemRequest) => {
    setSubmitting(true);
    try {
      await purchaseCartApi.updateItem(itemId, request);
      await loadCart();
      await loadMergeSuggestions();
      message.success('更新成功');
    } catch (error) {
      message.error('更新失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions, message]);

  const deleteItem = useCallback(async (itemId: string) => {
    setSubmitting(true);
    try {
      await purchaseCartApi.deleteItem(itemId);
      await loadCart();
      await loadMergeSuggestions();
      message.success('删除成功');
    } catch (error) {
      message.error('删除失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions, message]);

  const mergeItems = useCallback(async (request: MergeRequest) => {
    setSubmitting(true);
    try {
      await purchaseCartApi.mergeItems(request);
      await loadCart();
      await loadMergeSuggestions();
      message.success('合并成功');
    } catch (error) {
      message.error('合并失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions, message]);

  const splitItem = useCallback(async (request: SplitRequest) => {
    setSubmitting(true);
    try {
      await purchaseCartApi.splitItem(request);
      await loadCart();
      await loadMergeSuggestions();
      message.success('拆分成功');
    } catch (error) {
      message.error('拆分失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions, message]);

  const preview = useCallback(async () => {
    setSubmitting(true);
    try {
      const data = await purchaseCartApi.preview();
      setPreviewData(data);
      setPreviewVisible(true);
    } catch (error) {
      message.error('预览失败');
    } finally {
      setSubmitting(false);
    }
  }, [message]);

  const confirm = useCallback(async (itemIds?: string[]) => {
    setSubmitting(true);
    try {
      const result: ConfirmResult = await purchaseCartApi.confirm(itemIds);
      setPreviewVisible(false);
      setPreviewData(null);
      await loadCart();
      await loadMergeSuggestions();
      message.success('下单成功！');
      if (onConfirmSuccess) {
        onConfirmSuccess(result.purchaseIds);
      }
    } catch (error) {
      message.error('下单失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions, onConfirmSuccess, message]);

  const clearCart = useCallback(async () => {
    setSubmitting(true);
    try {
      await purchaseCartApi.clearCart();
      await loadCart();
      await loadMergeSuggestions();
      message.success('购物车已清空');
    } catch (error) {
      message.error('清空失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions, message]);

  const toggleSelect = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!cart?.items) return;
    if (selectedItems.size === cart.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(cart.items.map(item => item.id)));
    }
  }, [cart?.items, selectedItems.size]);

  useEffect(() => {
    loadCart();
    loadMergeSuggestions();
  }, [loadCart, loadMergeSuggestions]);

  return {
    cart,
    loading,
    submitting,
    previewVisible,
    previewData,
    mergeSuggestions,
    selectedItems,
    loadCart,
    loadMergeSuggestions,
    addItem,
    updateItem,
    deleteItem,
    mergeItems,
    splitItem,
    preview,
    confirm,
    clearCart,
    toggleSelect,
    toggleSelectAll,
    setPreviewVisible,
  };
}
