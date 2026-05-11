import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/utils/api';
import type { CuttingTask } from '@/types/production';

export interface CuttingBomRow {
  id?: string;
  cuttingTaskId?: string;
  productionOrderNo?: string;
  styleNo?: string;
  materialCode: string;
  materialName: string;
  materialType?: string;
  fabricComposition?: string;
  fabricWeight?: string;
  color?: string;
  size?: string;
  specification?: string;
  unit: string;
  usageAmount?: number;
  lossRate?: number;
  unitPrice?: number;
  totalPrice?: number;
  supplierId?: string;
  supplierName?: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
  materialId?: string;
  imageUrls?: string;
  remark?: string;
}

interface UseCuttingBomOptions {
  message: any;
  activeTask: CuttingTask | null;
  isEntryPage: boolean;
}

export function useCuttingBom({ message, activeTask, isEntryPage }: UseCuttingBomOptions) {
  const [bomList, setBomList] = useState<CuttingBomRow[]>([]);
  const [bomLoading, setBomLoading] = useState(false);
  const [bomEditing, setBomEditing] = useState(false);
  const [bomSaving, setBomSaving] = useState(false);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTargetRowId, setMaterialTargetRowId] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const isBundled: boolean = activeTask?.status === 'bundled';
  const canEdit: boolean = !!(isEntryPage && activeTask && !isBundled);

  const fetchBom = useCallback(async () => {
    if (!activeTask?.id || !isEntryPage) {
      setBomList([]);
      return;
    }
    const seq = (reqSeq.current += 1);
    setBomLoading(true);
    try {
      const res = await api.get<{ code: number; data: CuttingBomRow[] }>('/production/cutting-bom/list', {
        params: { cuttingTaskId: activeTask.id },
      });
      if (seq !== reqSeq.current) return;
      if (res.code === 200) {
        setBomList(res.data || []);
      } else {
        setBomList([]);
      }
    } catch {
      if (seq === reqSeq.current) setBomList([]);
    } finally {
      if (seq === reqSeq.current) setBomLoading(false);
    }
  }, [activeTask?.id, isEntryPage]);

  useEffect(() => {
    fetchBom();
  }, [fetchBom]);

  useEffect(() => {
    if (!isEntryPage || !activeTask?.id) {
      setBomEditing(false);
    }
  }, [isEntryPage, activeTask?.id]);

  const handleAddRow = useCallback(() => {
    const newRow: CuttingBomRow = {
      id: `tmp_${Date.now()}`,
      cuttingTaskId: activeTask?.id,
      productionOrderNo: activeTask?.productionOrderNo,
      styleNo: activeTask?.styleNo,
      materialCode: '',
      materialName: '',
      materialType: 'fabricA',
      unit: '',
      usageAmount: 0,
      lossRate: 0,
      unitPrice: 0,
      supplierName: '',
    };
    setBomList((prev) => [...prev, newRow]);
    setBomEditing(true);
  }, [activeTask]);

  const handleRemoveRow = useCallback((rowId: string) => {
    setBomList((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const handleUpdateRow = useCallback((rowId: string, field: string, value: any) => {
    setBomList((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeTask?.id) {
      message.error('裁剪任务不存在');
      return;
    }
    const validRows = bomList.filter((r) => r.materialCode || r.materialName);
    if (validRows.length === 0) {
      message.warning('请至少添加一行面辅料信息');
      return;
    }
    setBomSaving(true);
    try {
      const payload = validRows.map((r) => {
        const { id, ...rest } = r;
        const isTemp = id?.startsWith('tmp_');
        return {
          ...rest,
          ...(isTemp ? {} : { id }),
          cuttingTaskId: activeTask.id,
          productionOrderNo: activeTask.productionOrderNo,
          styleNo: activeTask.styleNo,
        };
      });

      for (const row of payload) {
        if (row.id) {
          await api.put('/production/cutting-bom', row);
        } else {
          await api.post('/production/cutting-bom', row);
        }
      }

      const deletedIds = bomList
        .filter((r) => !r.id?.startsWith('tmp_') && !validRows.find((v) => v.id === r.id))
        .map((r) => r.id);
      for (const delId of deletedIds) {
        if (delId) await api.delete(`/production/cutting-bom/${delId}`);
      }

      message.success('保存成功');
      setBomEditing(false);
      await fetchBom();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '保存失败';
      message.error(msg);
    } finally {
      setBomSaving(false);
    }
  }, [activeTask, bomList, message, fetchBom]);

  const handleDelete = useCallback(async (rowId: string) => {
    if (rowId.startsWith('tmp_')) {
      handleRemoveRow(rowId);
      return;
    }
    try {
      await api.delete(`/production/cutting-bom/${rowId}`);
      message.success('删除成功');
      await fetchBom();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '删除失败';
      message.error(msg);
    }
  }, [message, fetchBom, handleRemoveRow]);

  const handleOpenMaterialModal = useCallback((rowId: string) => {
    setMaterialTargetRowId(rowId);
    setMaterialModalOpen(true);
  }, []);

  const fillRowFromMaterial = useCallback((rowId: string, record: Record<string, unknown>) => {
    setBomList((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          materialCode: String(record.materialCode || r.materialCode || ''),
          materialName: String(record.materialName || r.materialName || ''),
          materialType: String(record.materialType || r.materialType || 'accessory'),
          fabricComposition: String(record.fabricComposition || r.fabricComposition || ''),
          fabricWeight: String(record.fabricWeight || r.fabricWeight || ''),
          color: String(record.color || r.color || ''),
          specification: String(record.specifications || r.specification || ''),
          unit: String(record.unit || r.unit || ''),
          unitPrice: Number(record.unitPrice || r.unitPrice || 0),
          supplierId: String(record.supplierId || r.supplierId || ''),
          supplierName: String(record.supplierName || r.supplierName || ''),
          supplierContactPerson: String(record.supplierContactPerson || r.supplierContactPerson || ''),
          supplierContactPhone: String(record.supplierContactPhone || r.supplierContactPhone || ''),
          materialId: String(record.id || r.materialId || ''),
          imageUrls: String(record.image || r.imageUrls || ''),
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
      const res = await api.post('/material/database', values);
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
    bomList,
    bomLoading,
    bomEditing,
    setBomEditing,
    bomSaving,
    canEdit,
    isBundled,
    materialModalOpen,
    setMaterialModalOpen,
    materialTargetRowId,
    handleAddRow,
    handleRemoveRow,
    handleUpdateRow,
    handleSave,
    handleDelete,
    handleOpenMaterialModal,
    handleUseMaterial,
    handleCreateMaterial,
    fetchBom,
  };
}

export type { UseCuttingBomOptions };
