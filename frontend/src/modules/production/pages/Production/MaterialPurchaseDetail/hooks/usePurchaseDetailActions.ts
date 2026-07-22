import React, { useState } from 'react';
import { Form, App } from 'antd';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import type { MaterialPurchase } from '@/types/production';
import type { ApiResult } from './types';
import {
  postCancelReceive,
  postConfirmComplete,
  postReceive,
  postReturnConfirm,
} from './types';
import { useReceiveModal } from './useReceiveModal';
import { useReturnConfirmModal } from './useReturnConfirmModal';
import { useInboundModal } from './useInboundModal';
import {
  getOperatorName,
  buildBatchModalContent,
  exportPurchaseListCSV,
  filterPendingPurchases,
  filterReturnablePurchases,
  filterAwaitingConfirmPurchases,
} from './utils';

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

  const receiveModal = useReceiveModal({ canProcure, loadData });
  const returnConfirmModal = useReturnConfirmModal({ loadData });
  const inboundModal = useInboundModal({ loadData });

  const [qualityIssueVisible, setQualityIssueVisible] = useState(false);
  const [qualityIssueRecord, setQualityIssueRecord] = useState<MaterialPurchase | null>(null);
  const [confirmCompleteSubmitting, setConfirmCompleteSubmitting] = useState(false);

  const handleCancelReceive = (record: MaterialPurchase) => {
    modal.confirm({
      title: '取消领取',
      content: `确定要取消「${record.materialName || record.materialCode}」的领取状态吗？`,
      okText: '确认取消',
      cancelText: '返回',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await postCancelReceive({
            purchaseId: record.id,
            reason: '手动取消领取',
          });
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
    const pending = filterPendingPurchases(purchaseList);
    if (!pending.length) {
      message.info('没有待采购的项目');
      return;
    }
    const receiverName = getOperatorName(user);
    const contentEl = buildBatchModalContent(pending, '确认批量采购以下', (item) => ({
      name: item.materialName || item.materialCode,
      desc: item.color || '-',
      qtyText: `采购 ${item.purchaseQuantity}${item.unit || ''}`,
    }));
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
    const returnable = filterReturnablePurchases(purchaseList);
    if (!returnable.length) {
      message.info('没有可回料确认的物料');
      return;
    }
    const confirmerName = getOperatorName(user);
    const contentEl = buildBatchModalContent(returnable, '确认回料以下', (item) => ({
      name: item.materialName || item.materialCode,
      desc: item.color || '-',
      qtyText: `到货 ${item.arrivedQuantity || item.purchaseQuantity}${item.unit || ''}`,
    }));
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
          const res = await api.post<ApiResult<unknown>>(
            '/production/purchase/return-confirm/reset',
            { purchaseId: record.id }
          );
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
    const receiverName = getOperatorName(user);
    try {
      const res = await api.post<ApiResult<unknown>>(
        '/production/purchase/warehouse-pick',
        {
          purchaseId: record.id,
          pickQty,
          receiverId: user?.id || '',
          receiverName,
        }
      );
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

  const handleConfirmComplete = async () => {
    const targets = filterAwaitingConfirmPurchases(purchaseList);
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
    exportPurchaseListCSV(purchaseList, styleNoParam, message);
  };

  return {
    receiveForm: receiveModal.receiveForm,
    returnConfirmForm: returnConfirmModal.returnConfirmForm,
    inboundForm: inboundModal.inboundForm,
    receiveVisible: receiveModal.receiveVisible,
    setReceiveVisible: receiveModal.setReceiveVisible,
    receiveRecord: receiveModal.receiveRecord,
    receiveLoading: receiveModal.receiveLoading,
    inboundVisible: inboundModal.inboundVisible,
    setInboundVisible: inboundModal.setInboundVisible,
    inboundRecord: inboundModal.inboundRecord,
    returnConfirmVisible: returnConfirmModal.returnConfirmVisible,
    setReturnConfirmVisible: returnConfirmModal.setReturnConfirmVisible,
    returnConfirmRecord: returnConfirmModal.returnConfirmRecord,
    returnConfirmLoading: returnConfirmModal.returnConfirmLoading,
    qualityIssueVisible,
    setQualityIssueVisible,
    qualityIssueRecord,
    setQualityIssueRecord,
    confirmCompleteSubmitting,
    openReceive: receiveModal.openReceive,
    handleReceive: receiveModal.handleReceive,
    openInbound: inboundModal.openInbound,
    doInbound: inboundModal.doInbound,
    handleReturnConfirm: returnConfirmModal.handleReturnConfirm,
    doReturnConfirm: returnConfirmModal.doReturnConfirm,
    handleCancelReceive,
    handleBatchReceive,
    handleBatchReturnConfirm,
    handleConfirmComplete,
    handleReturnReset,
    handleWarehousePick,
    handleExport,
  };
}
