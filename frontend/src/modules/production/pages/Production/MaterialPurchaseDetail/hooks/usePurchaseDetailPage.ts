import { useState, useEffect, useCallback, useMemo } from 'react';
import { Form, App } from 'antd';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import type { MaterialPurchase } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { normalizeMaterialQuantity } from '../../MaterialPurchase/utils';

const _postSave = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase', payload);

const postReceive = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase/receive', payload);

const postReturnConfirm = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase/return-confirm', payload);

const postCancelReceive = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase/cancel-receive', payload);

const postConfirmComplete = (payload: { purchaseId: string }) =>
  api.post<{ code: number; message?: string }>('/production/purchase/confirm-complete', payload);

const REQUIRED_FIELDS: (keyof MaterialPurchase)[] = ['materialType', 'materialCode', 'materialName', 'unit', 'supplierName'];

export function usePurchaseDetailPage(styleNoParam: string, orderNoParam: string) {
  const { user } = useUser();
  const { modal, message } = App.useApp();

  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [purchaseList, setPurchaseList] = useState<MaterialPurchase[]>([]);

  const [receiveVisible, setReceiveVisible] = useState(false);
  const [receiveRecord, setReceiveRecord] = useState<MaterialPurchase | null>(null);
  const [receiveLoading, setReceiveLoading] = useState(false);

  const [qualityIssueVisible, setQualityIssueVisible] = useState(false);
  const [qualityIssueRecord, setQualityIssueRecord] = useState<MaterialPurchase | null>(null);

  const [confirmCompleteSubmitting, setConfirmCompleteSubmitting] = useState(false);

  const [form] = Form.useForm();
  const [receiveForm] = Form.useForm();

  const [editing, setEditing] = useState(false);
  const [editableData, setEditableData] = useState<MaterialPurchase[]>([]);
  const [saving, setSaving] = useState(false);

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTargetRowId, setMaterialTargetRowId] = useState<string | null>(null);

  const colorList = useMemo(() => {
    const raw = order?.color || '';
    if (!raw) return [];
    return raw.split(/[/,，、]/).map((s: string) => s.trim()).filter(Boolean);
  }, [order?.color]);

  const isMultiColor = colorList.length > 1;

  const missingColors = useMemo(() => {
    if (!isMultiColor) return [];
    if (purchaseList.length === 0) return colorList;
    const coveredColors = new Set(
      purchaseList
        .map((item) => String(item.color || '').trim())
        .filter(Boolean)
    );
    return colorList.filter((c: string) => !coveredColors.has(c));
  }, [isMultiColor, colorList, purchaseList]);

  const materialArrivalRate = useMemo(() => {
    const totalRequired = purchaseList.reduce((sum, item) => sum + normalizeMaterialQuantity(item.purchaseQuantity), 0);
    const totalArrived = purchaseList.reduce((sum, item) => sum + normalizeMaterialQuantity(item.arrivedQuantity), 0);
    if (totalRequired === 0) return 0;
    return Math.round((totalArrived / totalRequired) * 100);
  }, [purchaseList]);

  const bomIncomplete = useMemo(() => {
    if (purchaseList.length === 0) return true;
    return purchaseList.some((item) => {
      return REQUIRED_FIELDS.some((field) => {
        const val = item[field];
        return val === undefined || val === null || String(val).trim() === '';
      });
    });
  }, [purchaseList]);

  const loadData = useCallback(async () => {
    if (!styleNoParam) return;
    setLoading(true);
    let orderRecord: any = null;
    try {
      try {
        const orderRes = await api.get('/production/order/list', {
          params: { styleNo: styleNoParam, page: 1, pageSize: 1 },
        });
        const orderResult = orderRes as any;
        const orders = (orderResult?.data as any)?.records || [];
        orderRecord = orders.length > 0 ? orders[0] : null;
        setOrder(orderRecord);
      } catch {
        setOrder(null);
      }

      const params: Record<string, any> = orderNoParam
        ? { orderNo: orderNoParam, page: 1, pageSize: 1000 }
        : { styleNo: styleNoParam, page: 1, pageSize: 1000 };
      const purchaseRes = await api.get('/production/purchase/list', { params });
      const result = purchaseRes as any;
      let records: MaterialPurchase[] = [];
      if (result?.code === 200) {
        records = result?.data?.records || [];
      } else {
        records = result?.data?.records || result?.records || [];
      }

      if (records.length === 0 && orderRecord?.id) {
        try {
          const previewRes = await api.get<{ code: number; data: MaterialPurchase[] }>(
            '/production/purchase/demand/preview',
            { params: { orderId: orderRecord.id } }
          );
          if ((previewRes as any)?.code === 200 && Array.isArray((previewRes as any)?.data)) {
            records = (previewRes as any).data;
          }
        } catch { /* 预览不可用则用空列表 */ }
      }

      setPurchaseList(records);
    } catch {
      message.error('加载采购数据失败');
    } finally {
      setLoading(false);
    }
  }, [styleNoParam, orderNoParam, message]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartEdit = useCallback(() => {
    setEditableData([...purchaseList]);
    setEditing(true);
  }, [purchaseList]);

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

  const handleUpdateRow = useCallback((rowId: string, field: string, value: any) => {
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
          const res = await api.delete(`/production/purchase/${record.id}`);
          if ((res as any).code === 200) {
            message.success('删除成功');
            await loadData();
          } else {
            message.error((res as any).message || '删除失败');
          }
        } catch {
          message.error('删除失败，请重试');
        }
      },
    });
  }, [loadData]);

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
          sourceType: (r as any).sourceType || 'order',
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
  }, [editableData, purchaseList, orderNoParam, order?.orderNo, styleNoParam, isMultiColor, loadData]);

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
          supplierContactPerson: String(record.supplierContactPerson || (r as any).supplierContactPerson || ''),
          supplierContactPhone: String(record.supplierContactPhone || (r as any).supplierContactPhone || ''),
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

  const canProcure = !bomIncomplete;

  const openReceive = (record: MaterialPurchase) => {
    if (!canProcure) {
      message.warning('请先完善面辅料信息再领取采购');
      return;
    }
    setReceiveRecord(record);
    receiveForm.resetFields();
    receiveForm.setFieldsValue({ quantity: record.purchaseQuantity });
    setReceiveVisible(true);
  };

  const handleReceive = async () => {
    if (!receiveRecord) return;
    try {
      setReceiveLoading(true);
      const values = await receiveForm.validateFields();
      const receiverName = String(user?.name || user?.username || '').trim();
      const response = await postReceive({
        purchaseId: receiveRecord.id,
        quantity: values.quantity,
        receiverId: user?.id || '',
        receiverName,
      });
      if (response.code === 200) {
        message.success('采购/到货成功');
        setReceiveVisible(false);
        receiveForm.resetFields();
        await loadData();
      } else {
        message.error(response.message || '操作失败');
      }
    } catch (error: unknown) {
      const formError = error as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) {
        message.error(formError.errorFields[0]?.errors?.[0] || '请填写数量');
      } else {
        message.error((error as Error).message || '操作失败');
      }
    } finally {
      setReceiveLoading(false);
    }
  };

  const handleReturnConfirm = (record: MaterialPurchase) => {
    const confirmerName = String(user?.name || user?.username || '').trim();
    modal.confirm({
      title: '回料确认',
      content: `确认物料「${record.materialName || record.materialCode}」已回料吗？`,
      okText: '确认回料',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await postReturnConfirm({
            purchaseId: record.id,
            confirmerName,
            returnQuantity: Number(record.arrivedQuantity || record.purchaseQuantity),
          });
          if (res.code === 200) {
            message.success('回料确认成功');
            await loadData();
          } else {
            message.error(res.message || '回料确认失败');
          }
        } catch {
          message.error('回料确认失败');
        }
      },
    });
  };

  const handleCancelReceive = (record: MaterialPurchase) => {
    modal.confirm({
      title: '取消领取',
      content: `确定要取消「${record.materialName || record.materialCode}」的领取状态吗？`,
      okText: '确认取消',
      cancelText: '返回',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await postCancelReceive({ purchaseId: record.id, reason: '手动取消领取' });
          if (res.code === 200) {
            message.success('取消领取成功');
            await loadData();
          } else {
            message.error(res.message || '取消领取失败');
          }
        } catch {
          message.error('取消领取失败');
        }
      },
    });
  };

  const handleBatchReceive = async () => {
    if (!canProcure) {
      message.warning('请先完善面辅料信息再批量采购');
      return;
    }
    const pending = purchaseList.filter(
      (p) => String(p.status || '').toLowerCase() === MATERIAL_PURCHASE_STATUS.PENDING && String(p.id || '').trim()
    );
    if (!pending.length) {
      message.info('没有待采购的项目');
      return;
    }
    const receiverName = String(user?.name || user?.username || '').trim();
    modal.confirm({
      title: '批量采购',
      content: `确认批量采购 ${pending.length} 项物料吗？`,
      okText: '确认批量采购',
      cancelText: '取消',
      onOk: async () => {
        for (const item of pending) {
          try {
            await postReceive({
              purchaseId: item.id,
              quantity: item.purchaseQuantity,
              receiverId: user?.id || '',
              receiverName,
            });
          } catch { /* continue */ }
        }
        message.success('批量采购完成');
        await loadData();
      },
    });
  };

  const handleBatchReturnConfirm = async () => {
    const returnable = purchaseList.filter((p) => {
      const s = String(p.status || '').toLowerCase();
      return (s === MATERIAL_PURCHASE_STATUS.RECEIVED || s === MATERIAL_PURCHASE_STATUS.PARTIAL || s === MATERIAL_PURCHASE_STATUS.COMPLETED)
        && Number((p as any)?.returnConfirmed || 0) !== 1;
    });
    if (!returnable.length) {
      message.info('没有可回料确认的物料');
      return;
    }
    const confirmerName = String(user?.name || user?.username || '').trim();
    modal.confirm({
      title: '批量回料确认',
      content: `确认批量回料确认 ${returnable.length} 项物料吗？`,
      okText: '确认回料',
      cancelText: '取消',
      onOk: async () => {
        for (const item of returnable) {
          try {
            await postReturnConfirm({
              purchaseId: item.id,
              confirmerName,
              returnQuantity: Number(item.arrivedQuantity || item.purchaseQuantity),
            });
          } catch { /* continue */ }
        }
        message.success('批量回料确认完成');
        await loadData();
      },
    });
  };

  const handleReturnReset = (record: MaterialPurchase) => {
    modal.confirm({
      title: '退回',
      content: `确定要退回「${record.materialName || record.materialCode}」的回料确认吗？`,
      okText: '确认退回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await api.post('/production/purchase/return-confirm/reset', { purchaseId: record.id });
          if ((res as any).code === 200) {
            message.success('退回成功');
            await loadData();
          } else {
            message.error((res as any).message || '退回失败');
          }
        } catch {
          message.error('退回失败');
        }
      },
    });
  };

  const handleWarehousePick = async (record: MaterialPurchase, pickQty: number) => {
    const receiverName = String(user?.name || user?.username || '').trim();
    try {
      const res = await api.post('/production/purchase/warehouse-pick', {
        purchaseId: record.id,
        pickQty,
        receiverId: user?.id || '',
        receiverName,
      });
      if ((res as any).code === 200) {
        message.success('出库领取成功');
        await loadData();
      } else {
        message.error((res as any).message || '出库领取失败');
      }
    } catch {
      message.error('出库领取失败');
    }
  };

  const handleConfirmComplete = async () => {
    const targets = purchaseList.filter(
      (p) => String(p.status || '').toLowerCase() === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM
    );
    if (!targets.length) {
      message.info('没有待确认完成的采购项目');
      return;
    }
    try {
      setConfirmCompleteSubmitting(true);
      for (const t of targets) {
        await postConfirmComplete({ purchaseId: String(t.id) });
      }
      message.success(`已确认 ${targets.length} 项采购完成`);
      await loadData();
    } catch {
      message.error('确认完成失败');
    } finally {
      setConfirmCompleteSubmitting(false);
    }
  };

  const handleExport = () => {
    if (!purchaseList.length) {
      message.info('没有可导出的数据');
      return;
    }
    const header = '物料类型,物料名称,物料编码,颜色,尺码,单位,单价,采购数量,到货数量,金额,供应商,采购日期,最新到货日期,状态\n';
    const rows = purchaseList.map((item) => {
      const amount = Number(item.purchaseQuantity || 0) * Number(item.unitPrice || 0);
      return [
        item.materialType || '',
        item.materialName || '',
        item.materialCode || '',
        item.color || '',
        item.size || '',
        item.unit || '',
        item.unitPrice || '',
        item.purchaseQuantity || '',
        item.arrivedQuantity || '',
        amount.toFixed(2),
        item.supplierName || '',
        item.receivedTime || '',
        item.expectedArrivalDate || '',
        item.status || '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    }).join('\n');
    const csv = '\uFEFF' + header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `采购明细_${styleNoParam}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    message.success('导出成功');
  };

  const headerOrderNo = order?.orderNo || orderNoParam || '';
  const headerStyleNo = order?.styleNo || styleNoParam || '';
  const headerStyleName = order?.styleName || '';
  const headerStyleId = order?.styleId;
  const headerStyleCover = order?.styleCover || null;
  const headerColor = order?.color || '';

  return {
    loading, order, purchaseList, materialArrivalRate,
    form, receiveForm,
    receiveVisible, setReceiveVisible, receiveRecord, receiveLoading,
    qualityIssueVisible, setQualityIssueVisible, qualityIssueRecord, setQualityIssueRecord,
    confirmCompleteSubmitting,
    loadData,
    handleDelete,
    openReceive, handleReceive,
    handleReturnConfirm, handleCancelReceive,
    handleBatchReceive, handleBatchReturnConfirm, handleConfirmComplete,
    handleReturnReset, handleWarehousePick,
    handleExport,
    headerOrderNo, headerStyleNo, headerStyleName, headerStyleId, headerStyleCover, headerColor,
    user,
    editing, editableData, saving,
    handleStartEdit, handleCancelEdit, handleAddRow,
    handleUpdateRow, handleRemoveRow, handleSaveAll,
    materialModalOpen, setMaterialModalOpen, materialTargetRowId,
    handleOpenMaterialModal, handleUseMaterial, handleCreateMaterial,
    colorList, isMultiColor, canProcure, bomIncomplete, missingColors,
  };
}