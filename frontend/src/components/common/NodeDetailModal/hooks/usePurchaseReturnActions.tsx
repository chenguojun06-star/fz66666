import React, { useCallback } from 'react';
import type { FormInstance } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { HookAPI as ModalHookAPI } from 'antd/es/modal/useModal';
import api from '@/utils/api';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { normalizeStatus } from '../InlinePurchasePanel.helpers';
import type { UserInfo } from '@/utils/AuthContext';
import type { MaterialPurchase } from '@/types/production';

/**
 * 采购回料/确认完成/品质异常相关 actions 子 hook
 * - 仅做结构拆分，业务逻辑/参数/API 路径保持原样
 */
export interface UsePurchaseReturnActionsParams {
  message: MessageInstance;
  modal: ModalHookAPI;
  user?: UserInfo | null;
  purchases: MaterialPurchase[];
  loadData: () => Promise<void>;
  returnModalRecord: MaterialPurchase | null;
  setReturnModalRecord: React.Dispatch<React.SetStateAction<MaterialPurchase | null>>;
  returnModalVisible: boolean;
  setReturnModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  returnForm: FormInstance;
  actionLoading: boolean;
  setActionLoading: React.Dispatch<React.SetStateAction<boolean>>;
  confirmCompleteLoading: boolean;
  setConfirmCompleteLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export const usePurchaseReturnActions = (params: UsePurchaseReturnActionsParams) => {
  const {
    message,
    modal,
    user,
    purchases,
    loadData,
    returnModalRecord,
    setReturnModalRecord,
    setReturnModalVisible,
    returnForm,
    setActionLoading,
    setConfirmCompleteLoading,
  } = params;

  const handleConfirmReturn = useCallback(async (record: MaterialPurchase) => {
    setReturnModalRecord(record);
    returnForm.setFieldsValue({ quantity: Number(record.arrivedQuantity || record.purchaseQuantity || 0) });
    setReturnModalVisible(true);
  }, [setReturnModalRecord, returnForm, setReturnModalVisible]);

  const doReturnConfirm = useCallback(async () => {
    try {
      const values = await returnForm.validateFields();
      const record = returnModalRecord;
      if (!record) return;
      const purchaseId = String(record?.id || '').trim();
      if (!purchaseId) return;
      const confirmerId = String(user?.id || '').trim();
      const confirmerName = String(user?.name || user?.username || '').trim();
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/return-confirm', {
        purchaseId,
        returnQuantity: values.quantity,
        confirmerId,
        confirmerName,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 回料确认成功`);
        setReturnModalVisible(false);
        loadData();
      } else {
        message.error(res?.message || '回料确认失败');
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error((e as Error)?.message || '回料确认失败');
    }
  }, [returnModalRecord, returnForm, user, message, loadData, setReturnModalVisible]);

  const handleReturnReset = useCallback(async (record: MaterialPurchase) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) return;
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/return-confirm/reset', {
        purchaseId,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 已退回`);
        loadData();
      } else {
        message.error(res?.message || '退回失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '退回失败');
    }
  }, [message, loadData]);

  const handleBatchReturn = useCallback(async () => {
    const returnable = purchases.filter(p => {
      const s = normalizeStatus(p.status);
      return (s === MATERIAL_PURCHASE_STATUS.RECEIVED || s === MATERIAL_PURCHASE_STATUS.PARTIAL || s === MATERIAL_PURCHASE_STATUS.COMPLETED)
        && Number(p?.returnConfirmed || 0) !== 1;
    });
    if (returnable.length === 0) {
      message.info('没有可回料确认的物料');
      return;
    }
    const contentEl = (
      <div>
        <p>确认回料以下 {returnable.length} 项物料：</p>
        <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8, fontSize: 12 }}>
          {returnable.map((item, idx) => (
            <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{item.materialName || item.materialCode} · {item.color || '-'}</span>
              <span style={{ color: 'var(--color-primary)' }}>到货 {item.arrivedQuantity || item.purchaseQuantity}{item.unit || ''}</span>
            </div>
          ))}
        </div>
      </div>
    );
    modal.confirm({
      title: '批量回料确认',
      content: contentEl,
      okText: '确认回料',
      cancelText: '取消',
      width: '40vw',
      onOk: async () => {
        setActionLoading(true);
        try {
          const confirmerId = String(user?.id || '').trim();
          const confirmerName = String(user?.name || user?.username || '').trim();
          const purchaseIds = returnable.map(p => String(p.id || '')).filter(Boolean);
          const res = await api.post<{ code: number; message?: string }>('/production/purchase/batch-return-confirm', {
            purchaseIds,
            confirmerId,
            confirmerName,
          });
          if (res?.code === 200) {
            message.success(`已批量回料确认 ${returnable.length} 项`);
            loadData();
          } else {
            message.error(res?.message || '批量回料确认失败');
          }
        } catch (e) {
          message.error((e as Error)?.message || '批量回料确认失败');
        } finally {
          setActionLoading(false);
        }
      },
    });
  }, [purchases, user, message, modal, loadData, setActionLoading]);

  const handleConfirmComplete = useCallback(async () => {
    const awaiting = purchases.filter(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM);
    if (awaiting.length === 0) {
      message.info('没有待确认完成的物料');
      return;
    }
    setConfirmCompleteLoading(true);
    try {
      for (const record of awaiting) {
        await api.post('/production/purchase/confirm-complete', { purchaseId: record.id });
      }
      message.success(`已确认完成 ${awaiting.length} 项`);
      loadData();
    } catch (e) {
      message.error((e as Error)?.message || '确认完成失败');
    } finally {
      setConfirmCompleteLoading(false);
    }
  }, [purchases, message, loadData, setConfirmCompleteLoading]);

  const handleQualityIssue = useCallback((record: MaterialPurchase) => {
    message.info(`品质异常：${record.materialName || record.materialCode}，请前往物料采购页面处理`);
  }, [message]);

  return {
    handleConfirmReturn,
    doReturnConfirm,
    handleReturnReset,
    handleBatchReturn,
    handleConfirmComplete,
    handleQualityIssue,
  };
};

export default usePurchaseReturnActions;
