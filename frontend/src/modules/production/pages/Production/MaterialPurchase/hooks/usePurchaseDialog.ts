/**
 * usePurchaseDialog — 采购弹窗状态：表单/预览/提交/打印下载
 * ~130 lines (target ≤ 200)
 */
import { useState } from 'react';
import { Form, Modal } from 'antd';
import api from '@/utils/api';
import { safePrint } from '@/utils/safePrint';
import { normalizeMaterialType } from '@/utils/materialType';
import { MATERIAL_PURCHASE_STATUS, MATERIAL_TYPES } from '@/constants/business';
import type { MaterialPurchase as MaterialPurchaseType, ProductionOrder, MaterialQueryParams } from '@/types/production';
import { buildPurchaseSheetHtml } from '../utils';

interface UsePurchaseDialogOptions {
  message: any;
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

  const openDialog = (mode: 'view' | 'create' | 'preview', purchase?: MaterialPurchaseType) => {
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
    setVisible(false);
    setCurrentPurchase(null);
    setDialogMode('view');
    setPreviewList([]);
    setPreviewOrderId('');
    form.resetFields();
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
        : MATERIAL_PURCHASE_STATUS.COMPLETED;
      const payload = {
        ...values,
        totalAmount,
        status: values.status || computedStatus,
        sourceType: values.sourceType || (!values.orderId ? 'batch' : 'order'),
      };
      const response = await api.post<{ code: number; message?: string }>('/production/purchase', payload);
      if (response.code === 200) {
        message.success('新增采购单成功');
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
        Modal.confirm({
          title: '采购单已存在',
          content: '该订单已有采购需求记录，是否按当前BOM数据重新生成？（旧数据将被替换）',
          okText: '重新生成',
          cancelText: '取消',
          onOk: () => handleSavePreview(true),
        });
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
      message.error('浏览器拦截了新窗口，请允许弹窗');
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
