import React from 'react';
import { Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { User } from '@/types/system';

interface FactoryApproveModalProps {
  open: boolean;
  currentUser: User | null;
  factorySelectedRole: string;
  setFactorySelectedRole: (value: string) => void;
  roleOptions: any[];
  roleLoading: boolean;
  factoryApproveLoading: boolean;
  onOk: () => void;
  onCancel: () => void;
}

const FactoryApproveModal: React.FC<FactoryApproveModalProps> = ({
  open,
  currentUser,
  factorySelectedRole,
  setFactorySelectedRole,
  roleOptions,
  roleLoading,
  factoryApproveLoading,
  onOk,
  onCancel,
}) => {
  return (
    <ResizableModal
      title="批准外发工厂员工"
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText="批准并分配角色"
      cancelText="取消"
      confirmLoading={factoryApproveLoading}
      width="40vw"
    >
      <div style={{ marginBottom: 16 }}>
        <p>
          批准外发工厂员工"<strong>{currentUser?.name || currentUser?.username}</strong>"
        </p>
        {Boolean(currentUser?.factoryName) && (
          <p style={{ color: 'var(--color-primary)' }}>所属工厂：{String(currentUser?.factoryName as string)}</p>
        )}
        <p style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)", marginBottom: 16 }}>
          批准后该员工可以正常登录系统
        </p>
        <div>
          <div style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            选择角色<span style={{ color: 'var(--color-danger)' }}>*</span>
          </div>
          <Select
            style={{ width: '100%' }}
            placeholder="请选择角色"
            value={factorySelectedRole}
            onChange={setFactorySelectedRole}
            loading={roleLoading}
            options={roleOptions.map(role => ({
              label: role.roleName || role.name,
              value: String(role.id)
            }))}
          />
        </div>
      </div>
    </ResizableModal>
  );
};

export default FactoryApproveModal;
