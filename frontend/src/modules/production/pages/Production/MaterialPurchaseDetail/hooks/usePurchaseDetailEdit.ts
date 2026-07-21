import { useState, useCallback } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import type { MaterialPurchase, ProductionOrder } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { ApiResult } from './types';
import { REQUIRED_FIELDS } from './types';

export interface PurchaseDetailEditParams {
  styleNoParam: string;
  orderNoParam: string;
  order: ProductionOrder | null;
  purchaseList: MaterialPurchase[];
  isMultiColor: boolean;
  colorList: string[];
  loadData: () => Promise<void>;
}

export interface PurchaseDetailEditState {
  editing: boolean;
  editableData: MaterialPurchase[];
  saving: boolean;
  handleStartEdit: () => void;
  handleCancelEdit: () => void;
  handleAddRow: () => void;
  handleUpdateRow: (rowId: string, field: keyof MaterialPurchase, value: unknown) => void;
  handleRemoveRow: (rowId: string) => void;
  handleSaveAll: () => Promise<void>;
  handleDelete: (record: MaterialPurchase) => void;
  materialModalOpen: boolean;
  setMaterialModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  materialTargetRowId: string | null;
  handleOpenMaterialModal: (rowId: string) => void;
  handleUseMaterial: (record: Record<string, unknown>) => Promise<void>;
  handleCreateMaterial: (values: Record<string, unknown>) => Promise<void>;
}

export function usePurchaseDetailEdit(params: PurchaseDetailEditParams): PurchaseDetailEditState {
  const { styleNoParam, orderNoParam, order, purchaseList, isMultiColor, colorList, loadData } = params;
  const { modal, message } = App.useApp();

  const [editing, setEditing] = useState(false);
  const [editableData, setEditableData] = useState<MaterialPurchase[]>([]);
  const [saving, setSaving] = useState(false);

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTargetRowId, setMaterialTargetRowId] = useState<string | null>(null);

  const handleStartEdit = useCallback(() => {
    if (purchaseList.length === 0 && isMultiColor && colorList.length > 0) {
      const autoRows: MaterialPurchase[] = colorList.map((color: string) => ({
        id: `tmp_${Date.now()}_${color}`,
        purchaseNo: '',
        supplierId: '',
        orderNo: orderNoParam || order?.orderNo || '',
        styleNo: styleNoParam,
        materialType: 'fabricA',
        materialCode: '',
        materialName: '',
        unit: '',
        color,
        size: '',
        specification: '',
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
      setEditableData([...purchaseList]);
    }
    setEditing(true);
  }, [purchaseList, isMultiColor, colorList, orderNoParam, order?.orderNo, styleNoParam]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditableData([]);
  }, []);

  const handleAddRow = useCallback(() => {
    const newRow: MaterialPurchase = {
      id: `tmp_${Date.now()}`,
      purchaseNo: '',
      supplierId: '',
      orderNo: orderNoParam || order?.orderNo || '',
      styleNo: styleNoParam,
      materialType: 'fabricA',
      materialCode: '',
      materialName: '',
      unit: '',
      color: '',
      size: '',
      specification: '',
      fabricComposition: '',
      fabricWeight: '',
      purchaseQuantity: 0,
      arrivedQuantity: 0,
      unitPrice: 0,
      totalAmount: 0,
      supplierName: '',
      status: MATERIAL_PURCHASE_STATUS.PENDING,
    } as MaterialPurchase;
    setEditableData((prev) => [...prev, newRow]);
  }, [orderNoParam, order?.orderNo, styleNoParam]);

  const handleUpdateRow = useCallback((rowId: string, field: keyof MaterialPurchase, value: unknown) => {
    setEditableData((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  }, []);

  const handleRemoveRow = useCallback((rowId: string) => {
    setEditableData((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const handleDelete = useCallback((record: MaterialPurchase) => {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除物料「${record.materialName || record.materialCode}」吗？此操作不可恢复。`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await api.delete<ApiResult<unknown>>(`/production/purchase/${record.id}`);
          if (res.code === 200) {
            message.success('删除成功');
            await loadData();
          } else {
            message.error(res.message || '删除失败');
          }
        } catch {
          message.error('删除失败，请重试');
        }
      },
    });
  }, [loadData, modal, message]);

  const handleSaveAll = useCallback(async () => {
    const validRows = editableData.filter((r) => {
      return r.materialCode || r.materialName;
    });
    if (validRows.length === 0) {
      message.warning('请至少添加一行面辅料信息');
      return;
    }

    const incompleteRow = validRows.find((r) => {
      return REQUIRED_FIELDS.some((field) => {
        const val = r[field];
        return val === undefined || val === null || String(val).trim() === '';
      });
    });
    if (incompleteRow) {
      message.warning('请完善所有面辅料的必填信息（物料类型、编码、名称、单位、供应商）');
      return;
    }

    if (isMultiColor) {
      const noColorRow = validRows.find((r) => !String(r.color || '').trim());
      if (noColorRow) {
        message.warning('多颜色订单中，每项面辅料都必须指定颜色');
        return;
      }
    }

    setSaving(true);
    try {
      const toSave = validRows.map((r) => {
        const purchaseQuantity = Number(r.purchaseQuantity || 0);
        const unitPrice = Number(r.unitPrice || 0);
        const totalAmount = Number.isFinite(purchaseQuantity) && Number.isFinite(unitPrice)
          ? Number((purchaseQuantity * unitPrice).toFixed(2)) : 0;
        const { id, ...rest } = r;
        const isTemp = id?.startsWith('tmp_');
        return {
          ...rest,
          totalAmount,
          status: r.status || MATERIAL_PURCHASE_STATUS.PENDING,
          sourceType: r.sourceType || 'order',
          orderNo: r.orderNo || orderNoParam || order?.orderNo || '',
          styleNo: r.styleNo || styleNoParam,
          ...(isTemp ? {} : { id }),
        };
      });

      for (const row of toSave) {
        if (row.id && !String(row.id).startsWith('tmp_')) {
          await api.put('/production/purchase', row);
        } else {
          await api.post('/production/purchase', row);
        }
      }

      const originalIds = new Set(purchaseList.map((p) => p.id));
      const keptIds = new Set(validRows.filter((r) => !String(r.id).startsWith('tmp_')).map((r) => r.id));
      const deletedIds = [...originalIds].filter((id) => !keptIds.has(id));

      for (const delId of deletedIds) {
        if (delId) await api.delete(`/production/purchase/${delId}`);
      }

      message.success('保存成功');
      setEditing(false);
      setEditableData([]);
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '保存失败';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }, [editableData, purchaseList, orderNoParam, order?.orderNo, styleNoParam, isMultiColor, loadData, message]);

  const handleOpenMaterialModal = useCallback((rowId: string) => {
    setMaterialTargetRowId(rowId);
    setMaterialModalOpen(true);
  }, []);

  const fillRowFromMaterial = useCallback((rowId: string, record: Record<string, unknown>) => {
    setEditableData((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          materialCode: String(record.materialCode || r.materialCode || ''),
          materialName: String(record.materialName || r.materialName || ''),
          materialType: String(record.materialType || r.materialType || 'accessoryA') as MaterialPurchase['materialType'],
          fabricComposition: String(record.fabricComposition || r.fabricComposition || ''),
          fabricWeight: String(record.fabricWeight || r.fabricWeight || ''),
          color: String(record.color || r.color || ''),
          specification: String(record.specifications || r.specification || ''),
          unit: String(record.unit || r.unit || ''),
          unitPrice: Number(record.unitPrice || r.unitPrice || 0),
          supplierName: String(record.supplierName || r.supplierName || ''),
          supplierId: String(record.supplierId || r.supplierId || ''),
          supplierContactPerson: String(record.supplierContactPerson || r['supplierContactPerson'] || ''),
          supplierContactPhone: String(record.supplierContactPhone || r['supplierContactPhone'] || ''),
        };
      })
    );
  }, []);

  const handleUseMaterial = useCallback(async (record: Record<string, unknown>) => {
    if (!materialTargetRowId) {
      message.error('请选择目标行');
      return;
    }
    fillRowFromMaterial(materialTargetRowId, record);
    setMaterialModalOpen(false);
  }, [materialTargetRowId, fillRowFromMaterial, message]);

  const handleCreateMaterial = useCallback(async (values: Record<string, unknown>) => {
    try {
      const res = await api.post<ApiResult<{ id?: string }>>('/material/database', values);
      if (res.code === 200 && materialTargetRowId) {
        fillRowFromMaterial(materialTargetRowId, {
          ...values,
          id: res.data?.id,
          materialCode: values.materialCode,
          materialName: values.materialName,
        });
        setMaterialModalOpen(false);
        message.success('物料创建成功并已填入');
      } else {
        message.error(res.message || '创建物料失败');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || '创建物料失败');
    }
  }, [materialTargetRowId, fillRowFromMaterial, message]);

  return {
    editing,
    editableData,
    saving,
    handleStartEdit,
    handleCancelEdit,
    handleAddRow,
    handleUpdateRow,
    handleRemoveRow,
    handleSaveAll,
    handleDelete,
    materialModalOpen,
    setMaterialModalOpen,
    materialTargetRowId,
    handleOpenMaterialModal,
    handleUseMaterial,
    handleCreateMaterial,
  };
}
