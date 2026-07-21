import React from 'react';
import { Input } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';

interface Props {
  open: boolean;
  remark: string;
  submitting: boolean;
  onRemarkChange: (v: string) => void;
  onOk: () => void;
  onCancel: () => void;
}

/**
 * 报价单解锁弹窗：管理员填写解锁备注后提交
 */
const UnlockQuotationModal: React.FC<Props> = ({
  open,
  remark,
  submitting,
  onRemarkChange,
  onOk,
  onCancel,
}) => {
  return (
    <ResizableModal
      title="解锁报价单"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText="确认解锁"
      cancelText="取消"
      confirmLoading={submitting}
    >
      <div style={{ marginBottom: 8 }}>解锁原因/备注（必填）：</div>
      <Input.TextArea
        id="unlockRemark"
        value={remark}
        onChange={(e) => onRemarkChange(e.target.value)}
        rows={3}
        placeholder="请填写解锁原因..."
      />
    </ResizableModal>
  );
};

export default UnlockQuotationModal;
