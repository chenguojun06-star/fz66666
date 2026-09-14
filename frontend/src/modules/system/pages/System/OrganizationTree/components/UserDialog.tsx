import React from 'react';
import { Col, DatePicker, Form, Input, Row, Select, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { FormInstance } from 'antd';
import type { User } from '@/types/system';

const { Option } = Select;

interface UserDialogProps {
  open: boolean;
  form: FormInstance<any>;
  editingUser: User | null;
  submitLoading: boolean;
  roleOptions: any[];
  roleOptionsLoading: boolean;
  departmentOptions: { value: string; label: string }[];
  onClose: () => void;
  onOk: () => void;
}

/** 人员新增/编辑弹窗 */
const UserDialog: React.FC<UserDialogProps> = ({
  open, form, editingUser, submitLoading,
  roleOptions, roleOptionsLoading, departmentOptions,
  onClose, onOk,
}) => (
  <ResizableModal
    title={editingUser ? '编辑人员' : '新增人员'}
    open={open}
    onCancel={onClose}
    onOk={onOk}
    okText="保存"
    cancelText="取消"
    width="85vw"
    initialHeight={Math.round(window.innerHeight * 0.7)}
    confirmLoading={submitLoading}
  >
    <Form form={form} layout="vertical" autoComplete="off">
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="请输入用户名" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
        </Col>
        {!editingUser && (
          <Col span={8}>
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码不能少于6位' }]}>
              <Input.Password placeholder="请输入密码" autoComplete="new-password" />
            </Form.Item>
          </Col>
        )}
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="roleId" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select placeholder="请选择角色" loading={roleOptionsLoading}>
              {roleOptions.map((r: any) => (
                <Option key={String(r.id)} value={String(r.id)}>
                  {r.roleName || '系统角色'}
                </Option>
              ))}
            </Select>
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
        <Col span={8}>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select placeholder="请选择状态">
              <Option value="active">启用</Option>
              <Option value="inactive">停用</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="phone" label="手机号" rules={[{ pattern: /^1\d{10}$/, message: '手机号格式不正确' }]}>
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
            </Select>
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="orgUnitId" label="所属部门">
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="选择部门"
              options={departmentOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="permissionRange" label="数据权限">
            <Select placeholder="请选择数据权限范围">
              <Option value="all"><Tag color="blue" style={{ marginRight: 4 }}>全部</Tag>查看全厂数据</Option>
              <Option value="team"><Tag color="green" style={{ marginRight: 4 }}>团队</Tag>查看团队数据</Option>
              <Option value="own"><Tag color="orange" style={{ marginRight: 4 }}>个人</Tag>仅查看自己数据</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="请输入邮箱" />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  </ResizableModal>
);

export default UserDialog;
