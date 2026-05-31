import { useState, useCallback, useEffect } from 'react';
import api from '@/utils/api';
import { message } from 'antd';

interface ProcurementItem {
  id: string;
  purchaseNo: string;
  materialCode: string;
  materialName: string;
  materialType: string;
  specifications: string;
  unit: string;
  purchaseQuantity: number;
  arrivedQuantity: number;
  supplierName: string;
  unitPrice: number;
  totalAmount: number;
  status: string;
  patternProductionId: string;
  sourceType: string;
}

interface HookState {
  items: ProcurementItem[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  receiveItem: (purchaseId: string) => Promise<void>;
  completeItem: (purchaseId: string) => Promise<void>;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待采购',
  received: '已领取',
  partial: '部分到货',
  partial_arrival: '部分到货',
  awaiting_confirm: '待确认完成',
  completed: '已完成',
  cancelled: '已取消',
  warehouse_pending: '待仓库出库',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'default',
  received: 'processing',
  partial: 'warning',
  partial_arrival: 'warning',
  awaiting_confirm: 'warning',
  completed: 'success',
  cancelled: 'error',
  warehouse_pending: 'processing',
};

export { STATUS_LABELS, STATUS_COLORS };

export default function useSampleProcurementQuickActions(
  styleNo: string | null,
  user: { id?: string; name?: string; username?: string } | null,
): HookState {
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!styleNo) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.get('/production/purchase/list', {
        params: { styleNo: String(styleNo).trim(), sourceType: 'sample', page: 1, pageSize: 200 },
      });
      const records = Array.isArray(res?.data?.records)
        ? (res.data.records as ProcurementItem[])
        : Array.isArray(res?.data)
          ? (res.data as ProcurementItem[])
          : [];
      setItems(records);
    } catch (e: any) {
      setError(e?.message || '加载采购数据失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [styleNo]);

  useEffect(() => {
    load();
  }, [load]);

  const userId = user?.id || '';
  const userName = user?.name || user?.username || '';

  const receiveItem = useCallback(async (purchaseId: string) => {
    try {
      await api.post('/production/purchase/receive', {
        purchaseId,
        receiverId: userId,
        receiverName: userName,
      });
      message.success('已确认到货');
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '确认到货失败');
    }
  }, [load, userId, userName]);

  const completeItem = useCallback(async (purchaseId: string) => {
    try {
      await api.post('/production/purchase/confirm-complete', { purchaseId });
      message.success('已完成采购');
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '完成采购失败');
    }
  }, [load]);

  return { items, loading, error, reload: load, receiveItem, completeItem };
}