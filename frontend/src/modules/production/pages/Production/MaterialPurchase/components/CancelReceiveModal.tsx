import React, { useState } from 'react';
import { App } from 'antd';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatMaterialQuantityWithUnit } from '../utils';
import api from '@/utils/api';

interface CancelReceiveModalProps {
  open: boolean;
  target: MaterialPurchaseType | null;
  onCancel: () => void;
  onSuccess?: () => void;
}

/**
 * 撤回采购弹窗。
 * 业务逻辑保持与原 MaterialTable.handleCancelConfirm 一致。
 */
const CancelReceiveModal: React.FC<CancelReceiveModalProps> = ({ open, target, onCancel, onSuccess }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [, setCancelLoading] = useState<string | null>(null);

  const handleOk = async (reason: string) => {
    if (!target) return;
    setLoading(true);
    setCancelLoading(target.id as string);
    try {
      await api.post('/production/purchase/cancel-receive', {
        purchaseId: target.id,
        reason,
      });
      message.success('撤回成功，采购单已恢复为待处理');
      onCancel();
      onSuccess?.();
    } catch {
      // error shown by api interceptor
    } finally {
      setLoading(false);
      setCancelLoading(null);
    }
  };

  return (
    <RejectReasonModal
      open={open}
      title="撤回采购"
      description={target ? (
        <div>
          <p style={{ marginBottom: 8 }}>确定撤回「{target.materialName || target.materialCode}」的采购记录？</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4 }}>领取人：{target.receiverName || '-'}，到货数量：{formatMaterialQuantityWithUnit(target.arrivedQuantity || 0, target.unit)}</p>
        </div>
      ) : null}
      fieldLabel="撤回原因"
      okText="确认撤回"
      placeholder="请填写撤回原因（必填）"
      required
      okDanger
      loading={loading}
      onOk={handleOk}
      onCancel={onCancel}
    />
  );
};

export default CancelReceiveModal;
