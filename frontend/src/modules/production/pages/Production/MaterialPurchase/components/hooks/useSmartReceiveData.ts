import { useCallback, useEffect, useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import type { MaterialItem, PickingRecord } from '@/modules/production/pages/Production/MaterialPurchase/components/smartReceiveTypes';

export const useSmartReceiveData = (orderNo?: string, open?: boolean) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [pickingRecords, setPickingRecords] = useState<PickingRecord[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const loadPreview = useCallback(async () => {
    if (!orderNo) return;
    setLoading(true);
    try {
      const res = await api.get<{
        code: number;
        data: {
          orderNo: string;
          materials: MaterialItem[];
          pickingRecords: PickingRecord[];
          totalRequired: number;
          totalAvailable: number;
          pendingCount: number;
          totalCount: number;
        };
      }>('/production/purchase/smart-receive-preview', { params: { orderNo } });

      if (res.code === 200 && res.data) {
        const mats = (res.data.materials || []).map((m: MaterialItem) => ({
          ...m,
          userPickQty: m.canPickQty,
        }));
        setMaterials(mats);
        setPickingRecords(res.data.pickingRecords || []);
        setPendingCount(res.data.pendingCount || 0);
      }
    } catch (e) {
      console.error('加载预览失败:', e);
      message.error('加载面辅料数据失败');
    } finally {
      setLoading(false);
    }
  }, [orderNo, message]);

  useEffect(() => {
    if (open && orderNo) { loadPreview(); }
    else if (!open) { setMaterials([]); setPickingRecords([]); setPendingCount(0); }
  }, [open, orderNo, loadPreview]);

  const updatePickQty = (purchaseId: string, value: number | null) => {
    setMaterials((prev) => prev.map((m) => (m.purchaseId === purchaseId ? { ...m, userPickQty: value ?? 0 } : m)));
  };

  return { loading, materials, pickingRecords, pendingCount, loadPreview, updatePickQty, setMaterials };
};
