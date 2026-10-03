import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Form, Input, Popconfirm, Space, Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import customerUserApi, { type CustomerUserItem } from '@/services/crm/customerUserApi';
import { formatDateTime } from '@/utils/datetime';

/** 客户门户登录地址（H5，客户凭账号直接登录，无需装小程序/加微信） */
const PORTAL_LOGIN_URL = 'https://h5.webyszl.cn/crm-client/login';

interface Props {
  open: boolean;
  customerId: string;
  customerName: string;
  onClose: () => void;
}

/**
 * 客户门户账号管理（D-732）
 *
 * 客户凭账号登录 H5 客户门户，查看自己的订单进度 / 发货记录 / 应收账款。
 * 与供应商账号管理（`SupplierUserManager`）同构，额外提供**一键复制邀请信息**——
 * 开户后的关键动作就是"把账号发给客户"，复制比手抄可靠得多。
 */
const CustomerUserManager: React.FC<Props> = ({ open, customerId, customerName, onClose }) => {
  const { message, modal } = App.useApp();
  const [users, setUsers] = useState<CustomerUserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [createLoading, setCreateLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!customerId) return;
    try {
      setLoading(true);
      const res = await customerUserApi.list(customerId);
      setUsers(res?.data || []);
    } catch (err: any) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [customerId, message]);

  useEffect(() => {
    if (open) loadUsers();
  }, [open, loadUsers]);

  /** 复制邀请信息：客户收到这条消息即可直接登录 */
  const copyInvite = async (username: string, password: string) => {
    const text = [
      `【${customerName}】订单进度查询账号`,
      `登录地址：${PORTAL_LOGIN_URL}`,
      `账号：${username}`,
      `密码：${password}`,
      '（登录后可查看您的订单生产进度、发货记录与应收账款）',
    ].join('\n');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      message.success('邀请信息已复制，可直接粘贴发给客户');
    } catch {
      message.warning('复制失败，请手动选中复制');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateLoading(true);
      const res = await customerUserApi.create({
        customerId,
        username: values.username,
        password: values.password,
        contactPerson: values.contactPerson,
        contactPhone: values.contactPhone,
        contactEmail: values.contactEmail,
      });
      const data = res?.data;
      const pwd = data?.initialPassword || values.password;
      setCreateOpen(false);
      createForm.resetFields();
      loadUsers();
      if (data?.username) {
        modal.success({
          title: '开户成功',
          width: 520,
          content: (
            <div>
              <p>请把以下登录信息发给客户（点击下方按钮一键复制）：</p>
              <p><strong>登录地址：</strong>{PORTAL_LOGIN_URL}</p>
              <p><strong>账号：</strong>{data.username}</p>
              <p><strong>密码：</strong><span className="u-fw-700">{pwd}</span></p>
              <Space className="u-mt-8">
                <Button type="primary" onClick={() => copyInvite(data.username, pwd)}>复制邀请信息</Button>
              </Space>
            </div>
          ),
        });
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '开户失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async (user: CustomerUserItem) => {
    modal.confirm({
      title: '重置密码',
      content: `确定要重置账号 "${user.username}" 的密码吗？`,
      onOk: async () => {
        try {
          const newPwd = '123456';
          const res = await customerUserApi.resetPassword(user.id, newPwd);
          const pwd = res?.data?.newPassword || newPwd;
          modal.success({
            title: '密码已重置',
            width: 520,
            content: (
              <div>
                <p>账号 <strong>{user.username}</strong> 的新密码：</p>
                <p className="u-fw-700" style={{ fontSize: 18, color: 'var(--color-info)' }}>{pwd}</p>
                <Space>
                  <Button type="primary" onClick={() => copyInvite(user.username, pwd)}>复制邀请信息</Button>
                </Space>
              </div>
            ),
          });
        } catch (err: any) {
          message.error(err?.message || '重置失败');
        }
      },
    });
  };

  const handleToggleStatus = async (user: CustomerUserItem) => {
    const willBe = user.status === 'ACTIVE' ? '停用' : '启用';
    try {
      await customerUserApi.toggleStatus(user.id);
      message.success(`已${willBe}账号 ${user.username}`);
      loadUsers();
    } catch (err: any) {
      message.error(err?.message || '操作失败');
    }
  };

  const handleDelete = async (user: CustomerUserItem) => {
    try {
      await customerUserApi.delete(user.id);
      message.success(`已删除账号 ${user.username}`);
      loadUsers();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  const columns = [
    { title: '账号', dataIndex: 'username', key: 'username', width: 160 },
    { title: '联系人', dataIndex: 'contactPerson', key: 'contactPerson', width: 120, render: (v: string) => v || '-' },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', width: 140, render: (v: string) => v || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) => (v === 'ACTIVE' ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>),
    },
    {
      title: '最后登录',
      dataIndex: 'lastLoginTime',
      key: 'lastLoginTime',
      width: 170,
      render: (v: string) => (v ? formatDateTime(v) : '从未登录'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_: any, record: CustomerUserItem) => (
        <Space size={4}>
          <Button onClick={() => handleResetPassword(record)}>重置密码</Button>
          <Button onClick={() => handleToggleStatus(record)}>
            {record.status === 'ACTIVE' ? '停用' : '启用'}
          </Button>
          <Popconfirm title={`确定删除账号 ${record.username}？`} onConfirm={() => handleDelete(record)}>
            <Button danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <ResizableModal
        open={open}
        title={`客户门户账号 - ${customerName}`}
        onCancel={onClose}
        footer={null}
        width="85vw"
        destroyOnHidden
      >
        <div className="u-mb-16 u-d-flex u-jc-between u-ai-center">
          <span style={{ color: 'var(--color-text-muted)' }}>
            客户用该账号登录 {PORTAL_LOGIN_URL}，查看订单进度、发货记录与应收账款（无需装小程序）
          </span>
          <Button type="primary" onClick={() => setCreateOpen(true)}>开户</Button>
        </div>
        <ResizableTable
          storageKey="customer-user-table"
          rowKey="id"
          columns={columns as any}
          dataSource={users}
          loading={loading}
          emptyDescription="该客户还没有门户账号，点右上角「开户」创建"
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </ResizableModal>

      <ResizableModal
        open={createOpen}
        title={`开户 - ${customerName}`}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={handleCreate}
        okText="创建账号"
        confirmLoading={createLoading}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="username"
            label="登录账号"
            rules={[
              { required: true, message: '请输入登录账号' },
              { min: 3, max: 50, message: '账号需3-50位' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: '仅支持字母、数字、下划线、中划线' },
            ]}
          >
            <Input placeholder="如：kehu_001" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: '请输入初始密码' },
              { min: 6, max: 20, message: '密码需6-20位' },
            ]}
          >
            <Input.Password placeholder="6-20位密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="contactPerson" label="联系人">
            <Input placeholder="客户联系人姓名" />
          </Form.Item>
          <Form.Item name="contactPhone" label="联系电话">
            <Input placeholder="客户联系电话" />
          </Form.Item>
          <Form.Item name="contactEmail" label="邮箱（选填）">
            <Input placeholder="用于后续找回密码" />
          </Form.Item>
        </Form>
      </ResizableModal>
    </>
  );
};

export default CustomerUserManager;
