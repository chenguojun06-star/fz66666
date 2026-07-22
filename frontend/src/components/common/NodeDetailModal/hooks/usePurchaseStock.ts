import { useEffect, useState } from 'react';
import api from '@/utils/api';
import { buildStockMap } from '../utils';

export interface UsePurchaseStockParams {
  orderNo?: string;
}

export const usePurchaseStock = (params: UsePurchaseStockParams) => {
  const { orderNo } = params;
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  useEffect(() => {
    const no = String(orderNo || '').trim();
    if (!no) return;
    api.get<any>('/production/purchase/smart-receive-preview', { params: { orderNo: no } })
      .then((res: any) => {
        const materials: any[] = res?.data?.materials || res?.materials || [];
        setStockMap(buildStockMap(materials));
      })
      .catch(() => setStockMap({}));
  }, [orderNo]);

  return { stockMap, setStockMap };
};

export default usePurchaseStock;
