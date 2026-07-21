import React from 'react';
import { Col, DatePicker, Form, Input, Row, Select, Tag } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { Role, User as UserType } from '@/types/system';
import type { useModal } from '@/hooks';
import { buildFormRules } from '../userListUtils';

const { Option } = Select;

interface UserFormModalProps {
  userModal: ReturnType<typeof useModal<UserType>>;
  form: FormInstance;
  formRules: ReturnType<typeof buildFormRules>;
  roleOptions: Role[];
  roleOptionsLoading: boolean;
  submitLoading: boolean;
  modalWidth: number | string;
  modalInitialHeight: number;
  isMobile: boolean;
  onCancel: () => void;
  onOk: () => void;
}

const UserFormModal: React.FC<UserFormModalProps> = ({
  userModal,
  form,
  formRules,
  roleOptions,
  roleOptionsLoading,
  submitLoading,
  modalWidth,
  modalInitialHeight,
  isMobile,
  onCancel,
  onOk,
}) => {
  return (
    <ResizableModal
      title={userModal.data ? '编辑人员' : '新增人员'}
      open={userModal.visible}
      onCancel={onCancel}
      onOk={onOk}
      okText="保存"
      cancelText="取消"
      width={modalWidth}
      initialHeight={modalInitialHeight}
      minWidth={isMobile ? 320 : 520}
      scaleWithViewport
      confirmLoading={submitLoading}
    >
      <Form form={form} layout="vertical" autoComplete="off">
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="username" label="用户名" rules={formRules.username}>
              <Input placeholder="请输入用户名" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="name" label="姓名" rules={formRules.name}>
              <Input placeholder="请输入姓名" autoComplete="name" />
            </Form.Item>
          </Col>
          {!userModal.data && (
            <Col span={8}>
              <Form.Item name="password" label="密码" rules={formRules.password}>
                <Input.Password placeholder="请输入密码" autoComplete="new-password" />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Row gutter={16} className="mt-sm">
          <Col span={8}>
            <Form.Item name="roleId" label="角色" rules={formRules.roleId}>
              <Select placeholder="请选择角色" loading={roleOptionsLoading}>
                {roleOptions.map((r) => (
                  <Option key={String(r.id)} value={String(r.id)}>
                    {r.roleName || '系统角色'}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="position" label="职位">
              <Input placeholder="如：缝纫一组组长、车间主任" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="gender" label="性别">
              <Select placeholder="请选择性别" allowClear>
                <Option value="male">男</Option>
                <Option value="female">女</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16} className="mt-sm">
          <Col span={8}>
            <Form.Item name="phone" label="手机号" rules={formRules.phone}>
              <Input placeholder="请输入手机号" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="hireDate" label="入职日期">
              <DatePicker style={{ width: '100%' }} placeholder="请选择入职日期" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="employmentStatus" label="在职状态">
              <Select placeholder="请选择在职状态" allowClear>
                <Option value="normal">正式</Option>
                <Option value="probation">试用期</Option>
                <Option value="temporary">临时工</Option>
                <Option value="transferred">调岗</Option>
                <Option value="resigned">离职</Option>
                <Option value="archived">已归档</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16} className="mt-sm">
          <Col span={8}>
            <Form.Item name="permissionRange" label="数据权限" rules={formRules.permissionRange}>
              <Select placeholder="请选择数据权限范围">
                <Option value="all"><Tag color="blue" style={{ marginRight: 4 }}>全部</Tag>查看全厂数据</Option>
                <Option value="team"><Tag color="green" style={{ marginRight: 4 }}>团队</Tag>查看团队数据</Option>
                <Option value="own"><Tag color="orange" style={{ marginRight: 4 }}>个人</Tag>仅查看自己数据</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="status" label="状态" rules={formRules.status}>
              <Select placeholder="请选择状态">
                <Option value="active">启用</Option>
                <Option value="inactive">停用</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="email" label="邮箱" rules={formRules.email}>
              <Input placeholder="请输入邮箱" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </ResizableModal>
  );
};

export default UserFormModal;
