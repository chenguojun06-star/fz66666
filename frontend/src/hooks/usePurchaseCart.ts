import { useCallback } from 'react';
import { usePurchaseCartContext } from '@/context/PurchaseCartContext';
import type {
  AddCartItemRequest,
  AddItemResult,
} from '@/types/purchaseCart';

export interface UsePurchaseCartOptions {
  onConfirmSuccess?: (purchaseIds: string[]) => void;
}

export function usePurchaseCart(_options?: UsePurchaseCartOptions) {
  const context = usePurchaseCartContext();

  const confirm = useCallback(async (itemIds?: string[]): Promise<void> => {
    return context.confirm(itemIds);
  }, [context]);

  return {
    ...context,
    confirm,
  };
}

export function usePurchaseCartActions() {
  const context = usePurchaseCartContext();

  const addItem = useCallback(async (request: AddCartItemRequest): Promise<AddItemResult | null> => {
    return context.addItem(request);
  }, [context]);

  const batchAddItems = useCallback(async (requests: AddCartItemRequest[]): Promise<any> => {
    return context.batchAddItems(requests);
  }, [context]);

  return {
    addItem,
    batchAddItems,
  };
}
