/**
 * usePurchaseReturnResetActions — 退回（主管级别及以上）
 * 从 usePurchaseActions 拆分而来，保持 API 路径/参数签名/返回值结构不变
 */
import { useEffect, useRef, useState } from 'react';
import { Form } from 'antd';
import { useModal } from '@/hooks';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { postReturnConfirmReset } from './purchaseActionsHelpers';

interface UsePurchaseReturnResetActionsOptions {
  message: any;
  isSupervisorOrAbove: boolean;
  currentPurchase: MaterialPurchaseType | null;
  fetchMaterialPurchaseList: () => Promise<void>;
  loadDetailByOrderNo: (orderNo: string) => Promise<void>;
  ensureOrderUnlocked: (orderKey: any) => Promise<boolean>;
  visible: boolean;
  dialogMode: 'view' | 'create' | 'preview';
}

export function usePurchaseReturnResetActions({
  message,
  isSupervisorOrAbove,
  currentPurchase,
  fetchMaterialPurchaseList,
  loadDetailByOrderNo,
  ensureOrderUnlocked,
  visible,
  dialogMode,
}: UsePurchaseReturnResetActionsOptions) {
  const [returnResetSubmitting, setReturnResetSubmitting] = useState(false);

  const returnResetModal = useModal<MaterialPurchaseType>();
  const [returnResetForm] = Form.useForm();

  const openReturnReset = async (target: MaterialPurchaseType) => {
    const orderKey = String(target?.orderId || target?.orderNo || '').trim();
    if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
    returnResetModal.open(target);
  };

  // returnReset form init
  const returnResetFormRef = useRef(returnResetForm);
  returnResetFormRef.current = returnResetForm;
  useEffect(() => {
    if (!returnResetModal.visible) return;
    returnResetFormRef.current.setFieldsValue({ reason: '' });
  }, [returnResetModal.visible]);

  const submitReturnReset = async () => {
    if (!returnResetModal.data) return;
    if (!isSupervisorOrAbove) { message.error('仅主管级别及以上可执行退回'); return; }
    try {
      setReturnResetSubmitting(true);
      const orderKey = String(returnResetModal.data?.orderId || returnResetModal.data?.orderNo || '').trim();
      if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
      const values = (await returnResetForm.validateFields()) as { reason?: string };
      const purchaseId = String(returnResetModal.data?.id || '').trim();
      if (!purchaseId) { message.error('采购任务缺少ID'); return; }
      const res = await postReturnConfirmReset({ purchaseId, reason: String(values?.reason || '').trim() });
      const result = res as { code?: number; message?: string };
      if (result?.code !== 200) throw new Error(result?.message || '退回失败');
      message.success('退回成功');
      returnResetModal.close();
      returnResetForm.resetFields();
      fetchMaterialPurchaseList();
      const no = String(currentPurchase?.orderNo || '').trim();
      if (visible && dialogMode === 'view' && no) loadDetailByOrderNo(no);
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'errorFields' in e) return;
      message.error(e instanceof Error ? e.message : '退回失败');
    } finally { setReturnResetSubmitting(false); }
  };

  return {
    returnResetModal,
    returnResetForm,
    returnResetSubmitting,
    openReturnReset,
    submitReturnReset,
  };
}
