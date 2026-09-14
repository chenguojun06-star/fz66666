import React from 'react';
import { Input, Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { User } from '@/types/system';

const { TextArea } = Input;

interface ApproveUserModalProps {
  open: boolean;
  currentUser: User | null;
  selectedRoleId: string;
  setSelectedRoleId: (value: string) => void;
  approveReason: string;
  setApproveReason: (value: string) => void;
  roleOptions: any[];
  roleLoading: boolean;
  approveSubmitting: boolean;
  onOk: () => void;
  onCancel: () => void;
}

const ApproveUserModal: React.FC<ApproveUserModalProps> = ({
  open,
  currentUser,
  selectedRoleId,
  setSelectedRoleId,
  approveReason,
  setApproveReason,
  roleOptions,
  roleLoading,
  approveSubmitting,
  onOk,
  onCancel,
}) => {
  return (
    <ResizableModal
      title="批准用户"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText="批准并分配角色"
      cancelText="取消"
      width="40vw"
      confirmLoading={approveSubmitting}
    >
      <div className="u-mb-16">
        <p>
          批准用户"<strong>{currentUser?.name || currentUser?.username}</strong>"
        </p>
        <p className="u-fs-var--font-size-xs u-mb-16" style={{ color: 'var(--neutral-text-disabled)' }}>
          批准后该用户可以正常登录系统
        </p>
        <div>
          <div className="u-d-block u-mb-8 u-fw-500">
            选择角色<span style={{ color: 'var(--color-danger)' }}>*</span>
          </div>
          <Select
            className="u-w-full"
            placeholder="请选择角色"
            value={selectedRoleId}
            onChange={setSelectedRoleId}
            loading={roleLoading}
            options={roleOptions.map(role => ({
              label: role.roleName || role.name,
              value: String(role.id)
            }))}
          />
          <div className="u-d-block u-fw-500" style={{ margin: '16px 0 8px' }}>
            批准原因<span style={{ color: 'var(--color-danger)' }}>*</span>
          </div>
          <TextArea
            rows={3}
            maxLength={200}
            showCount
            value={approveReason}
            onChange={(e) => setApproveReason(e.target.value)}
            placeholder="请输入批准原因"
          />
        </div>
      </div>
    </ResizableModal>
  );
};

export default ApproveUserModal;
