import React, { useCallback } from 'react';
import { Form, Input, InputNumber } from 'antd';
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
    setConfirmCompleteLoading,
  } = params;

  const [batchForm] = Form.useForm<{ items?: Array<{ purchaseId?: string; returnQuantity?: number }> }>();

  const handleConfirmReturn = useCallback((record: MaterialPurchase) => {
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
    const confirmerId = String(user?.id || '').trim();
    const confirmerName = String(user?.name || user?.username || '').trim();
    // 打开弹窗前预填每项默认回料数 = 已到货数（与列表页批量回料口径一致）
    batchForm.setFieldsValue({
      items: returnable.map((item) => ({
        purchaseId: String(item.id || ''),
        returnQuantity: Number(item.arrivedQuantity || item.purchaseQuantity || 0),
      })),
    });
    const contentEl = (
      <div>
        <p style={{ marginTop: 0 }}>确认回料以下 {returnable.length} 项物料，请填写每项实际回料数量：</p>
        <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 4 }}>
          <Form form={batchForm} layout="vertical" preserve={false}>
            {returnable.map((item, idx) => (
              <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.materialName || item.materialCode} {item.color ? `· ${item.color}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    采购 {Number(item.purchaseQuantity || 0)}{item.unit || ''} · 到货 {Number(item.arrivedQuantity || 0)}{item.unit || ''}
                  </div>
                </div>
                <Form.Item name={['items', idx, 'purchaseId']} hidden style={{ margin: 0 }}>
                  <Input />
                </Form.Item>
                <Form.Item
                  name={['items', idx, 'returnQuantity']}
                  style={{ margin: 0 }}
                  rules={[
                    { required: true, message: '请输入实际回料数量' },
                    {
                      validator: async (_, v) => {
                        const n = Number(v);
                        if (!Number.isFinite(n)) throw new Error('请输入数字');
                        if (n < 0) throw new Error('不能小于0');
                      },
                    },
                  ]}
                >
                  <InputNumber min={0} precision={2} step={0.01} style={{ width: 130 }} addonAfter={item.unit || undefined} />
                </Form.Item>
              </div>
            ))}
          </Form>
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
        try {
          const values = await batchForm.validateFields();
          const items = (values.items || [])
            .map(it => ({ purchaseId: String(it?.purchaseId || '').trim(), returnQuantity: Number(it?.returnQuantity) }))
            .filter(it => it.purchaseId);
          if (!items.length) { message.error('没有可回料确认的采购任务'); return false; }
          // 与列表页批量回料同结构：items[{purchaseId, returnQuantity}] 走 batch-return-confirm
          const res = await api.post<{ code: number; message?: string; data?: { successCount?: number; failCount?: number; errors?: string[] } }>('/production/purchase/batch-return-confirm', {
            items,
            confirmerId,
            confirmerName,
          });
          const data = res?.data;
          const successCount = Number(data?.successCount ?? items.length);
          const failCount = Number(data?.failCount ?? 0);
          if (res?.code === 200) {
            if (failCount > 0) {
              const errText = data?.errors?.[0] || '部分失败';
              message.warning(`批量回料确认成功 ${successCount} 项，失败 ${failCount} 项：${errText}`);
            } else {
              message.success(`已批量回料确认 ${successCount} 项`);
            }
            loadData();
            return true;
          }
          message.error(res?.message || '批量回料确认失败');
          return false;
        } catch (e) {
          if (e && typeof e === 'object' && 'errorFields' in e) return false; // 校验未通过：保持弹窗
          message.error((e as Error)?.message || '批量回料确认失败');
          return false;
        }
      },
    });
  }, [purchases, user, message, modal, loadData, batchForm]);

  const handleConfirmComplete = useCallback(async () => {
    const awaiting = purchases.filter(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM);
    if (awaiting.length === 0) {
      message.info('没有待确认完成的物料');
      return;
    }
    setConfirmCompleteLoading(true);
    let successCount = 0;
    const failMessages: string[] = [];
    try {
      // 逐项容错：单项失败不中断后续物料（避免一断全断），后端已对"已完成"做幂等返回成功
      for (const record of awaiting) {
        const label = record.materialName || record.materialCode || String(record.id || '');
        try {
          const res = await api.post<{ code: number; message?: string }>('/production/purchase/confirm-complete', { purchaseId: record.id });
          if (res?.code === 200) {
            successCount++;
          } else {
            failMessages.push(`${label}: ${res?.message || '确认失败'}`);
          }
        } catch (e) {
          failMessages.push(`${label}: ${(e as Error)?.message || '确认失败'}`);
        }
      }
      if (failMessages.length === 0) {
        message.success(`已确认完成 ${successCount} 项`);
      } else if (successCount === 0) {
        message.error(`确认完成失败：${failMessages[0]}${failMessages.length > 1 ? ` 等 ${failMessages.length} 项` : ''}`);
      } else {
        message.warning(`已确认 ${successCount} 项，失败 ${failMessages.length} 项：${failMessages[0]}${failMessages.length > 1 ? ' 等' : ''}`);
      }
      // 无论成败都刷新，让已完成项实时反映到列表
      await loadData();
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
