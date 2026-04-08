import React, { useCallback, useEffect, useState } from 'react';
import { App, Avatar, Badge, Button, Collapse, Form, Input, Popconfirm, Space, Tabs, Tag, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import { LockOutlined, PlusOutlined, QuestionCircleOutlined, UserOutlined } from '@ant-design/icons';

const { Text } = Typography;
import { useAuth } from '../../utils/AuthContext';
import api from '../../utils/api';
import tenantService from '../../services/tenantService';

interface FactoryPersonalCenterModalProps {
  open: boolean;
  onClose: () => void;
}

const statusMap: Record<string, { text: string; color: string }> = {
  active: { text: '启用', color: 'green' },
  inactive: { text: '停用', color: 'default' },
};

const FactoryPersonalCenterModal: React.FC<FactoryPersonalCenterModalProps> = ({ open, onClose }) => {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [addLoading, setAddLoading] = useState(false);
  const [changePasswordForm] = Form.useForm();
  const [pwdLoading, setPwdLoading] = useState(false);

  const factoryId = (user as any)?.factoryId;

  const loadMembers = useCallback(async () => {
    if (!factoryId) return;
    setMembersLoading(true);
    try {
      const res = await api.get('/system/user/list', {
        params: { factoryId, page: 1, pageSize: 100 },
      }) as any;
      if (res.code === 200) {
        setMembers(res.data?.records || []);
      } else {
        message.error(res.message || '加载成员失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载成员失败');
    } finally {
      setMembersLoading(false);
    }
  }, [factoryId]);

  useEffect(() => {
    if (open) loadMembers();
  }, [open, loadMembers]);

  const handleToggleStatus = async (record: any) => {
    const newStatus = record.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await api.put('/system/user/status', null, {
        params: { id: String(record.id), status: newStatus },
      }) as any;
      if (res.code === 200) {
        message.success('状态更新成功');
        setMembers(prev => prev.map(m => m.id === record.id ? { ...m, status: newStatus } : m));
      } else {
        message.error(res.message || '操作失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleDelete = async (record: any) => {
    try {
      const res = await tenantService.deleteSubAccount(Number(record.id)) as any;
      if (res.code === 200) {
        message.success('删除成功');
        setMembers(prev => prev.filter(m => m.id !== record.id));
      } else {
        message.error(res.message || '删除失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleAdd = async () => {
    try {
      const values = await addForm.validateFields();
      setAddLoading(true);
      const res = await tenantService.addSubAccount({ ...values, factoryId, status: 'active' }) as any;
      if (res.code === 200) {
        message.success('新增成功');
        addForm.resetFields();
        setAddModalOpen(false);
        loadMembers();
      } else {
        message.error(res.message || '新增失败');
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error(e instanceof Error ? e.message : '新增失败');
    } finally {
      setAddLoading(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await changePasswordForm.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        message.error('两次输入的新密码不一致');
        return;
      }
      setPwdLoading(true);
      const res = await api.post('/system/user/me/change-password', {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      }) as any;
      if (res.code === 200) {
        message.success('密码修改成功');
        changePasswordForm.resetFields();
      } else {
        message.error(res.message || '密码修改失败');
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error(e instanceof Error ? e.message : '密码修改失败');
    } finally {
      setPwdLoading(false);
    }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '账号', dataIndex: 'username', key: 'username', ellipsis: true },
    { title: '手机号', dataIndex: 'phone', key: 'phone', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text ?? s}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: unknown, record: any) => (
        <Space>
          <Button size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 'active' ? '停用' : '启用'}
          </Button>
          <Popconfirm
            title="确认删除该成员？"
            onConfirm={() => handleDelete(record)}
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
          >
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const userDisplayName = String(user?.name || user?.username || '').trim();
  const userInitial = userDisplayName.slice(0, 1).toUpperCase();

  const tutorialItems = [
    {
      key: '1',
      label: ' 查看我的订单',
      children: <Text type="secondary">左侧菜单 → 生产管理 → 我的订单。可按状态、款号、时间筛选，查看分配给本工厂的全部生产订单。点击订单行可查看详情与进度。</Text>,
    },
    {
      key: '2',
      label: ' 查看工序跟进',
      children: <Text type="secondary">左侧菜单 → 生产管理 → 工序跟进。查看每个工序的进度球，点击进度球可查看扫码明细与工人产量。</Text>,
    },
    {
      key: '3',
      label: ' 裁剪管理',
      children: <Text type="secondary">左侧菜单 → 生产管理 → 裁剪管理。查看裁剪任务和菲号（捆包）信息，了解每个尺码颜色的裁剪数量。</Text>,
    },
    {
      key: '4',
      label: ' 面辅料采购',
      children: <Text type="secondary">左侧菜单 → 生产管理 → 面辅料采购。查看物料采购记录，了解原料供应进度与采购状态。</Text>,
    },
    {
      key: '5',
      label: ' 成品入库',
      children: <Text type="secondary">左侧菜单 → 生产管理 → 成品入库。登记完工成品的入库数量，系统自动更新库存与进度。</Text>,
    },
    {
      key: '6',
      label: ' 订单结算',
      children: <Text type="secondary">左侧菜单 → 财务管理 → 订单结算（外）。查看本工厂已完成订单的结算金额，以及各款式工序的单价明细。</Text>,
    },
    {
      key: '7',
      label: ' 组织架构 & 人员管理',
      children: <Text type="secondary">左侧菜单 → 系统管理 → 组织架构。查看本工厂所有成员，点击成员头像查看资料。右上角头像 → 个人中心 → 成员管理 可新增/停用成员账号。</Text>,
    },
    {
      key: '8',
      label: ' 修改密码',
      children: <Text type="secondary">右上角头像 → 个人中心 → 修改密码。建议定期更新密码保障账号安全，新密码不少于6位。</Text>,
    },
  ];

  return (
    <>
      <ResizableModal title="个人中心" open={open} onCancel={onClose} footer={null} width="40vw">
        <Tabs
          defaultActiveKey="info"
          items={[
            {
              key: 'info',
              label: '账号信息',
              children: (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                    <Avatar size={56} icon={<UserOutlined />}>
                      {userInitial}
                    </Avatar>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{userDisplayName}</div>
                      <div style={{ color: '#888', marginTop: 4 }}>
                        {(user as any)?.factoryName || '外发工厂'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', rowGap: 12 }}>
                    <span style={{ color: '#888' }}>账号</span>
                    <span>{(user as any)?.username || '-'}</span>
                    <span style={{ color: '#888' }}>手机号</span>
                    <span>{(user as any)?.phone || '-'}</span>
                    <span style={{ color: '#888' }}>角色</span>
                    <span>{(user as any)?.roleName || '-'}</span>
                    <span style={{ color: '#888' }}>所属工厂</span>
                    <span>{(user as any)?.factoryName || '-'}</span>
                  </div>
                </div>
              ),
            },
            {
              key: 'password',
              label: <span><LockOutlined style={{ marginRight: 4 }} />修改密码</span>,
              children: (
                <div style={{ padding: '8px 0' }}>
                  <Form form={changePasswordForm} layout="vertical" style={{ maxWidth: 360 }}>
                    <Form.Item
                      name="oldPassword"
                      label="当前密码"
                      rules={[{ required: true, message: '请输入当前密码' }]}
                    >
                      <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
                    </Form.Item>
                    <Form.Item
                      name="newPassword"
                      label="新密码"
                      rules={[
                        { required: true, message: '请输入新密码' },
                        { min: 6, message: '新密码不少于6位' },
                      ]}
                    >
                      <Input.Password placeholder="请输入新密码（不少于6位）" autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item
                      name="confirmPassword"
                      label="确认新密码"
                      rules={[{ required: true, message: '请再次输入新密码' }]}
                    >
                      <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" loading={pwdLoading} onClick={handleChangePassword}>
                        确认修改
                      </Button>
                    </Form.Item>
                  </Form>
                </div>
              ),
            },
            {
              key: 'tutorial',
              label: <span><QuestionCircleOutlined style={{ marginRight: 4 }} />使用教程</span>,
              children: (
                <div style={{ padding: '4px 0' }}>
                  <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>点击展开各功能操作说明：</div>
                  <Collapse
                    size="small"
                    ghost
                    items={tutorialItems}
                  />
                </div>
              ),
            },
            {
              key: 'members',
              label: (
                <span>
                  成员管理
                  {members.length > 0 && (
                    <Badge count={members.length} size="small" style={{ marginLeft: 4 }} />
                  )}
                </span>
              ),
              children: (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <Button
                      type="primary"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => setAddModalOpen(true)}
                    >
                      新增成员
                    </Button>
                  </div>
                  <ResizableTable
                    size="small"
                    dataSource={members}
                    columns={columns}
                    rowKey="id"
                    loading={membersLoading}
                    pagination={false}
                    scroll={{ y: 300 }}
                  />
                </div>
              ),
            },
          ]}
        />
      </ResizableModal>

      <ResizableModal
        title="新增成员"
        open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields(); }}
        onOk={handleAdd}
        okText="确认新增"
        cancelText="取消"
        confirmLoading={addLoading}
        width="30vw"
        destroyOnHidden
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入登录账号' }]}>
            <Input placeholder="请输入登录账号" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="请输入手机号" maxLength={11} />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入初始密码' }]}>
            <Input.Password placeholder="请输入初始密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </ResizableModal>
    </>
  );
};

export default FactoryPersonalCenterModal;
