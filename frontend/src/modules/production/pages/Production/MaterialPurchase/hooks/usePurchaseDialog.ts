/**
 * usePurchaseDialog — 采购弹窗状态：表单/预览/提交/打印下载
 * ~130 lines (target ≤ 200)
 */
import { useState, useEffect, useRef } from 'react';
import { Form } from 'antd';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';
import api from '@/utils/api';
import { safePrint } from '@/utils/safePrint';
import { normalizeMaterialType } from '@/utils/materialType';
import { MATERIAL_PURCHASE_STATUS, MATERIAL_TYPES } from '@/constants/business';
import { confirmAction } from '@/utils/confirm';
import type { MaterialPurchase as MaterialPurchaseType, ProductionOrder, MaterialQueryParams } from '@/types/production';
import { buildPurchaseSheetHtml } from '../utils';
import { useFormDraft } from '@/hooks/useFormDraft';

interface UsePurchaseDialogOptions {
  message: any;
  modal: Omit<ModalStaticFunctions, 'warn'>;
  queryParams: MaterialQueryParams;
  fetchMaterialPurchaseList: () => Promise<void>;
  ensureOrderUnlocked: (orderKey: any) => Promise<boolean>;
  currentPurchase: MaterialPurchaseType | null;
  setCurrentPurchase: (p: MaterialPurchaseType | null) => void;
  visible: boolean;
  setVisible: (v: boolean) => void;
  dialogMode: 'view' | 'create' | 'preview';
  setDialogMode: (m: 'view' | 'create' | 'preview') => void;
  detailOrder: ProductionOrder | null;
  detailOrderLines: Array<{ color: string; size: string; quantity: number }>;
  detailPurchases: MaterialPurchaseType[];
  detailSizePairs: Array<{ size: string; quantity: number }>;
}

export function usePurchaseDialog({
  message,
  modal,
  queryParams,
  fetchMaterialPurchaseList,
  ensureOrderUnlocked,
  currentPurchase,
  setCurrentPurchase,
  visible: _visible,
  setVisible,
  dialogMode: _dialogMode,
  setDialogMode,
  detailOrder,
  detailOrderLines,
  detailPurchases,
  detailSizePairs,
}: UsePurchaseDialogOptions) {
  const [previewList, setPreviewList] = useState<MaterialPurchaseType[]>([]);
  const [previewOrderId, setPreviewOrderId] = useState<string>('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form] = Form.useForm();

  const purchaseDraft = useFormDraft('purchase-create', { debounceMs: 300 });
  const draftCheckedRef = useRef(false);

  const _openDialog = (mode: 'view' | 'create' | 'preview', purchase?: MaterialPurchaseType) => {
    setDialogMode(mode);
    setCurrentPurchase(purchase || null);
    if (mode !== 'preview') { setPreviewList([]); setPreviewOrderId(''); }
    if (mode === 'create') {
      form.setFieldsValue({
        materialType: normalizeMaterialType(queryParams.materialType || MATERIAL_TYPES.FABRIC),
        arrivedQuantity: 0,
        status: MATERIAL_PURCHASE_STATUS.PENDING,
      });
    } else if (purchase) {
      form.setFieldsValue(purchase);
    } else {
      form.resetFields();
    }
    setVisible(true);
  };

  const openDialog = (mode: 'view' | 'create' | 'preview', purchase?: MaterialPurchaseType) => {
    if (mode !== 'create') {
      _openDialog(mode, purchase);
      return;
    }

    const draftInfo = purchaseDraft.getDraftInfo();
    if (draftInfo.hasDraft) {
      modal.confirm({
        title: '发现未保存的草稿',
        content: `检测到您有未保存的采购草稿（${draftInfo.timeDescription}），是否恢复？\n\n选择"恢复草稿"将恢复之前未提交的采购内容，选择"新建采购"将清空草稿并重新开始。`,
        okText: '恢复草稿',
        cancelText: '新建采购',
        onOk: () => {
          _openDialog(mode, purchase);
          setTimeout(() => {
            const draftData = purchaseDraft.loadDraft() as { formValues?: Record<string, unknown> } | null;
            if (draftData?.formValues) {
              form.setFieldsValue(draftData.formValues);
            }
            draftCheckedRef.current = true;
          }, 0);
        },
        onCancel: () => {
          purchaseDraft.clearDraft();
          _openDialog(mode, purchase);
          draftCheckedRef.current = true;
        },
      });
    } else {
      _openDialog(mode, purchase);
      draftCheckedRef.current = true;
    }
  };

  const openDialogSafe = async (mode: 'view' | 'create' | 'preview', purchase?: MaterialPurchaseType) => {
    if (mode !== 'view') {
      const orderKey = String(purchase?.orderId || purchase?.orderNo || '').trim();
      if (orderKey) {
        const ok = await ensureOrderUnlocked(orderKey);
        if (!ok) return;
      }
    }
    openDialog(mode, purchase);
  };

  const closeDialog = () => {
    purchaseDraft.flushSaveDraft();
    setVisible(false);
    setCurrentPurchase(null);
    setDialogMode('view');
    setPreviewList([]);
    setPreviewOrderId('');
    form.resetFields();
    draftCheckedRef.current = false;
  };

  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const values = await form.validateFields();
      const purchaseQuantity = Number(values.purchaseQuantity || 0);
      const unitPrice = Number(values.unitPrice || 0);
      const totalAmount = Number.isFinite(purchaseQuantity) && Number.isFinite(unitPrice)
        ? Number((purchaseQuantity * unitPrice).toFixed(2)) : undefined;
      const arrivedQuantity = Number(values.arrivedQuantity || 0);
      const computedStatus = values.status === MATERIAL_PURCHASE_STATUS.CANCELLED
        ? MATERIAL_PURCHASE_STATUS.CANCELLED
        : arrivedQuantity <= 0 ? MATERIAL_PURCHASE_STATUS.PENDING
        : arrivedQuantity < purchaseQuantity ? MATERIAL_PURCHASE_STATUS.PARTIAL
        : MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM;
      const payload = {
        ...values,
        totalAmount,
        status: values.status || computedStatus,
        sourceType: values.sourceType || (!values.orderId ? 'batch' : 'order'),
      };
      const response = await api.post<{ code: number; message?: string }>('/production/purchase', payload);
      if (response.code === 200) {
        message.success('新增采购单成功');
        purchaseDraft.clearDraft();
        closeDialog();
        fetchMaterialPurchaseList();
      } else {
        message.error(response.message || '保存失败');
      }
    } catch (error) {
      const formError = error as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) {
        message.error(formError.errorFields[0]?.errors?.[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '保存失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  useEffect(() => {
    if (!_visible || _dialogMode !== 'create' || !draftCheckedRef.current) return;
    const allValues = form.getFieldsValue(true);
    purchaseDraft.saveDraftDebounced({ formValues: allValues });
  }, [_visible, _dialogMode, form, purchaseDraft]);

  const handleSavePreview = async (overwrite = false) => {
    try {
      setSubmitLoading(true);
      if (!previewOrderId) {
        message.error('缺少订单ID，无法生成采购单');
        return;
      }
      await api.post('/production/purchase/demand/generate', { orderId: previewOrderId, overwrite });
      message.success(overwrite ? '已重新生成采购单（旧数据已覆盖）' : '生成采购单成功');
      closeDialog();
      fetchMaterialPurchaseList();
    } catch (e) {
      const errMsg = (e as Error)?.message || '';
      if (!overwrite && errMsg.includes('已生成')) {
        confirmAction('采购单已存在', '该订单已有采购需求记录，是否按当前BOM数据重新生成？（旧数据将被替换）', () => handleSavePreview(true), { okText: '重新生成', danger: true });
      } else {
        message.error(errMsg || '生成失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const openPurchaseSheet = (_autoPrint: boolean) => {
    const html = buildPurchaseSheetHtml(currentPurchase, detailOrder, detailOrderLines, detailPurchases, detailSizePairs);
    const success = safePrint(html, '采购单');
    if (!success) {
      message.error('打印失败，请重试');
    }
  };

  const downloadPurchaseSheet = () => {
    const html = buildPurchaseSheetHtml(currentPurchase, detailOrder, detailOrderLines, detailPurchases, detailSizePairs);
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `采购单_${purchaseNo || orderNo || 'sheet'}_${ts}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return {
    previewList, previewOrderId, setPreviewList, setPreviewOrderId,
    submitLoading, form,
    openDialog, openDialogSafe, closeDialog,
    handleSubmit, handleSavePreview,
    openPurchaseSheet, downloadPurchaseSheet,
  };
}
