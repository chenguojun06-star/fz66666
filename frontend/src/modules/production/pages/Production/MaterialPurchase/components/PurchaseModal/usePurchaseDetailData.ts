import { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { confirmDelete } from '@/utils/confirm';
import {
  PurchaseDocRecord,
} from './PurchaseDetailView.helpers';
import { useInvoiceManagement } from './useInvoiceManagement';
import { useMaterialSearch } from './useMaterialSearch';
import {
  createPurchaseRow,
  computeOrderColors,
  computeMissingColors,
  computeBomIncomplete,
  buildStockMap,
  extractMaterialsFromResponse,
  validatePurchaseRows,
  buildSavePayload,
  isTempRow,
  computeDeletedIds,
} from './utils';

interface UsePurchaseDetailDataParams {
  currentPurchase: MaterialPurchaseType | null;
  detailOrder: ProductionOrder | null;
  detailOrderLines: Array<{ color: string; size: string; quantity: number }>;
  detailPurchases: MaterialPurchaseType[];
  isSamplePurchase: boolean;
  onRefresh?: () => void;
}

export const usePurchaseDetailData = ({
  currentPurchase,
  detailOrder,
  detailOrderLines,
  detailPurchases,
  isSamplePurchase: _isSamplePurchase,
  onRefresh,
}: UsePurchaseDetailDataParams) => {
  const { message } = App.useApp();
  const [docList, setDocList] = useState<PurchaseDocRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MaterialPurchaseType | null>(null);
  const [cancelConfirmLoading, setCancelConfirmLoading] = useState(false);
  const [arrivalTarget, setArrivalTarget] = useState<MaterialPurchaseType | null>(null);
  const [arrivalLoading, setArrivalLoading] = useState(false);
  const [arrivalForm] = Form.useForm();
  const [docRecognizeOpen, setDocRecognizeOpen] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editableData, setEditableData] = useState<MaterialPurchaseType[]>([]);
  const [saving, setSaving] = useState(false);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const { invoiceUrls, invoiceUploading, handleInvoiceUpload, handleInvoiceChange } =
    useInvoiceManagement({ currentPurchase });

  const {
    materialModalOpen,
    materialKeyword,
    materialLoading,
    materialList,
    materialTotal,
    materialPage,
    materialPageSize,
    setMaterialModalOpen,
    setMaterialKeyword,
    setMaterialPage,
    setMaterialPageSize,
    openMaterialModal,
    handleUseMaterial,
    handleSearchMaterial,
  } = useMaterialSearch({ editableData, setEditableData });

  const loadDocs = useCallback(async () => {
    if (!currentPurchase?.orderNo) return;
    setDocsLoading(true);
    try {
      const res = await api.get<PurchaseDocRecord[]>(
        `/production/purchase/docs?orderNo=${encodeURIComponent(currentPurchase.orderNo)}`
      );
      setDocList(Array.isArray(res) ? res : []);
    } catch (_e) {
      // silent
    } finally {
      setDocsLoading(false);
    }
  }, [currentPurchase?.orderNo]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    const styleNo = String(currentPurchase?.styleNo || '').trim();
    if (orderNo && orderNo !== '-') {
      api
        .get<any>('/production/purchase/smart-receive-preview', { params: { orderNo } })
        .then((res: any) => {
          const materials = extractMaterialsFromResponse(res);
          setStockMap(buildStockMap(materials));
        })
        .catch(() => setStockMap({}));
      return;
    }
    if (styleNo && styleNo !== '-') {
      api
        .get<any>('/production/purchase/smart-receive-preview', { params: { styleNo } })
        .then((res: any) => {
          const materials = extractMaterialsFromResponse(res);
          setStockMap(buildStockMap(materials));
        })
        .catch(() => setStockMap({}));
      return;
    }
    setStockMap({});
  }, [currentPurchase?.orderNo, currentPurchase?.styleNo]);

  const displayData = editing ? editableData : detailPurchases;

  const orderColors = useMemo(() => computeOrderColors(detailOrderLines), [detailOrderLines]);

  const isMultiColor = orderColors.length > 1;

  const missingColors = useMemo(
    () => computeMissingColors(orderColors, detailPurchases, isMultiColor),
    [isMultiColor, orderColors, detailPurchases]
  );

  const bomIncomplete = useMemo(
    () => computeBomIncomplete(detailPurchases),
    [detailPurchases]
  );

  const canProcure = !bomIncomplete;

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditableData([]);
  }, []);

  const addRow = useCallback(() => {
    const newRow = createPurchaseRow(currentPurchase, detailOrder);
    setEditableData((prev) => [...prev, newRow]);
  }, [currentPurchase, detailOrder]);

  const updateRow = useCallback((rowId: string, field: string, value: any) => {
    setEditableData((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setEditableData((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const handleStartEdit = useCallback(() => {
    if (detailPurchases.length === 0 && isMultiColor && orderColors.length > 0) {
      const autoRows: MaterialPurchaseType[] = orderColors.map((color) =>
        createPurchaseRow(currentPurchase, detailOrder, color)
      );
      setEditableData(autoRows);
    } else {
      setEditableData([...detailPurchases]);
    }
    setEditing(true);
  }, [detailPurchases, isMultiColor, orderColors, currentPurchase, detailOrder]);

  const saveAll = useCallback(async () => {
    const validation = validatePurchaseRows(editableData, isMultiColor);
    if (!validation.valid) {
      message.warning(validation.warning || '数据校验失败');
      return;
    }
    const validRows = editableData.filter((r) => r.materialCode || r.materialName);
    setSaving(true);
    try {
      for (const row of validRows) {
        const payload = buildSavePayload(row, currentPurchase, detailOrder);
        if (!isTempRow(row)) {
          await api.put('/production/purchase', payload);
        } else {
          const { id: _id, ...rest } = payload;
          await api.post('/production/purchase', rest);
        }
      }
      const deletedIds = computeDeletedIds(detailPurchases, validRows);
      for (const delId of deletedIds) {
        if (delId) await api.delete(`/production/purchase/${delId}`);
      }
      message.success('保存成功');
      setEditing(false);
      setEditableData([]);
      onRefresh?.();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [editableData, detailPurchases, currentPurchase, detailOrder, isMultiColor, message, onRefresh]);

  const handleCancelConfirm = useCallback(
    async (reason: string) => {
      if (!cancelTarget) return;
      setCancelConfirmLoading(true);
      try {
        await api.post('/production/purchase/cancel-receive', {
          purchaseId: cancelTarget.id,
          reason,
        });
        message.success('撤回成功，采购单已恢复为待处理');
        setCancelTarget(null);
        onRefresh?.();
      } catch {
        message.error('撤回失败');
      } finally {
        setCancelConfirmLoading(false);
      }
    },
    [cancelTarget, message, onRefresh]
  );

  const handleArrivalSubmit = useCallback(
    async (values: { arrivedQuantity: number }) => {
      if (!arrivalTarget) return;
      setArrivalLoading(true);
      try {
        await api.post('/production/material/inbound/confirm-arrival', {
          purchaseId: arrivalTarget.id,
          arrivedQuantity: values.arrivedQuantity,
        });
        message.success('入库成功，库存已更新');
        setArrivalTarget(null);
        arrivalForm.resetFields();
        onRefresh?.();
      } catch {
        message.error('入库失败');
      } finally {
        setArrivalLoading(false);
      }
    },
    [arrivalTarget, arrivalForm, message, onRefresh]
  );

  const handleRemoveRowWithConfirm = useCallback(
    (rowId: string) => {
      confirmDelete('该物料行', async () => removeRow(rowId), {
        content: '删除此物料行？保存后将不可恢复',
      });
    },
    [removeRow]
  );

  return {
    // state
    docList,
    docsLoading,
    cancelTarget,
    cancelConfirmLoading,
    arrivalTarget,
    arrivalLoading,
    arrivalForm,
    docRecognizeOpen,
    editing,
    saving,
    editableData,
    materialModalOpen,
    materialKeyword,
    materialLoading,
    materialList,
    materialTotal,
    materialPage,
    materialPageSize,
    returnModalOpen,
    invoiceUrls,
    invoiceUploading,
    stockMap,
    // setters
    setDocRecognizeOpen,
    setReturnModalOpen,
    setCancelTarget,
    setArrivalTarget,
    setMaterialModalOpen,
    setMaterialKeyword,
    setMaterialPage,
    setMaterialPageSize,
    setEditing,
    // derived
    displayData,
    orderColors,
    isMultiColor,
    missingColors,
    bomIncomplete,
    canProcure,
    // actions
    handleInvoiceUpload,
    handleInvoiceChange,
    cancelEditing,
    addRow,
    updateRow,
    removeRow,
    handleRemoveRowWithConfirm,
    handleStartEdit,
    saveAll,
    openMaterialModal,
    handleUseMaterial,
    handleSearchMaterial,
    handleCancelConfirm,
    handleArrivalSubmit,
  };
};

export type UsePurchaseDetailDataReturn = ReturnType<typeof usePurchaseDetailData>;
