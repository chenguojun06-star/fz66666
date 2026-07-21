/**
 * usePurchaseReturnConfirmActions — 回料确认 + 批量回料
 * 从 usePurchaseActions 拆分而来，保持 API 路径/参数签名/返回值结构不变
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Form } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { useModal } from '@/hooks';
import api from '@/utils/api';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { normalizeStatus, postReturnConfirm } from './purchaseActionsHelpers';

interface UsePurchaseReturnConfirmActionsOptions {
  message: any;
  user: any;
  currentPurchase: MaterialPurchaseType | null;
  fetchMaterialPurchaseList: () => Promise<void>;
  loadDetailByOrderNo: (orderNo: string) => Promise<void>;
  ensureOrderUnlocked: (orderKey: any) => Promise<boolean>;
  detailPurchases: MaterialPurchaseType[];
  visible: boolean;
  dialogMode: 'view' | 'create' | 'preview';
}

export function usePurchaseReturnConfirmActions({
  message,
  user,
  currentPurchase,
  fetchMaterialPurchaseList,
  loadDetailByOrderNo,
  ensureOrderUnlocked,
  detailPurchases,
  visible,
  dialogMode,
}: UsePurchaseReturnConfirmActionsOptions) {
  const [returnConfirmSubmitting, setReturnConfirmSubmitting] = useState(false);
  const [returnEvidenceFiles, setReturnEvidenceFiles] = useState<UploadFile[]>([]);
  const [returnEvidenceRecognizing, setReturnEvidenceRecognizing] = useState(false);

  const returnConfirmModal = useModal<MaterialPurchaseType[]>();
  const [returnConfirmForm] = Form.useForm();

  const openReturnConfirm = async (targets: MaterialPurchaseType[]) => {
    const list = targets.filter((t) => String(t?.id || '').trim());
    if (!list.length) { message.info('没有可回料确认的采购任务'); return; }
    const orderKey = String(list[0]?.orderId || list[0]?.orderNo || '').trim();
    if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
    returnConfirmModal.open(list);
  };

  const recognizeReturnEvidence = useCallback(async (file: File, orderNo?: string) => {
    setReturnEvidenceRecognizing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (orderNo) fd.append('orderNo', orderNo);
      const res = await api.post<{ code: number; message?: string; data: { items?: Array<{ purchaseId?: string; quantity?: number; matched?: boolean }> } }>('/production/purchase/recognize-doc', fd, {
        timeout: 60000 // Agnes视觉模型最长60秒
      });
      if (res.code === 200 && res.data?.items) {
        const qtys: Record<string, number> = {};
        (res.data.items || []).forEach((it) => {
          if (it.matched && it.purchaseId && it.quantity != null) qtys[String(it.purchaseId)] = it.quantity;
        });
        return qtys;
      }
      return {};
    } catch { return {}; } finally { setReturnEvidenceRecognizing(false); }
  }, []);

  // returnConfirm form init
  const returnConfirmFormRef = useRef(returnConfirmForm);
  returnConfirmFormRef.current = returnConfirmForm;
  const returnConfirmDataKey = JSON.stringify(returnConfirmModal.data);
  useEffect(() => {
    if (!returnConfirmModal.visible) { setReturnEvidenceFiles([]); return; }
    const list = (returnConfirmModal.data || []).filter((t) => String(t?.id || '').trim());
    returnConfirmFormRef.current.setFieldsValue({
      items: list.map((t) => ({
        purchaseId: String(t.id),
        materialName: t.materialName,
        purchaseQuantity: Number(t.purchaseQuantity || 0) || 0,
        arrivedQuantity: Number(t.arrivedQuantity || 0) || 0,
        returnQuantity: Number(t.returnQuantity || 0) || (Number(t.arrivedQuantity || 0) || Number(t.purchaseQuantity || 0) || 0),
      })),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnConfirmModal.visible, returnConfirmDataKey]);

  const submitReturnConfirm = async () => {
    try {
      setReturnConfirmSubmitting(true);
      const orderKey = String(returnConfirmModal.data?.[0]?.orderId || returnConfirmModal.data?.[0]?.orderNo || '').trim();
      if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
      const values = (await returnConfirmForm.validateFields()) as { items?: Array<{ purchaseId?: string; returnQuantity?: number }> };
      const confirmerName = String(user?.name || user?.username || '系统操作员').trim() || '系统操作员';
      const items = Array.isArray(values?.items) ? values.items : [];
      const confirmerId = String(user?.id || '').trim() || undefined;
      if (!items.length) { message.error('没有可回料确认的采购任务'); return; }
      const validItems = items.filter((it) => String(it?.purchaseId || '').trim());
      if (!validItems.length) { message.error('采购任务缺少ID'); return; }
      for (const it of validItems) {
        const purchaseId = String(it?.purchaseId || '').trim();
        const returnQuantity = Number(it?.returnQuantity);
        const evidenceImageUrls = returnEvidenceFiles.map((f) => (f as any).url || (f as any).response?.data?.url || '').filter(Boolean).join(',') || undefined;
        const res = await postReturnConfirm({ purchaseId, confirmerId, confirmerName, returnQuantity, evidenceImageUrls });
        const result = res as { code?: number; message?: string };
        if (result?.code !== 200) throw new Error(result?.message || '回料确认失败');
      }
      message.success('回料确认成功');
      returnConfirmModal.close();
      returnConfirmForm.resetFields();
      setReturnEvidenceFiles([]);
      fetchMaterialPurchaseList();
      const no = String(currentPurchase?.orderNo || '').trim();
      if (visible && dialogMode === 'view' && no) loadDetailByOrderNo(no);
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'errorFields' in e) return;
      message.error(e instanceof Error ? e.message : '回料确认失败');
    } finally { setReturnConfirmSubmitting(false); }
  };

  const handleBatchReturn = async () => {
    const targets = detailPurchases.filter((p) => {
      const status = normalizeStatus(p.status);
      return (status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)
        && String(p.id || '').trim()
        && Number(p.returnConfirmed || 0) !== 1;
    });
    if (!targets.length) { message.info('没有可回料确认的采购任务'); return; }
    openReturnConfirm(targets);
  };

  return {
    returnConfirmModal,
    returnConfirmForm,
    returnConfirmSubmitting,
    returnEvidenceFiles,
    setReturnEvidenceFiles,
    returnEvidenceRecognizing,
    recognizeReturnEvidence,
    openReturnConfirm,
    submitReturnConfirm,
    handleBatchReturn,
  };
}
