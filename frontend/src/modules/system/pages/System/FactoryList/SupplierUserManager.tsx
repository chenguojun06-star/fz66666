import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Form, Input, Modal, Popconfirm, Space, Table, Tag } from 'antd';
import type { SupplierUserItem } from '@/services/system/supplierUserApi';
import supplierUserApi from '@/services/system/supplierUserApi';
import { formatDateTime } from '@/utils/datetime';

interface Props {
  open: boolean;
  supplierId: string;
  supplierName: string;
  onClose: () => void;
}

const SupplierUserManager: React.FC<Props> = ({ open, supplierId, supplierName, onClose }) => {
  const { message, modal } = App.useApp();
  const [users, setUsers] = useState<SupplierUserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [createLoading, setCreateLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!supplierId) return;
    try {
      setLoading(true);
      const res = await supplierUserApi.list(supplierId);
      setUsers(res?.data || []);
    } catch (err: any) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [supplierId, message]);

  useEffect(() => {
    if (open) loadUsers();
  }, [open, loadUsers]);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateLoading(true);
      const res = await supplierUserApi.create({
        supplierId,
        username: values.username,
        password: values.password,
        contactPerson: values.contactPerson,
        contactPhone: values.contactPhone,
      });
      const data = res?.data;
      if (data?.initialPassword || data?.username) {
        modal.success({
          title: '账号创建成功',
          content: (
            <div>
              <p>请将以下登录信息发送给供应商：</p>
              <p><strong>用户名：</strong>{data.username}</p>
              <p><strong>初始密码：</strong>{data.initialPassword || values.password}</p>
              <p><strong>登录地址：</strong>H5页面 → 供应商登录</p>
            </div>
          ),
        });
      }
      setCreateOpen(false);
      createForm.resetFields();
      loadUsers();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '创建失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async (user: SupplierUserItem) => {
    modal.confirm({
      title: '重置密码',
      content: `确定要重置用户 "${user.username}" 的密码吗？`,
      onOk: async () => {
        try {
          const newPwd = '123456';
          const res = await supplierUserApi.resetPassword(user.id, newPwd);
          const data = res?.data;
          modal.success({
            title: '密码已重置',
            content: (
              <div>
                <p>用户 <strong>{user.username}</strong> 的新密码：</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{data?.newPassword || newPwd}</p>
                <p style={{ color: '#999' }}>请及时通知供应商</p>
              </div>
            ),
          });
        } catch (err: any) {
          message.error(err?.message || '重置失败');
        }
      },
    });
  };

  const handleToggleStatus = async (user: SupplierUserItem) => {
    const willBe = user.status === 'ACTIVE' ? '禁用' : '启用';
    try {
      await supplierUserApi.toggleStatus(user.id);
      message.success(`已${willBe}用户 ${user.username}`);
      loadUsers();
    } catch (err: any) {
      message.error(err?.message || '操作失败');
    }
  };

  const handleDelete = async (user: SupplierUserItem) => {
    try {
      await supplierUserApi.delete(user.id);
      message.success(`已删除用户 ${user.username}`);
      loadUsers();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 160 },
    { title: '联系人', dataIndex: 'contactPerson', key: 'contactPerson', width: 120, render: (v: string) => v || '-' },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', width: 140, render: (v: string) => v || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) => v === 'ACTIVE' ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>,
    },
    {
      title: '最后登录',
      dataIndex: 'lastLoginTime',
      key: 'lastLoginTime',
      width: 170,
      render: (v: string) => v ? formatDateTime(v) : '从未登录',
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 170,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_: any, record: SupplierUserItem) => (
        <Space size={4}>
          <Button size="small" onClick={() => handleResetPassword(record)}>重置密码</Button>
          <Button size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 'ACTIVE' ? '禁用' : '启用'}
          </Button>
          <Popconfirm title={`确定删除用户 ${record.username}？`} onConfirm={() => handleDelete(record)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        open={open}
        title={`供应商账号管理 - ${supplierName}`}
        onCancel={onClose}
        footer={null}
        width={900}
        destroyOnHidden
      >
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#888' }}>供应商通过 H5 页面「供应商登录」入口登录，账号由管理员创建和管理</span>
          <Button type="primary" onClick={() => setCreateOpen(true)}>新增账号</Button>
        </div>
        <Table
          rowKey="id"
          columns={columns as any}
          dataSource={users}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
        />
      </Modal>

      <Modal
        open={createOpen}
        title="新增供应商账号"
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={handleCreate}
        okText="创建"
        confirmLoading={createLoading}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[
            { required: true, message: '请输入用户名' },
            { min: 3, max: 50, message: '用户名需3-50位' },
          ]}>
            <Input placeholder="如：supplier_F001" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[
            { required: true, message: '请输入密码' },
            { min: 6, max: 20, message: '密码需6-20位' },
          ]}>
            <Input.Password placeholder="6-20位密码" />
          </Form.Item>
          <Form.Item name="contactPerson" label="联系人">
            <Input placeholder="供应商联系人姓名" />
          </Form.Item>
          <Form.Item name="contactPhone" label="联系电话">
            <Input placeholder="供应商联系电话" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default SupplierUserManager;
