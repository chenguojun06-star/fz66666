import React from 'react';
import { Input } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { User } from '@/types/system';

const { TextArea } = Input;

interface RejectUserModalProps {
  open: boolean;
  currentUser: User | null;
  rejectReason: string;
  setRejectReason: (value: string) => void;
  rejectSubmitting: boolean;
  onOk: () => void;
  onCancel: () => void;
}

const RejectUserModal: React.FC<RejectUserModalProps> = ({
  open,
  currentUser,
  rejectReason,
  setRejectReason,
  rejectSubmitting,
  onOk,
  onCancel,
}) => {
  return (
    <ResizableModal
      title="拒绝用户"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText="确定拒绝"
      cancelText="取消"
      okButtonProps={{ danger: true, type: 'primary' }}
      confirmLoading={rejectSubmitting}
      width="40vw"
    >
      <div style={{ marginBottom: 16 }}>
        <p>
          确定拒绝用户"<strong>{currentUser?.name || currentUser?.username}</strong>"吗？
        </p>
        <p style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>拒绝后该用户将无法登录系统</p>
      </div>
      <TextArea
        id="rejectReason"
        placeholder="请输入拒绝原因（必填）"
        value={rejectReason}
        onChange={(e) => setRejectReason(e.target.value)}
        rows={4}
        maxLength={200}
        showCount
      />
    </ResizableModal>
  );
};

export default RejectUserModal;
