import React from 'react';
import { Input } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { User } from '@/types/system';

const { TextArea } = Input;

interface FactoryRejectModalProps {
  open: boolean;
  currentUser: User | null;
  factoryRejectReason: string;
  setFactoryRejectReason: (value: string) => void;
  factoryApproveLoading: boolean;
  onOk: () => void;
  onCancel: () => void;
}

const FactoryRejectModal: React.FC<FactoryRejectModalProps> = ({
  open,
  currentUser,
  factoryRejectReason,
  setFactoryRejectReason,
  factoryApproveLoading,
  onOk,
  onCancel,
}) => {
  return (
    <ResizableModal
      title="拒绝外发工厂员工"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText="确定拒绝"
      cancelText="取消"
      okButtonProps={{ danger: true, type: 'primary' }}
      confirmLoading={factoryApproveLoading}
      width="40vw"
    >
      <div style={{ marginBottom: 16 }}>
        <p>
          确定拒绝外发工厂员工"<strong>{currentUser?.name || currentUser?.username}</strong>"吗？
        </p>
        {Boolean(currentUser?.factoryName) && (
          <p style={{ color: 'var(--color-primary)' }}>所属工厂：{String(currentUser?.factoryName as string)}</p>
        )}
        <p style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>拒绝后该员工将无法登录系统</p>
      </div>
      <TextArea
        id="factoryRejectReason"
        placeholder="请输入拒绝原因（必填）"
        value={factoryRejectReason}
        onChange={(e) => setFactoryRejectReason(e.target.value)}
        rows={4}
        maxLength={200}
        showCount
      />
    </ResizableModal>
  );
};

export default FactoryRejectModal;
