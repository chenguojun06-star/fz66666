import { useState, useCallback } from 'react';
import { App, Input } from 'antd';
import api from '@/utils/api';
import { remarkApi } from '@/services/system/remarkApi';
import { FIELD_LABELS, type EditableField } from '../components/InlineEditableField';

export interface UseEditModeArgs {
  orderNoForImage: string;
  order: any;
  fetchFlow: () => void;
}

export function useEditMode({ orderNoForImage, order, fetchFlow }: UseEditModeArgs) {
  const { message, modal } = App.useApp();

  const [editing, setEditing] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [savingField, setSavingField] = useState<string | null>(null);

  const recordAction = useCallback(async (action: string, reason: string) => {
    const targetNo = orderNoForImage;
    if (!targetNo) return;
    try {
      await remarkApi.add({
        targetType: 'order',
        targetNo,
        authorRole: action,
        content: reason,
      });
    } catch { /* ignore */ }
  }, [orderNoForImage]);

  const showReasonModal = useCallback((title: string, actionLabel: string, onConfirm: (reason: string) => void) => {
    let reasonValue = '';
    modal.confirm({
      title,
      width: 480,
      content: (
        <div style={{ marginTop: 12 }}>
          <p style={{ marginBottom: 8, color: 'var(--color-text-secondary)' }}>请输入{actionLabel}原因（将记录到订单操作记录）：</p>
          <Input.TextArea
            id="action-reason-input"
            rows={3}
            maxLength={500}
            showCount
            placeholder={`请输入${actionLabel}原因...`}
            onChange={(e) => { reasonValue = e.target.value; }}
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
  }, [modal, message]);

  const handleStartEdit = useCallback(() => {
    showReasonModal('进入编辑模式', '编辑', (reason) => {
      setEditReason(reason);
      setEditing(true);
      recordAction('开始编辑', reason);
    });
  }, [showReasonModal, recordAction]);

  const handleFinishEdit = useCallback(async () => {
    await recordAction('完成编辑', `[编辑完成] ${editReason}`);
    setEditing(false);
    setEditReason('');
    fetchFlow();
  }, [recordAction, editReason, fetchFlow]);

  const handleCancelEdit = useCallback(async () => {
    await recordAction('取消编辑', `[取消编辑] ${editReason}`);
    setEditing(false);
    setEditReason('');
  }, [recordAction, editReason]);

  const handleFieldSave = useCallback(async (field: EditableField, value: string) => {
    const orderId = (order as any)?.id;
    if (!orderId) {
      message.error('订单ID不存在');
      return;
    }
    setSavingField(field);
    try {
      const res: any = await api.put('/production/order/update-basic-info', {
        id: orderId,
        field,
        value,
        operationRemark: `修改${FIELD_LABELS[field]}：${(order as any)?.[field] || '-'} → ${value}`,
      });
      if (res?.code === 200) {
        message.success(`${FIELD_LABELS[field]}已更新${res?.data?.syncedCount ? `，已同步${res.data.syncedCount}条下游记录` : ''}`);
        fetchFlow();
      } else {
        message.error(res?.message || '更新失败');
      }
    } catch (e: any) {
      message.error(e?.message || '更新失败');
    } finally {
      setSavingField(null);
    }
  }, [order, message, fetchFlow]);

  return {
    editing,
    editReason,
    savingField,
    handleStartEdit,
    handleFinishEdit,
    handleCancelEdit,
    handleFieldSave,
  };
}
