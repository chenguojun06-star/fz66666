import { useCallback, useEffect, useState } from 'react';
import { App, Input } from 'antd';
import { remarkApi, type OrderRemark } from '@/services/system/remarkApi';

export interface UseRemarksArgs {
  orderNo: string;
}

/**
 * 订单操作记录（remarks）状态与操作的统一 Hook。
 *
 * 抽自原 FlowStepRenderer.tsx：
 * - remarks / remarksLoading / newRemark 状态
 * - fetchRemarks / handleAddRemark / recordAction
 * - showReasonModal（含 TextArea JSX，故为 .tsx）
 */
export function useRemarks({ orderNo }: UseRemarksArgs) {
  const { message, modal } = App.useApp();
  const [remarks, setRemarks] = useState<OrderRemark[]>([]);
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [newRemark, setNewRemark] = useState('');

  const fetchRemarks = useCallback(async () => {
    if (!orderNo) return;
    setRemarksLoading(true);
    try {
      const res = await remarkApi.list({ targetType: 'order', targetNo: orderNo });
      const list = (res as any)?.data || res || [];
      setRemarks(Array.isArray(list) ? list : []);
    } catch {
      setRemarks([]);
    } finally {
      setRemarksLoading(false);
    }
  }, [orderNo]);

  useEffect(() => {
    fetchRemarks();
  }, [fetchRemarks]);

  const recordAction = useCallback(
    async (action: string, reason: string) => {
      if (!orderNo) return;
      try {
        await remarkApi.add({
          targetType: 'order',
          targetNo: orderNo,
          authorRole: action,
          content: reason,
        });
        fetchRemarks();
      } catch {
        /* ignore */
      }
    },
    [orderNo, fetchRemarks],
  );

  const showReasonModal = useCallback(
    (title: string, actionLabel: string, onConfirm: (reason: string) => void) => {
      let reasonValue = '';
      modal.confirm({
        title,
        width: '40vw',
        content: (
          <div style={{ marginTop: 12 }}>
            <p style={{ marginBottom: 8, color: 'var(--color-text-secondary)' }}>
              请输入{actionLabel}原因（将记录到订单操作记录）：
            </p>
            <Input.TextArea
              id="action-reason-input"
              rows={3}
              maxLength={500}
              showCount
              placeholder={`请输入${actionLabel}原因...`}
              onChange={(e) => {
                reasonValue = e.target.value;
              }}
            />
          </div>
        ),
        okText: '确认',
        cancelText: '取消',
        onOk: () => {
          const reason = reasonValue?.trim();
          if (!reason) {
            message.warning('请输入操作原因');
            return Promise.reject();
          }
          onConfirm(reason);
        },
      });
    },
    [modal, message],
  );

  const handleAddRemark = useCallback(async () => {
    const content = newRemark.trim();
    if (!content) {
      message.warning('请输入备注内容');
      return;
    }
    try {
      await remarkApi.add({ targetType: 'order', targetNo: orderNo, content });
      setNewRemark('');
      fetchRemarks();
      message.success('备注已添加');
    } catch {
      message.error('添加备注失败');
    }
  }, [newRemark, orderNo, fetchRemarks, message]);

  return {
    remarks,
    remarksLoading,
    newRemark,
    setNewRemark,
    remarkCount: remarks.length,
    fetchRemarks,
    recordAction,
    handleAddRemark,
    showReasonModal,
  };
}
