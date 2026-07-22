import { useEffect, useState } from 'react';
import { isApiSuccess } from '@/utils/api';
import { productionOrderApi } from '@/services/production/productionApi';

interface UseOrderSummaryParams {
  orderId?: string;
  orderNo?: string;
}

export interface OrderSummary {
  orderNo?: string;
  styleNo?: string;
  orderQuantity?: number;
}

export function useOrderSummary(params: UseOrderSummaryParams) {
  const { orderId, orderNo } = params;

  const [_orderDetail, setOrderDetail] = useState<Record<string, unknown> | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummary>({
    orderNo,
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!orderId) {
        setOrderSummary({ orderNo });
        return;
      }
      try {
        const res = await productionOrderApi.list({ orderNo: orderId, page: 1, pageSize: 1 });
        if (!cancelled && isApiSuccess(res) && res?.data) {
          const data = res.data as { records?: unknown[] };
          const records = data?.records || [];
          if (records.length > 0) {
            const orderData = records[0] as any;
            setOrderDetail(orderData);
            setOrderSummary({
              orderNo: String(orderData.orderNo || orderNo || '').trim() || undefined,
              styleNo: String(orderData.styleNo || '').trim() || undefined,
              orderQuantity: Number(orderData.orderQuantity ?? 0) || 0,
            });
          }
        }
      } catch {
        if (!cancelled) setOrderSummary({ orderNo });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [orderId, orderNo]);

  return {
    orderSummary,
    _orderDetail,
  };
}
