import React, { useState, useCallback } from 'react';
import { Form, App } from 'antd';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import type { MaterialPurchase } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { ApiResult } from './types';
import {
  postReceive,
  postReturnConfirm,
  postCancelReceive,
  postConfirmComplete,
} from './types';

export interface PurchaseDetailActionsParams {
  purchaseList: MaterialPurchase[];
  canProcure: boolean;
  styleNoParam: string;
  loadData: () => Promise<void>;
}

export interface PurchaseDetailActionsState {
  receiveForm: ReturnType<typeof Form.useForm>[0];
  returnConfirmForm: ReturnType<typeof Form.useForm>[0];
  inboundForm: ReturnType<typeof Form.useForm>[0];
  receiveVisible: boolean;
  setReceiveVisible: React.Dispatch<React.SetStateAction<boolean>>;
  receiveRecord: MaterialPurchase | null;
  receiveLoading: boolean;
  inboundVisible: boolean;
  setInboundVisible: React.Dispatch<React.SetStateAction<boolean>>;
  inboundRecord: MaterialPurchase | null;
  returnConfirmVisible: boolean;
  setReturnConfirmVisible: React.Dispatch<React.SetStateAction<boolean>>;
  returnConfirmRecord: MaterialPurchase | null;
  returnConfirmLoading: boolean;
  qualityIssueVisible: boolean;
  setQualityIssueVisible: React.Dispatch<React.SetStateAction<boolean>>;
  qualityIssueRecord: MaterialPurchase | null;
  setQualityIssueRecord: React.Dispatch<React.SetStateAction<MaterialPurchase | null>>;
  confirmCompleteSubmitting: boolean;
  openReceive: (record: MaterialPurchase) => void;
  handleReceive: () => Promise<void>;
  openInbound: (record: MaterialPurchase) => void;
  doInbound: () => Promise<void>;
  handleReturnConfirm: (record: MaterialPurchase) => void;
  doReturnConfirm: () => Promise<void>;
  handleCancelReceive: (record: MaterialPurchase) => void;
  handleBatchReceive: () => Promise<void>;
  handleBatchReturnConfirm: () => Promise<void>;
  handleConfirmComplete: () => Promise<void>;
  handleReturnReset: (record: MaterialPurchase) => void;
  handleWarehousePick: (record: MaterialPurchase, pickQty: number) => Promise<void>;
  handleExport: () => void;
}

export function usePurchaseDetailActions(params: PurchaseDetailActionsParams): PurchaseDetailActionsState {
  const { purchaseList, canProcure, styleNoParam, loadData } = params;
  const { user } = useUser();
  const { modal, message } = App.useApp();

  const [receiveVisible, setReceiveVisible] = useState(false);
  const [receiveRecord, setReceiveRecord] = useState<MaterialPurchase | null>(null);
  const [receiveLoading, setReceiveLoading] = useState(false);

  const [returnConfirmVisible, setReturnConfirmVisible] = useState(false);
  const [returnConfirmRecord, setReturnConfirmRecord] = useState<MaterialPurchase | null>(null);
  const [returnConfirmLoading, setReturnConfirmLoading] = useState(false);

  const [qualityIssueVisible, setQualityIssueVisible] = useState(false);
  const [qualityIssueRecord, setQualityIssueRecord] = useState<MaterialPurchase | null>(null);

  const [confirmCompleteSubmitting, setConfirmCompleteSubmitting] = useState(false);

  const [receiveForm] = Form.useForm();
  const [returnConfirmForm] = Form.useForm();

  // 到货入库
  const [inboundVisible, setInboundVisible] = useState(false);
  const [inboundRecord, setInboundRecord] = useState<MaterialPurchase | null>(null);
  const [inboundForm] = Form.useForm();

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

  const handleReturnConfirm = useCallback((record: MaterialPurchase) => {
    setReturnConfirmRecord(record);
    returnConfirmForm.resetFields();
    returnConfirmForm.setFieldsValue({ quantity: Number(record.arrivedQuantity || record.purchaseQuantity || 0) });
    setReturnConfirmVisible(true);
  }, [returnConfirmForm]);

  const doReturnConfirm = useCallback(async () => {
    if (!returnConfirmRecord) return;
    try {
      setReturnConfirmLoading(true);
      const values = await returnConfirmForm.validateFields();
      const confirmerName = String(user?.name || user?.username || '').trim();
      const res = await postReturnConfirm({
        purchaseId: returnConfirmRecord.id,
        confirmerName,
        returnQuantity: values.quantity,
      });
      if (res.code === 200) {
        message.success('回料确认成功');
        setReturnConfirmVisible(false);
        returnConfirmForm.resetFields();
        await loadData();
      } else {
        message.error(res.message || '回料确认失败');
      }
    } catch (error: unknown) {
      const formError = error as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) {
        message.error(formError.errorFields[0]?.errors?.[0] || '请填写数量');
      } else {
        message.error((error as Error).message || '回料确认失败');
      }
    } finally {
      setReturnConfirmLoading(false);
    }
  }, [returnConfirmRecord, returnConfirmForm, user, message, loadData]);

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
    const contentEl = React.createElement('div', null,
      React.createElement('p', null, `确认批量采购以下 ${pending.length} 项物料：`),
      React.createElement('div', { style: { maxHeight: 320, overflowY: 'auto', marginTop: 8, fontSize: 13 } },
        pending.map((item, idx) =>
          React.createElement('div', { key: idx, style: { padding: '6px 0', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between' } },
            React.createElement('span', null, `${item.materialName || item.materialCode} · ${item.color || '-'}`),
            React.createElement('span', { style: { color: 'var(--color-primary)' } }, `采购 ${item.purchaseQuantity}${item.unit || ''}`)
          )
        )
      )
    );
    modal.confirm({
      title: '批量采购',
      content: contentEl,
      okText: '确认批量采购',
      cancelText: '取消',
      width: '40vw',
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
        && Number(p.returnConfirmed ? 1 : 0) !== 1;
    });
    if (!returnable.length) {
      message.info('没有可回料确认的物料');
      return;
    }
    const confirmerName = String(user?.name || user?.username || '').trim();
    const contentEl = React.createElement('div', null,
      React.createElement('p', null, `确认回料以下 ${returnable.length} 项物料：`),
      React.createElement('div', { style: { maxHeight: 320, overflowY: 'auto', marginTop: 8, fontSize: 13 } },
        returnable.map((item, idx) =>
          React.createElement('div', { key: idx, style: { padding: '6px 0', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between' } },
            React.createElement('span', null, `${item.materialName || item.materialCode} · ${item.color || '-'}`),
            React.createElement('span', { style: { color: 'var(--color-primary)' } }, `到货 ${item.arrivedQuantity || item.purchaseQuantity}${item.unit || ''}`)
          )
        )
      )
    );
    modal.confirm({
      title: '批量回料确认',
      content: contentEl,
      okText: '确认回料',
      cancelText: '取消',
      width: '40vw',
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
          const res = await api.post<ApiResult<unknown>>('/production/purchase/return-confirm/reset', { purchaseId: record.id });
          if (res.code === 200) {
            message.success('退回成功');
            await loadData();
          } else {
            message.error(res.message || '退回失败');
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
      const res = await api.post<ApiResult<unknown>>('/production/purchase/warehouse-pick', {
        purchaseId: record.id,
        pickQty,
        receiverId: user?.id || '',
        receiverName,
      });
      if (res.code === 200) {
        message.success('出库领取成功');
        await loadData();
      } else {
        message.error(res.message || '出库领取失败');
      }
    } catch {
      message.error('出库领取失败');
    }
  };

  const openInbound = (record: MaterialPurchase) => {
    setInboundRecord(record);
    const maxQty = Math.max(0.01, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
    inboundForm.setFieldsValue({ arrivedQuantity: maxQty });
    setInboundVisible(true);
  };

  const doInbound = async () => {
    if (!inboundRecord) return;
    try {
      const values = await inboundForm.validateFields();
      const operatorName = String(user?.name || user?.username || '').trim();
      const res = await api.post<ApiResult<unknown>>('/production/material/inbound/confirm-arrival', {
        purchaseId: inboundRecord.id,
        arrivedQuantity: values.arrivedQuantity,
        operatorId: user?.id || '',
        operatorName,
        warehouseLocation: values.warehouseLocation,
        remark: values.remark,
      });
      if (res.code === 200) {
        message.success('到货入库成功，库存已更新');
        setInboundVisible(false);
        inboundForm.resetFields();
        await loadData();
      } else {
        message.error(res.message || '到货入库失败');
      }
    } catch (error: unknown) {
      const formError = error as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) {
        message.error(formError.errorFields[0]?.errors?.[0] || '请填写数量');
      } else {
        message.error((error as Error).message || '到货入库失败');
      }
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

  return {
    receiveForm,
    returnConfirmForm,
    inboundForm,
    receiveVisible,
    setReceiveVisible,
    receiveRecord,
    receiveLoading,
    inboundVisible,
    setInboundVisible,
    inboundRecord,
    returnConfirmVisible,
    setReturnConfirmVisible,
    returnConfirmRecord,
    returnConfirmLoading,
    qualityIssueVisible,
    setQualityIssueVisible,
    qualityIssueRecord,
    setQualityIssueRecord,
    confirmCompleteSubmitting,
    openReceive,
    handleReceive,
    openInbound,
    doInbound,
    handleReturnConfirm,
    doReturnConfirm,
    handleCancelReceive,
    handleBatchReceive,
    handleBatchReturnConfirm,
    handleConfirmComplete,
    handleReturnReset,
    handleWarehousePick,
    handleExport,
  };
}
