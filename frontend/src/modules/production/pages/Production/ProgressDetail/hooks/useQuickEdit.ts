import { useState } from 'react';
import { ProductionOrder } from '@/types/production';
import { productionOrderApi } from '@/services/production/productionApi';

interface UseQuickEditOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any;
  fetchOrders: () => Promise<void>;
}

/**
 * 快速编辑弹窗状态 + 保存逻辑
 */
export const useQuickEdit = ({ message, fetchOrders }: UseQuickEditOptions) => {
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [quickEditRecord, setQuickEditRecord] = useState<ProductionOrder | null>(null);
  const [quickEditSaving, setQuickEditSaving] = useState(false);

  const handleQuickEdit = (order: ProductionOrder) => {
    setQuickEditRecord(order);
    setQuickEditVisible(true);
  };

  const handleQuickEditSave = async (values: { remarks: string; expectedShipDate: string | null }) => {
    setQuickEditSaving(true);
    try {
      await productionOrderApi.quickEdit({ id: quickEditRecord?.id, ...values });
      message.success('编辑成功');
      setQuickEditVisible(false);
      setQuickEditRecord(null);
      await fetchOrders();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '编辑失败');
      throw err;
    } finally {
      setQuickEditSaving(false);
    }
  };

  return {
    quickEditVisible,
    quickEditRecord,
    quickEditSaving,
    setQuickEditVisible,
    setQuickEditRecord,
    handleQuickEdit,
    handleQuickEditSave,
  };
};
