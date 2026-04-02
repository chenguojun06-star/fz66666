/**
 * usePurchaseActions — 采购操作：领取/回料确认/退回/快速编辑/导出
 * ~230 lines (target ≤ 300)
 * NOTE: .tsx 扩展名因 receivePurchaseTask 中包含 JSX (Modal.confirm content)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Form, Modal } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { useModal } from '@/hooks';
import api from '@/utils/api';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatMaterialQuantity, formatReferenceKilograms, subtractMaterialQuantity } from '../utils';

interface UsePurchaseActionsOptions {
  message: any;
  messageApi: any;
  user: any;
  isSupervisorOrAbove: boolean;
  currentPurchase: MaterialPurchaseType | null;
  fetchMaterialPurchaseList: () => Promise<void>;
  loadDetailByOrderNo: (orderNo: string) => Promise<void>;
  loadDetailByStyleNo: (styleNo: string, purchaseNo?: string) => Promise<void>;
  ensureOrderUnlocked: (orderKey: any) => Promise<boolean>;
  detailPurchases: MaterialPurchaseType[];
  purchaseList: MaterialPurchaseType[];
  setSubmitLoading: (v: boolean) => void;
  visible: boolean;
  dialogMode: 'view' | 'create' | 'preview';
}

const postReturnConfirm = (payload: { purchaseId: string; confirmerId?: string; confirmerName: string; returnQuantity: number; evidenceImageUrls?: string }) =>
  api.post<{ code: number; message: string; data: boolean }>('/production/purchase/return-confirm', payload);

const postReturnConfirmReset = (payload: { purchaseId: string; reason?: string }) =>
  api.post<{ code: number; message: string; data: boolean }>('/production/purchase/return-confirm/reset', payload);

const normalizeStatus = (status?: string) => String(status || '').trim().toLowerCase();

export function usePurchaseActions({
  message,
  messageApi,
  user,
  isSupervisorOrAbove,
  currentPurchase,
  fetchMaterialPurchaseList,
  loadDetailByOrderNo,
  loadDetailByStyleNo,
  ensureOrderUnlocked,
  detailPurchases,
  purchaseList,
  setSubmitLoading,
  visible,
  dialogMode,
}: UsePurchaseActionsOptions) {
  const [returnConfirmSubmitting, setReturnConfirmSubmitting] = useState(false);
  const [returnEvidenceFiles, setReturnEvidenceFiles] = useState<UploadFile[]>([]);
  const [returnEvidenceRecognizing, setReturnEvidenceRecognizing] = useState(false);
  const [returnResetSubmitting, setReturnResetSubmitting] = useState(false);
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const [smartReceiveOpen, setSmartReceiveOpen] = useState(false);
  const [smartReceiveOrderNo, setSmartReceiveOrderNo] = useState('');

  const returnConfirmModal = useModal<MaterialPurchaseType[]>();
  const returnResetModal = useModal<MaterialPurchaseType>();
  const quickEditModal = useModal<MaterialPurchaseType>();

  const [returnConfirmForm] = Form.useForm();
  const [returnResetForm] = Form.useForm();

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
      const res = await api.post<{ code: number; message?: string; data: { items?: Array<{ purchaseId?: string; quantity?: number; matched?: boolean }> } }>('/production/purchase/recognize-doc', fd);
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

  const openReturnReset = async (target: MaterialPurchaseType) => {
    const orderKey = String(target?.orderId || target?.orderNo || '').trim();
    if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
    returnResetModal.open(target);
  };

  const openQuickEditSafe = async (record: MaterialPurchaseType) => {
    const orderKey = String(record?.orderId || record?.orderNo || '').trim();
    if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
    quickEditModal.open(record);
  };

  // returnConfirm form init
  useEffect(() => {
    if (!returnConfirmModal.visible) { setReturnEvidenceFiles([]); return; }
    const list = (returnConfirmModal.data || []).filter((t) => String(t?.id || '').trim());
    returnConfirmForm.setFieldsValue({
      items: list.map((t) => ({
        purchaseId: String(t.id),
        materialName: t.materialName,
        purchaseQuantity: Number(t.purchaseQuantity || 0) || 0,
        arrivedQuantity: Number(t.arrivedQuantity || 0) || 0,
        returnQuantity: Number(t.returnQuantity || 0) || (Number(t.arrivedQuantity || 0) || Number(t.purchaseQuantity || 0) || 0),
      })),
    });
  }, [returnConfirmForm, returnConfirmModal.visible, returnConfirmModal.data]);

  // returnReset form init
  useEffect(() => {
    if (!returnResetModal.visible) return;
    returnResetForm.setFieldsValue({ reason: '' });
  }, [returnResetForm, returnResetModal.visible]);

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
    } catch (e: any) {
      const formError = e as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) return;
      message.error((e as Error)?.message || '回料确认失败');
    } finally { setReturnConfirmSubmitting(false); }
  };

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
    } catch (e: any) {
      const formError = e as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) return;
      message.error((e as Error)?.message || '退回失败');
    } finally { setReturnResetSubmitting(false); }
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
    } catch (error: any) {
      messageApi.error(error?.response?.data?.message || '保存失败');
      throw error;
    } finally { setQuickEditSaving(false); }
  };

  const receivePurchaseTask = async (record: MaterialPurchaseType) => {
    const id = String(record?.id || '').trim();
    if (!id) { message.error('采购任务缺少ID'); return; }
    const orderKey = String(record?.orderId || record?.orderNo || '').trim();
    if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
    const receiverName = String(user?.name || user?.username || '').trim() || window.prompt('请输入领取人姓名') || '';
    if (!String(receiverName).trim()) { message.error('未填写领取人'); return; }
    const receiverId = String(user?.id || '').trim();
    try {
      const mergeRes = await api.get<{ code: number; data: { currentId: string; mergeableCount: number; mergeableItems: Array<{ id: string; purchaseNo: string; materialName: string; materialCode: string; materialType: string; specifications: string; purchaseQuantity: number; unit: string; orderNo: string; styleNo: string; supplierName: string }> } }>('/production/purchase/check-mergeable', { params: { purchaseId: id } });
      const mergeableCount = mergeRes?.code === 200 ? (mergeRes.data?.mergeableCount || 0) : 0;
      const mergeableItems = mergeRes?.code === 200 ? (mergeRes.data?.mergeableItems || []) : [];
      if (mergeableCount > 0) {
        const materialInfo = String(record?.materialName || '').trim();
        Modal.confirm({
          width: '30vw',
          title: '发现当天同款面辅料采购任务',
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>当天有 <strong>{mergeableCount}</strong> 条相同面辅料（<strong>{materialInfo}</strong>）的待采购任务，是否合并采购一键领取？</p>
              <div style={{ maxHeight: 200, overflow: 'auto', background: 'var(--color-bg-subtle)', padding: '8px 12px', borderRadius: 4, fontSize: 13 }}>
                {mergeableItems.map((item, i) => (
                  <div key={item.id} style={{ marginBottom: 4, borderBottom: i < mergeableItems.length - 1 ? '1px solid #e8e8e8' : 'none', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{item.orderNo || item.styleNo || '-'}</span>{' '}
                    <span>{item.materialName}</span>{' '}
                    <span style={{ color: 'var(--color-primary)' }}>{formatMaterialQuantity(item.purchaseQuantity)}{item.unit || ''}</span>
                    {item.supplierName ? <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8 }}>{item.supplierName}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ),
          okText: '合并领取全部',
          cancelText: '仅领取当前',
          onOk: async () => {
            const allIds = [id, ...mergeableItems.map((item) => item.id)];
            try {
              setSubmitLoading(true);
              const batchRes = await api.post<{ code: number; message?: string; data: { successCount: number; skipCount: number; failCount: number; failMessages: string[] } }>('/production/purchase/batch-receive', { purchaseIds: allIds, receiverId, receiverName: String(receiverName).trim() });
              if (batchRes.code === 200) {
                const { successCount, skipCount } = batchRes.data || {};
                message.success(`已合并领取 ${successCount || 0} 条采购任务${skipCount ? `，跳过 ${skipCount} 条` : ''}`);
                fetchMaterialPurchaseList();
                const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
                if (no) loadDetailByOrderNo(no);
              } else { message.error(batchRes.message || '合并领取失败'); }
            } catch (err: any) { message.error((err as Error)?.message || '合并领取失败'); }
            finally { setSubmitLoading(false); }
          },
          onCancel: async () => {
            try {
              const res = await api.post<{ code: number; message?: string; data: boolean }>('/production/purchase/receive', { purchaseId: id, receiverId, receiverName: String(receiverName).trim() });
              if (res.code === 200) {
                message.success('已领取采购任务');
                fetchMaterialPurchaseList();
                const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
                if (no) loadDetailByOrderNo(no);
              } else { message.error(res.message || '领取失败'); }
            } catch (err: any) { message.error((err as Error)?.message || '领取失败'); }
          },
        });
        return;
      }
      const res = await api.post<{ code: number; message?: string; data: boolean }>('/production/purchase/receive', { purchaseId: id, receiverId, receiverName: String(receiverName).trim() });
      if (res.code === 200) {
        message.success('已领取采购任务');
        fetchMaterialPurchaseList();
        const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
        if (no) loadDetailByOrderNo(no);
        return;
      }
      message.error(res.message || '领取失败');
    } catch (e: any) { message.error((e as Error)?.message || '领取失败'); }
  };

  const confirmReturnPurchaseTask = async (record: MaterialPurchaseType) => {
    const id = String(record?.id || '').trim();
    if (!id) { message.error('采购任务缺少ID'); return; }
    if (Number(record?.returnConfirmed || 0) === 1) {
      message.info('该采购任务已回料确认，如需调整请主管退回处理');
      return;
    }
    openReturnConfirm([record]);
  };

  const handleReceiveAll = async () => {
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    const sourceType = String(currentPurchase?.sourceType || '').trim();
    const isSampleView = sourceType === 'sample' || sourceType === 'batch' || !orderNo || orderNo === '-';
    if (isSampleView) {
      const pending = detailPurchases.filter((p) => String(p.status || '').toLowerCase() === 'pending' && String(p.id || '').trim());
      if (!pending.length) { message.info('没有待领取的采购任务'); return; }
      const receiverName = String(user?.name || user?.username || '').trim() || window.prompt('请输入领取人姓名') || '';
      if (!receiverName.trim()) { message.error('未填写领取人'); return; }
      setSubmitLoading(true);
      try {
        const res = await api.post<{ code: number; message?: string }>('/production/purchase/batch-receive', { purchaseIds: pending.map((p) => p.id), receiverId: user?.id, receiverName });
        if (res.code === 200) {
          message.success(`已批量领取 ${pending.length} 条采购任务`);
          const styleNo = String(currentPurchase?.styleNo || '').trim();
          const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
          if (styleNo) loadDetailByStyleNo(styleNo, purchaseNo);
          fetchMaterialPurchaseList();
        } else { message.error(res.message || '批量领取失败'); }
      } catch (e: any) { message.error((e as Error)?.message || '批量领取失败'); }
      finally { setSubmitLoading(false); }
      return;
    }
    if (!orderNo || orderNo === '-') { message.error('缺少订单号'); return; }
    setSmartReceiveOrderNo(orderNo);
    setSmartReceiveOpen(true);
  };

  const handleSmartReceiveSuccess = () => {
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    fetchMaterialPurchaseList();
    if (orderNo && orderNo !== '-') loadDetailByOrderNo(orderNo);
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

  const handleExport = async () => {
    if (!purchaseList.length) { message.warning('当前没有数据可导出'); return; }
    const exportData = purchaseList.map((item, index) => [
      index + 1,
      item.orderNo || '-',
      item.purchaseNo || '-',
      item.materialType || '-',
      item.materialName || '-',
      item.materialCode || '-',
      item.specifications || '-',
      item.supplierName || '-',
      formatMaterialQuantity(item.purchaseQuantity),
      formatReferenceKilograms(item.purchaseQuantity, item.conversionRate, item.unit),
      formatMaterialQuantity(item.arrivedQuantity),
      formatMaterialQuantity(subtractMaterialQuantity(item.purchaseQuantity, item.arrivedQuantity)),
      item.unitPrice ?? '-',
      item.totalAmount ?? '-',
      item.status || '-',
      item.receiverName || '-',
      item.createTime || '-',
    ]);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      const worksheet = workbook.addWorksheet('面辅料采购');
      worksheet.columns = [
        { header: '序号', key: 'no', width: 6 },
        { header: '订单号', key: 'orderNo', width: 18 },
        { header: '采购单号', key: 'purchaseNo', width: 18 },
        { header: '物料类型', key: 'materialType', width: 10 },
        { header: '物料名称', key: 'materialName', width: 20 },
        { header: '物料编码', key: 'materialCode', width: 16 },
        { header: '规格', key: 'specifications', width: 14 },
        { header: '供应商', key: 'supplierName', width: 18 },
        { header: '采购数量', key: 'purchaseQuantity', width: 10 },
        { header: '参考公斤数', key: 'referenceKilograms', width: 12 },
        { header: '到货数量', key: 'arrivedQuantity', width: 10 },
        { header: '待到数量', key: 'pendingQuantity', width: 10 },
        { header: '单价', key: 'unitPrice', width: 10 },
        { header: '总金额', key: 'totalAmount', width: 12 },
        { header: '状态', key: 'status', width: 10 },
        { header: '领取人', key: 'receiverName', width: 12 },
        { header: '创建时间', key: 'createTime', width: 20 },
      ];
      worksheet.addRows(exportData);
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center' };
      const now = new Date();
      const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `面辅料采购_${date}_${time}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (e: any) {
      message.error((e as Error)?.message || '导出失败');
    }
  };

  const isSamplePurchaseView = useMemo(() => {
    const sourceType = String(currentPurchase?.sourceType || '').trim();
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    return sourceType === 'sample' || sourceType === 'batch' || !orderNo || orderNo === '-';
  }, [currentPurchase?.sourceType, currentPurchase?.orderNo]);

  return {
    returnConfirmModal, returnConfirmForm, returnConfirmSubmitting,
    returnEvidenceFiles, setReturnEvidenceFiles, returnEvidenceRecognizing, recognizeReturnEvidence,
    returnResetModal, returnResetForm, returnResetSubmitting,
    quickEditModal, quickEditSaving,
    smartReceiveOpen, smartReceiveOrderNo, setSmartReceiveOpen,
    openReturnConfirm, submitReturnConfirm,
    openReturnReset, submitReturnReset,
    receivePurchaseTask, confirmReturnPurchaseTask,
    handleReceiveAll, handleSmartReceiveSuccess, handleBatchReturn,
    openQuickEditSafe, handleQuickEditSave,
    handleExport,
    isSamplePurchaseView, normalizeStatus,
  };
}
