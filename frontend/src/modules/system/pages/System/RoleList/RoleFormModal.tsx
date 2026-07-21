import React from 'react';
import { Form, Input, Select } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { useViewport } from '@/utils/useViewport';

interface RoleFormModalProps {
  open: boolean;
  isEdit: boolean;
  form: FormInstance<any>;
  onCancel: () => void;
  onOk: () => void;
}

/**
 * 角色新增/编辑表单弹窗
 */
const RoleFormModal: React.FC<RoleFormModalProps> = ({
  open,
  isEdit,
  form,
  onCancel,
  onOk,
}) => {
  const { isMobile, modalWidth } = useViewport();

  return (
    <ResizableModal
      open={open}
      title={isEdit ? '编辑角色' : '新增角色'}
      onCancel={onCancel}
      onOk={onOk}
      okText="保存"
      cancelText="取消"
      width={modalWidth}
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.5 : 500}
      minWidth={isMobile ? 320 : 520}
      scaleWithViewport
    >
      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="roleName" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input placeholder="请输入角色名称" />
          </Form.Item>
          <Form.Item name="roleCode" label="角色编码" rules={[{ required: true, message: '请输入角色编码' }]}>
            <Input placeholder="如：MANAGER" disabled={isEdit} />
          </Form.Item>
        </div>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={3} placeholder="请输入描述" />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={[{ value: 'active', label: '启用' }, { value: 'inactive', label: '停用' }]} />
          </Form.Item>
          <Form.Item name="dataScope" label="数据权限范围" rules={[{ required: true, message: '请选择数据权限范围' }]}>
            <Select options={[{ value: 'all', label: '全部数据' }, { value: 'team', label: '团队数据' }, { value: 'own', label: '个人数据' }]} />
          </Form.Item>
        </div>
      </Form>
    </ResizableModal>
  );
};

export default RoleFormModal;
