import { useEffect, useRef, useState } from 'react';
import api from '@/utils/api';

/** /demand/preview 返回的行（MaterialPurchase 实体的需求侧字段） */
export interface OrderDemandRow {
  materialCode?: string;
  materialName?: string;
  color?: string;
  size?: string;
  purchaseQuantity?: number;
  unit?: string;
}

export interface OrderDemandState {
  loading: boolean;
  rows: OrderDemandRow[];
}

/**
 * D-660：按订单号拉取该订单（含同款同日合并单）的物料需求预览（BOM 口径，含损耗）。
 * 供采购表单展示"本订单要采什么料、需求多少"，与智能采购推荐同一后端口径。
 */
export const useOrderDemandPreview = (orderNo: string | undefined): OrderDemandState => {
  const [rows, setRows] = useState<OrderDemandRow[]>([]);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const trimmed = (orderNo || '').trim();
    if (!trimmed) {
      setRows([]);
      setLoading(false);
      return;
    }
    seqRef.current += 1;
    const seq = seqRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/production/purchase/demand/preview', {
          params: { orderNo: trimmed },
        });
        if (seqRef.current !== seq) return;
        const list = res?.data;
        setRows(Array.isArray(list) ? list : []);
      } catch {
        if (seqRef.current === seq) setRows([]);
      } finally {
        if (seqRef.current === seq) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [orderNo]);

  return { rows, loading };
};
