import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { App } from 'antd';
import { useAuthState } from '@/utils/AuthContext';
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

interface PurchaseCartContextValue {
  cart: PurchaseCart | null;
  loading: boolean;
  submitting: boolean;
  previewVisible: boolean;
  previewData: CartPreview | null;
  mergeSuggestions: MergeSuggestion[];
  selectedItems: Set<string>;
  loadCart: () => Promise<void>;
  loadMergeSuggestions: () => Promise<void>;
  addItem: (request: AddCartItemRequest) => Promise<AddItemResult | null>;
  batchAddItems: (requests: AddCartItemRequest[]) => Promise<any>;
  updateItem: (itemId: string, request: UpdateCartItemRequest) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  mergeItems: (request: MergeRequest) => Promise<void>;
  splitItem: (request: SplitRequest) => Promise<void>;
  preview: () => Promise<void>;
  confirm: (itemIds?: string[]) => Promise<void>;
  clearCart: () => Promise<void>;
  toggleSelect: (itemId: string) => void;
  toggleSelectAll: () => void;
  setPreviewVisible: (v: boolean) => void;
  cartVersion: number;
}

const PurchaseCartContext = createContext<PurchaseCartContextValue | null>(null);

export const usePurchaseCartContext = () => {
  const context = useContext(PurchaseCartContext);
  if (!context) {
    throw new Error('usePurchaseCartContext must be used within PurchaseCartProvider');
  }
  return context;
};

interface PurchaseCartProviderProps {
  children: React.ReactNode;
  onConfirmSuccess?: (purchaseIds: string[]) => void;
}

export const PurchaseCartProvider: React.FC<PurchaseCartProviderProps> = ({
  children,
  onConfirmSuccess,
}) => {
  const { message } = App.useApp();
  const { isAuthenticated } = useAuthState();
  const [cart, setCart] = useState<PurchaseCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewData, setPreviewData] = useState<CartPreview | null>(null);
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [cartVersion, setCartVersion] = useState(0);

  const onConfirmSuccessRef = useRef(onConfirmSuccess);
  onConfirmSuccessRef.current = onConfirmSuccess;

  const loadCart = useCallback(async () => {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            const data = await purchaseCartApi.getCart();
            const cartData = {
                ...data,
                items: data.items || [],
            };
            setCart(cartData);
            if (cartData.items) {
                setSelectedItems(new Set(cartData.items.map((item: PurchaseCartItem) => item.id)));
            }
            setCartVersion(v => v + 1);
        } catch (error) {
            console.error('[PurchaseCart] loadCart failed:', error);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated]);

  const loadMergeSuggestions = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const suggestions = await purchaseCartApi.getMergeSuggestions();
      setMergeSuggestions(suggestions);
    } catch (error) {
      console.error('[PurchaseCart] loadMergeSuggestions failed:', error);
    }
  }, [isAuthenticated]);

  const addItem = useCallback(async (request: AddCartItemRequest): Promise<AddItemResult | null> => {
    setSubmitting(true);
    try {
      const result = await purchaseCartApi.addItem(request);
      await loadCart();
      await loadMergeSuggestions();
      setCartVersion(v => v + 1);
      return result;
    } catch (error) {
      message.error('添加物料失败');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions, message]);

  const batchAddItems = useCallback(async (requests: AddCartItemRequest[]) => {
        setSubmitting(true);
        try {
            const result = await purchaseCartApi.batchAddItems(requests);
            await loadCart();
            await loadMergeSuggestions();
            setCartVersion(v => v + 1);
            if (result.mergedCount > 0) {
                message.info(`已添加 ${result.successCount} 个物料，其中 ${result.mergedCount} 个与现有物料合并`);
            } else {
                message.success(`已添加 ${result.successCount} 个物料到购物车`);
            }
            return result;
        } catch (error) {
            console.error('[PurchaseCartContext] batchAddItems error:', error);
            message.error('批量添加物料失败');
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
      setCartVersion(v => v + 1);
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
      setCartVersion(v => v + 1);
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
      setCartVersion(v => v + 1);
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
      setCartVersion(v => v + 1);
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
      setCartVersion(v => v + 1);
      message.success('下单成功！');
      if (onConfirmSuccessRef.current) {
        onConfirmSuccessRef.current(result.purchaseIds);
      }
    } catch (error) {
      message.error('下单失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadCart, loadMergeSuggestions, message]);

  const clearCart = useCallback(async () => {
    setSubmitting(true);
    try {
      await purchaseCartApi.clearCart();
      await loadCart();
      await loadMergeSuggestions();
      setCartVersion(v => v + 1);
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
      setSelectedItems(new Set(cart.items.map((item: PurchaseCartItem) => item.id)));
    }
  }, [cart?.items, selectedItems.size]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCart(null);
      setMergeSuggestions([]);
      setSelectedItems(new Set());
      setPreviewData(null);
      setPreviewVisible(false);
      setCartVersion(0);
      return;
    }
    loadCart();
    loadMergeSuggestions();
  }, [isAuthenticated, loadCart, loadMergeSuggestions]);

  const value: PurchaseCartContextValue = {
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
    batchAddItems,
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
    cartVersion,
  };

  return (
    <PurchaseCartContext.Provider value={value}>
      {children}
    </PurchaseCartContext.Provider>
  );
};

export default PurchaseCartProvider;
