/**
 * usePurchaseQuickEditActions — 快速编辑（备注 + 预计到货日期）
 * 从 usePurchaseActions 拆分而来，保持 API 路径/参数签名/返回值结构不变
 */
import { useState } from 'react';
import { useModal } from '@/hooks';
import api from '@/utils/api';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

interface UsePurchaseQuickEditActionsOptions {
  messageApi: any;
  fetchMaterialPurchaseList: () => Promise<void>;
  ensureOrderUnlocked: (orderKey: any) => Promise<boolean>;
}

export function usePurchaseQuickEditActions({
  messageApi,
  fetchMaterialPurchaseList,
  ensureOrderUnlocked,
}: UsePurchaseQuickEditActionsOptions) {
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const quickEditModal = useModal<MaterialPurchaseType>();

  const openQuickEditSafe = async (record: MaterialPurchaseType) => {
    const orderKey = String(record?.orderId || record?.orderNo || '').trim();
    if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
    quickEditModal.open(record);
  };

  const handleQuickEditSave = async (values: { remarks: string; expectedShipDate: string | null }) => {
    setQuickEditSaving(true);
    try {
      await api.put('/production/purchase/quick-edit', {
        id: quickEditModal.data?.id,
        remark: values.remarks,
        expectedShipDate: values.expectedShipDate,
      });
      messageApi.success('保存成功');
      quickEditModal.close();
      fetchMaterialPurchaseList();
    } catch (error: unknown) {
      const respMsg = typeof error === 'object' && error !== null && 'response' in error
        ? String((error as any).response?.data?.message || '') : '';
      messageApi.error(respMsg || (error instanceof Error ? error.message : '保存失败'));
      throw error;
    } finally { setQuickEditSaving(false); }
  };

  return {
    quickEditModal,
    quickEditSaving,
    openQuickEditSafe,
    handleQuickEditSave,
  };
}
