import React from 'react';
import { Input } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import { StyleInfo } from '@/types/style';

interface StyleMaintenanceModalProps {
  open: boolean;
  saving: boolean;
  record: StyleInfo | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onOk: () => void;
  onCancel: () => void;
}

/**
 * 款式维护弹窗
 * 用于重置款式完成状态，允许再次修改和提交
 */
const StyleMaintenanceModal: React.FC<StyleMaintenanceModalProps> = ({
  open,
  saving,
  record,
  reason,
  onReasonChange,
  onOk,
  onCancel,
}) => {
  return (
    <SmallModal
      title="款式维护"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={saving}
      okText="确定"
      cancelText="取消"
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, color: 'var(--neutral-text-secondary)' }}>
          维护说明：将重置 <strong>{record?.styleNo}</strong> 的完成状态，允许再次修改和提交
        </div>
        <Input.TextArea
          id="maintenance-reason"
          name="maintenanceReason"
          placeholder="请输入维护原因（必填）"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={4}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </div>
    </SmallModal>
  );
};

export default StyleMaintenanceModal;
