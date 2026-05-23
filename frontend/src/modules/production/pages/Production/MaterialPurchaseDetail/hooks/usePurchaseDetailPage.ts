import { useState, useEffect, useCallback, useMemo } from 'react';
import { Form, Modal, message } from 'antd';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import type { MaterialPurchase } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { normalizeMaterialQuantity } from '../../MaterialPurchase/utils';

const postSave = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase', payload);

const postReceive = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase/receive', payload);

const postReturnConfirm = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase/return-confirm', payload);

const postCancelReceive = (payload: Record<string, unknown>) =>
  api.post<{ code: number; message?: string }>('/production/purchase/cancel-receive', payload);

const postConfirmComplete = (payload: { purchaseId: string }) =>
  api.post<{ code: number; message?: string }>('/production/purchase/confirm-complete', payload);

export function usePurchaseDetailPage(styleNoParam: string, orderNoParam: string) {
  const { user } = useUser();

  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [purchaseList, setPurchaseList] = useState<MaterialPurchase[]>([]);

  const [addEditVisible, setAddEditVisible] = useState(false);
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
  const [currentRecord, setCurrentRecord] = useState<MaterialPurchase | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [receiveVisible, setReceiveVisible] = useState(false);
  const [receiveRecord, setReceiveRecord] = useState<MaterialPurchase | null>(null);
  const [receiveLoading, setReceiveLoading] = useState(false);

  const [qualityIssueVisible, setQualityIssueVisible] = useState(false);
  const [qualityIssueRecord, setQualityIssueRecord] = useState<MaterialPurchase | null>(null);

  const [confirmCompleteSubmitting, setConfirmCompleteSubmitting] = useState(false);

  const [form] = Form.useForm();
  const [receiveForm] = Form.useForm();

  const materialArrivalRate = useMemo(() => {
    const totalRequired = purchaseList.reduce((sum, item) => sum + normalizeMaterialQuantity(item.purchaseQuantity), 0);
    const totalArrived = purchaseList.reduce((sum, item) => sum + normalizeMaterialQuantity(item.arrivedQuantity), 0);
    if (totalRequired === 0) return 0;
    return Math.round((totalArrived / totalRequired) * 100);
  }, [purchaseList]);

  const loadData = useCallback(async () => {
    if (!styleNoParam) return;
    setLoading(true);
    try {
      try {
        const orderRes = await api.get('/production/order/list', {
          params: { styleNo: styleNoParam, page: 1, pageSize: 1 },
        });
        const orderResult = orderRes as any;
        const orders = (orderResult?.data as any)?.records || [];
        setOrder(orders.length > 0 ? orders[0] : null);
      } catch {
        setOrder(null);
      }

      const params: Record<string, any> = orderNoParam
        ? { orderNo: orderNoParam, page: 1, pageSize: 1000 }
        : { styleNo: styleNoParam, page: 1, pageSize: 1000 };
      const purchaseRes = await api.get('/production/purchase/list', { params });
      const result = purchaseRes as any;
      if (result?.code === 200) {
        setPurchaseList(result?.data?.records || []);
      } else {
        setPurchaseList(result?.data?.records || result?.records || []);
      }
    } catch {
      message.error('加载采购数据失败');
    } finally {
      setLoading(false);
    }
  }, [styleNoParam, orderNoParam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAdd = () => {
    setEditMode('create');
    setCurrentRecord(null);
    form.resetFields();
    form.setFieldsValue({
      orderNo: orderNoParam || order?.orderNo,
      styleNo: styleNoParam,
      arrivedQuantity: 0,
      status: MATERIAL_PURCHASE_STATUS.PENDING,
    });
    setAddEditVisible(true);
  };

  const openEdit = (record: MaterialPurchase) => {
    setEditMode('edit');
    setCurrentRecord(record);
    form.setFieldsValue({
      ...record,
      id: record.id,
      purchaseQuantity: record.purchaseQuantity,
      arrivedQuantity: record.arrivedQuantity,
      unitPrice: record.unitPrice,
    });
    setAddEditVisible(true);
  };

  const handleSave = async () => {
    try {
      setSubmitLoading(true);
      const values = await form.validateFields();
      const purchaseQuantity = Number(values.purchaseQuantity || 0);
      const unitPrice = Number(values.unitPrice || 0);
      const totalAmount = Number.isFinite(purchaseQuantity) && Number.isFinite(unitPrice)
        ? Number((purchaseQuantity * unitPrice).toFixed(2)) : undefined;
      const arrivedQuantity = Number(values.arrivedQuantity || 0);
      const computedStatus = arrivedQuantity <= 0
        ? MATERIAL_PURCHASE_STATUS.PENDING
        : arrivedQuantity < purchaseQuantity
          ? MATERIAL_PURCHASE_STATUS.PARTIAL
          : MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM;

      const payload = {
        ...values,
        totalAmount,
        status: computedStatus,
        sourceType: values.sourceType || 'order',
      };
      if (editMode === 'edit' && currentRecord?.id) {
        payload.id = currentRecord.id;
      }
      const response = await postSave(payload);
      if (response.code === 200) {
        message.success(editMode === 'create' ? '新增面辅料成功' : '编辑成功');
        setAddEditVisible(false);
        form.resetFields();
        await loadData();
      } else {
        message.error(response.message || '保存失败');
      }
    } catch (error: unknown) {
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

  const handleDelete = (record: MaterialPurchase) => {
    Modal.confirm({
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
  };

  const openReceive = (record: MaterialPurchase) => {
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
    Modal.confirm({
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
    Modal.confirm({
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
    const pending = purchaseList.filter(
      (p) => String(p.status || '').toLowerCase() === MATERIAL_PURCHASE_STATUS.PENDING && String(p.id || '').trim()
    );
    if (!pending.length) {
      message.info('没有待采购的项目');
      return;
    }
    const receiverName = String(user?.name || user?.username || '').trim();
    Modal.confirm({
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
    addEditVisible, setAddEditVisible, editMode, currentRecord, submitLoading,
    receiveVisible, setReceiveVisible, receiveRecord, receiveLoading,
    qualityIssueVisible, setQualityIssueVisible, qualityIssueRecord, setQualityIssueRecord,
    confirmCompleteSubmitting,
    loadData,
    openAdd, openEdit, handleSave, handleDelete,
    openReceive, handleReceive,
    handleReturnConfirm, handleCancelReceive,
    handleBatchReceive, handleConfirmComplete,
    handleExport,
    headerOrderNo, headerStyleNo, headerStyleName, headerStyleId, headerStyleCover, headerColor,
    user,
  };
}