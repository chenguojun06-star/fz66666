import { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { confirmDelete } from '@/utils/confirm';
import {
  REQUIRED_FIELDS,
  PurchaseDocRecord,
  parseInvoiceUrls,
} from './PurchaseDetailView.helpers';

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

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTargetRowId, setMaterialTargetRowId] = useState<string | null>(null);
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialList, setMaterialList] = useState<Record<string, unknown>[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPageSize, setMaterialPageSize] = useState(10);

  // 采购退货弹窗状态
  const [returnModalOpen, setReturnModalOpen] = useState(false);

  // ── 发票/单据上传（复用 PurchaseCreateForm 同款上传逻辑） ──
  // invoiceUrls 从 currentPurchase.invoiceUrls（JSON字符串）解析，本地维护可编辑副本
  const [invoiceUrls, setInvoiceUrls] = useState<string[]>(() =>
    parseInvoiceUrls((currentPurchase as any)?.invoiceUrls)
  );
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const persistInvoiceUrls = useCallback(async (urls: string[]) => {
    if (!currentPurchase?.id) return;
    await api.post('/production/purchase/update-invoice-urls', {
      purchaseId: currentPurchase.id,
      invoiceUrls: JSON.stringify(urls),
    }).catch(() => { /* 非致命 */ });
  }, [currentPurchase?.id]);

  const handleInvoiceUpload = useCallback(async (file: File): Promise<string> => {
    setInvoiceUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/common/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }) as any;
      if (res?.code !== 200 || !res?.data) throw new Error(res?.message || '上传失败');
      const url: string = typeof res.data === 'string' ? res.data : (res.data?.url ?? '');
      return url;
    } finally {
      setInvoiceUploading(false);
    }
  }, []);

  const handleInvoiceChange = useCallback((urls: string[]) => {
    setInvoiceUrls(urls);
    void persistInvoiceUrls(urls);
  }, [persistInvoiceUrls]);

  useEffect(() => {
    setInvoiceUrls(parseInvoiceUrls((currentPurchase as any)?.invoiceUrls));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPurchase?.id]);

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
      api.get<any>('/production/purchase/smart-receive-preview', { params: { orderNo } })
        .then((res: any) => {
          const materials: any[] = res?.data?.materials || res?.materials || [];
          const map: Record<string, number> = {};
          materials.forEach((m: any) => { if (m.purchaseId != null) map[String(m.purchaseId)] = Number(m.availableStock ?? 0); });
          setStockMap(map);
        })
        .catch(() => setStockMap({}));
      return;
    }
    if (styleNo && styleNo !== '-') {
      api.get<any>('/production/purchase/smart-receive-preview', { params: { styleNo } })
        .then((res: any) => {
          const materials: any[] = res?.data?.materials || res?.materials || [];
          const map: Record<string, number> = {};
          materials.forEach((m: any) => { if (m.purchaseId != null) map[String(m.purchaseId)] = Number(m.availableStock ?? 0); });
          setStockMap(map);
        })
        .catch(() => setStockMap({}));
      return;
    }
    setStockMap({});
  }, [currentPurchase?.orderNo, currentPurchase?.styleNo]);

  const displayData = editing ? editableData : detailPurchases;

  const orderColors = useMemo(() => {
    const colors = new Set<string>();
    detailOrderLines.forEach(line => {
      const c = String(line?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return Array.from(colors);
  }, [detailOrderLines]);

  const isMultiColor = orderColors.length > 1;

  const missingColors = useMemo(() => {
    if (!isMultiColor) return [];
    if (detailPurchases.length === 0) return orderColors;
    const coveredColors = new Set(
      detailPurchases
        .map(item => String(item.color || '').trim())
        .filter(Boolean)
    );
    return orderColors.filter(c => !coveredColors.has(c));
  }, [isMultiColor, orderColors, detailPurchases]);

  const bomIncomplete = useMemo(() => {
    if (detailPurchases.length === 0) return true;
    return detailPurchases.some(item =>
      REQUIRED_FIELDS.some(field => {
        const val = item[field];
        return val === undefined || val === null || String(val).trim() === '';
      })
    );
  }, [detailPurchases]);

  const canProcure = !bomIncomplete;

  const handleSearchMaterial = useCallback(async () => {
    setMaterialLoading(true);
    try {
      const res = await api.get('/material/database/list', {
        params: { keyword: materialKeyword, page: materialPage, pageSize: materialPageSize, status: 'completed' },
      });
      if ((res as any)?.code === 200) {
        setMaterialList((res as any).data?.records || []);
        setMaterialTotal((res as any).data?.total || 0);
      }
    } catch (e) { console.error('[PurchaseDetailView] 加载物料列表失败:', e); } finally {
      setMaterialLoading(false);
    }
  }, [materialKeyword, materialPage, materialPageSize]);

  useEffect(() => {
    if (materialModalOpen) handleSearchMaterial();
  }, [materialModalOpen, materialPage, materialPageSize, handleSearchMaterial]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditableData([]);
  }, []);

  const addRow = useCallback(() => {
    const orderNo = currentPurchase?.orderNo || detailOrder?.orderNo || '';
    const styleNo = currentPurchase?.styleNo || detailOrder?.styleNo || '';
    const styleName = currentPurchase?.styleName || detailOrder?.styleName || '';
    const styleId = currentPurchase?.styleId || detailOrder?.styleId || '';
    const newRow: MaterialPurchaseType = {
      id: `tmp_${Date.now()}`,
      purchaseNo: '', supplierId: '', orderNo, styleNo, styleName, styleId,
      materialType: 'fabricA', materialCode: '', materialName: '', unit: '',
      color: '', size: '', specifications: '', fabricComposition: '', fabricWeight: '',
      purchaseQuantity: 0, arrivedQuantity: 0, unitPrice: 0, totalAmount: 0,
      supplierName: '', status: MATERIAL_PURCHASE_STATUS.PENDING,
    } as MaterialPurchaseType;
    setEditableData(prev => [...prev, newRow]);
  }, [currentPurchase, detailOrder]);

  const updateRow = useCallback((rowId: string, field: string, value: any) => {
    setEditableData(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setEditableData(prev => prev.filter(r => r.id !== rowId));
  }, []);

  const handleStartEdit = useCallback(() => {
    if (detailPurchases.length === 0 && isMultiColor && orderColors.length > 0) {
      const orderNo = currentPurchase?.orderNo || detailOrder?.orderNo || '';
      const styleNo = currentPurchase?.styleNo || detailOrder?.styleNo || '';
      const styleName = currentPurchase?.styleName || detailOrder?.styleName || '';
      const styleId = currentPurchase?.styleId || detailOrder?.styleId || '';
      const autoRows: MaterialPurchaseType[] = orderColors.map(color => ({
        id: `tmp_${Date.now()}_${color}`,
        purchaseNo: '', supplierId: '', orderNo, styleNo, styleName, styleId,
        materialType: 'fabricA', materialCode: '', materialName: '', unit: '',
        color, size: '', specifications: '', fabricComposition: '', fabricWeight: '',
        purchaseQuantity: 0, arrivedQuantity: 0, unitPrice: 0, totalAmount: 0,
        supplierName: '', status: MATERIAL_PURCHASE_STATUS.PENDING,
      } as MaterialPurchaseType));
      setEditableData(autoRows);
    } else {
      setEditableData([...detailPurchases]);
    }
    setEditing(true);
  }, [detailPurchases, isMultiColor, orderColors, currentPurchase, detailOrder]);

  const saveAll = useCallback(async () => {
    const validRows = editableData.filter(r => r.materialCode || r.materialName);
    if (validRows.length === 0) { message.warning('请至少添加一行面辅料信息'); return; }
    const incomplete = validRows.find(r =>
      REQUIRED_FIELDS.some(f => {
        const val = (r as any)[f];
        return val === undefined || val === null || String(val).trim() === '';
      })
    );
    if (incomplete) { message.warning('请完善所有面辅料的必填信息（物料类型、编码、名称、单位、供应商）'); return; }
    if (isMultiColor) {
      const noColor = validRows.find(r => !String(r.color || '').trim());
      if (noColor) { message.warning('多颜色订单中，每项面辅料都必须指定颜色'); return; }
    }
    setSaving(true);
    try {
      const orderNo = currentPurchase?.orderNo || detailOrder?.orderNo || '';
      const styleNo = currentPurchase?.styleNo || detailOrder?.styleNo || '';
      // P1-1 修复：sourceType 优先级 row > currentPurchase > 默认 'order'（带 warn）
      const ctxSourceType = String((currentPurchase as any)?.sourceType || '').trim();
      const fallbackSourceType = ctxSourceType || (() => {
        console.warn('[PurchaseDetailView] sourceType 缺失，回退为默认值 order', { rowSourceType: undefined, ctxSourceType });
        return 'order';
      })();
      for (const row of validRows) {
        const purchaseQuantity = Number(row.purchaseQuantity || 0);
        const unitPrice = Number(row.unitPrice || 0);
        const totalAmount = Number.isFinite(purchaseQuantity) && Number.isFinite(unitPrice)
          ? Number((purchaseQuantity * unitPrice).toFixed(2)) : 0;
        const rowSourceType = String((row as any).sourceType || '').trim();
        const payload = { ...row, totalAmount, status: row.status || MATERIAL_PURCHASE_STATUS.PENDING, sourceType: rowSourceType || fallbackSourceType, orderNo: row.orderNo || orderNo, styleNo: row.styleNo || styleNo };
        const isTemp = !row.id || String(row.id).startsWith('tmp_');
        if (!isTemp) {
          await api.put('/production/purchase', payload);
        } else {
          const { id: _id, ...rest } = payload;
          await api.post('/production/purchase', rest);
        }
      }
      const originalIds = new Set(detailPurchases.map(p => p.id));
      const keptIds = new Set(validRows.filter(r => r.id && !String(r.id).startsWith('tmp_')).map(r => r.id));
      const deletedIds = [...originalIds].filter(id => !keptIds.has(id));
      for (const delId of deletedIds) { if (delId) await api.delete(`/production/purchase/${delId}`); }
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

  const openMaterialModal = useCallback((rowId: string) => {
    setMaterialTargetRowId(rowId);
    setMaterialModalOpen(true);
  }, []);

  const fillRowFromMaterial = useCallback((rowId: string, record: Record<string, unknown>) => {
    setEditableData(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        materialCode: String(record.materialCode || r.materialCode || ''),
        materialName: String(record.materialName || r.materialName || ''),
        materialType: String(record.materialType || r.materialType || 'accessoryA') as MaterialPurchaseType['materialType'],
        fabricComposition: String(record.fabricComposition || r.fabricComposition || ''),
        fabricWeight: String(record.fabricWeight || r.fabricWeight || ''),
        color: String(record.color || r.color || ''),
        specifications: String(record.specifications || r.specifications || ''),
        unit: String(record.unit || r.unit || ''),
        unitPrice: Number(record.unitPrice || r.unitPrice || 0),
        supplierName: String(record.supplierName || r.supplierName || ''),
        supplierId: String(record.supplierId || r.supplierId || ''),
      };
    }));
  }, []);

  const handleUseMaterial = useCallback(async (record: Record<string, unknown>) => {
    if (!materialTargetRowId) return;
    fillRowFromMaterial(materialTargetRowId, record);
    setMaterialModalOpen(false);
  }, [materialTargetRowId, fillRowFromMaterial]);

  const handleCancelConfirm = useCallback(async (reason: string) => {
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
  }, [cancelTarget, message, onRefresh]);

  const handleArrivalSubmit = useCallback(async (values: { arrivedQuantity: number }) => {
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
  }, [arrivalTarget, arrivalForm, message, onRefresh]);

  const handleRemoveRowWithConfirm = useCallback((rowId: string) => {
    confirmDelete('该物料行', async () => removeRow(rowId), { content: '删除此物料行？保存后将不可恢复' });
  }, [removeRow]);

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
