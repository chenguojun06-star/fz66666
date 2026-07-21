import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import api from '@/utils/api';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { MaterialPurchase, ProductionOrder } from '@/types/production';

/**
 * 采购编辑相关 actions 子 hook
 * - 仅做结构拆分，业务逻辑/参数/API 路径保持原样
 */
export interface UsePurchaseEditActionsParams {
  message: MessageInstance;
  editableData: MaterialPurchase[];
  setEditableData: React.Dispatch<React.SetStateAction<MaterialPurchase[]>>;
  editing: boolean;
  setEditing: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  materialTargetRowId: string | null;
  setMaterialTargetRowId: React.Dispatch<React.SetStateAction<string | null>>;
  materialModalOpen: boolean;
  setMaterialModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  purchases: MaterialPurchase[];
  loadData: () => Promise<void>;
  getOrderStyleInfo: () => {
    orderId: string;
    orderNo: string;
    styleNo: string;
    styleName: string;
    styleId: string;
    styleCover: string | null;
  };
  sourceType: 'order' | 'sample';
  patternId?: string;
  order: ProductionOrder | null;
  orderColorSet: Set<string>;
  orderNo?: string;
}

export const usePurchaseEditActions = (params: UsePurchaseEditActionsParams) => {
  const {
    message,
    editableData,
    setEditableData,
    setEditing,
    setSaving,
    materialTargetRowId,
    setMaterialTargetRowId,
    setMaterialModalOpen,
    purchases,
    loadData,
    getOrderStyleInfo,
    sourceType,
    patternId,
    order,
    orderColorSet,
    orderNo,
  } = params;

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditableData([]);
  }, [setEditing, setEditableData]);

  const handleAddRow = useCallback(() => {
    const info = getOrderStyleInfo();
    const newRow: MaterialPurchase = {
      id: `tmp_${Date.now()}`,
      purchaseNo: '',
      supplierId: '',
      orderNo: info.orderNo,
      styleNo: info.styleNo,
      styleName: info.styleName,
      styleId: info.styleId,
      materialType: 'fabricA',
      materialCode: '',
      materialName: '',
      unit: '',
      color: '',
      size: '',
      specifications: '',
      fabricComposition: '',
      fabricWeight: '',
      purchaseQuantity: 0,
      arrivedQuantity: 0,
      unitPrice: 0,
      totalAmount: 0,
      supplierName: '',
      status: MATERIAL_PURCHASE_STATUS.PENDING,
    } as MaterialPurchase;
    setEditableData(prev => [...prev, newRow]);
  }, [getOrderStyleInfo, setEditableData]);

  const handleUpdateRow = useCallback((rowId: string, field: string, value: any) => {
    setEditableData(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
  }, [setEditableData]);

  const handleRemoveRow = useCallback((rowId: string) => {
    setEditableData(prev => prev.filter(r => r.id !== rowId));
  }, [setEditableData]);

  const handleSaveAll = useCallback(async () => {
    const validRows = editableData.filter(r => r.materialCode || r.materialName);
    if (validRows.length === 0) { message.warning('请至少添加一行物料'); return; }
    const REQUIRED = ['materialType', 'materialCode', 'materialName', 'unit', 'supplierName'];
    const incomplete = validRows.find(r => REQUIRED.some(f => { const v = (r as any)[f]; return v === undefined || v === null || String(v).trim() === ''; }));
    if (incomplete) { message.warning('请完善所有物料的必填信息'); return; }
    setSaving(true);
    try {
      for (const row of validRows) {
        const purchaseQuantity = Number(row.purchaseQuantity || 0);
        const unitPrice = Number(row.unitPrice || 0);
        const totalAmount = Number.isFinite(purchaseQuantity) && Number.isFinite(unitPrice) ? Number((purchaseQuantity * unitPrice).toFixed(2)) : 0;
        const resolvedSourceType = sourceType === 'sample' ? 'sample' : (order?.sourceBizType === 'SAMPLE' ? 'sample' : 'order');
        const payload = {
          ...row,
          totalAmount,
          status: row.status || MATERIAL_PURCHASE_STATUS.PENDING,
          sourceType: resolvedSourceType,
          ...(resolvedSourceType === 'sample' && patternId ? { patternProductionId: patternId } : {}),
        };
        const isTemp = !row.id || String(row.id).startsWith('tmp_');
        if (!isTemp) {
          await api.put('/production/purchase', payload);
        } else {
          const { id: _id, ...rest } = payload;
          await api.post('/production/purchase', rest);
        }
      }
      const originalIds = new Set(purchases.map(p => p.id));
      const keptIds = new Set(validRows.filter(r => r.id && !String(r.id).startsWith('tmp_')).map(r => r.id));
      const deletedIds = [...originalIds].filter(id => !keptIds.has(id));
      for (const delId of deletedIds) { if (delId) await api.delete(`/production/purchase/${delId}`); }
      message.success('保存成功');
      setEditing(false);
      setEditableData([]);
      loadData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [editableData, purchases, message, loadData, setEditing, setEditableData, setSaving, order?.sourceBizType, patternId, sourceType]);

  const handleOpenMaterialModal = useCallback((rowId: string) => {
    setMaterialTargetRowId(rowId);
    setMaterialModalOpen(true);
  }, [setMaterialTargetRowId, setMaterialModalOpen]);

  const fillRowFromMaterial = useCallback((rowId: string, record: Record<string, unknown>) => {
    setEditableData(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        materialCode: String(record.materialCode || r.materialCode || ''),
        materialName: String(record.materialName || r.materialName || ''),
        materialType: String(record.materialType || r.materialType || 'accessoryA') as MaterialPurchase['materialType'],
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
  }, [setEditableData]);

  const handleUseMaterial = useCallback(async (record: Record<string, unknown>) => {
    if (!materialTargetRowId) return;
    fillRowFromMaterial(materialTargetRowId, record);
    setMaterialModalOpen(false);
  }, [materialTargetRowId, fillRowFromMaterial, setMaterialModalOpen]);

  const handleStartEdit = useCallback(() => {
    if (purchases.length === 0 && orderColorSet.size > 1) {
      const autoRows: MaterialPurchase[] = Array.from(orderColorSet).map((color) => ({
        id: `tmp_${Date.now()}_${color}`,
        purchaseNo: '',
        supplierId: '',
        orderNo: orderNo || order?.orderNo || '',
        styleNo: order?.styleNo || '',
        styleName: order?.styleName || '',
        styleId: order?.styleId || '',
        materialType: 'fabricA',
        materialCode: '',
        materialName: '',
        unit: '',
        color,
        size: '',
        specifications: '',
        fabricComposition: '',
        fabricWeight: '',
        purchaseQuantity: 0,
        arrivedQuantity: 0,
        unitPrice: 0,
        totalAmount: 0,
        supplierName: '',
        status: MATERIAL_PURCHASE_STATUS.PENDING,
      } as MaterialPurchase));
      setEditableData(autoRows);
    } else {
      setEditableData([...purchases]);
    }
    setEditing(true);
  }, [purchases, orderColorSet, orderNo, order, setEditableData, setEditing]);

  return {
    handleCancelEdit,
    handleAddRow,
    handleUpdateRow,
    handleRemoveRow,
    handleSaveAll,
    handleOpenMaterialModal,
    fillRowFromMaterial,
    handleUseMaterial,
    handleStartEdit,
  };
};

export default usePurchaseEditActions;
