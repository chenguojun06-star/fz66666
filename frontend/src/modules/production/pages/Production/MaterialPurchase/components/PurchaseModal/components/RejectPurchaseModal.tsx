import React from 'react';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatMaterialQuantityWithUnit } from '../../../utils';

interface RejectPurchaseModalProps {
  open: boolean;
  target: MaterialPurchaseType | null;
  loading: boolean;
  onOk: (reason: string) => void;
  onCancel: () => void;
}

// 撤回采购弹窗（基于 RejectReasonModal）
const RejectPurchaseModal: React.FC<RejectPurchaseModalProps> = ({
  open,
  target,
  loading,
  onOk,
  onCancel,
}) => {
  return (
    <RejectReasonModal
      open={open}
      title="撤回采购"
      description={target ? (
        <div>
          <p style={{ marginBottom: 8 }}>确定撤回「{target.materialName || target.materialCode}」的采购记录？</p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginBottom: 4 }}>
            领取人：{target.receiverName || '-'}，
            到货数量：{formatMaterialQuantityWithUnit(target.arrivedQuantity || 0, target.unit)}
          </p>
        </div>
      ) : null}
      fieldLabel="撤回原因"
      okText="确认撤回"
      placeholder="请填写撤回原因（必填）"
      required
      okDanger
      loading={loading}
      onOk={onOk}
      onCancel={onCancel}
    />
  );
};

export default RejectPurchaseModal;
