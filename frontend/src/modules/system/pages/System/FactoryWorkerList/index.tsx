import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { App, Button, Card, Form, Input, Select, Space, Tag } from 'antd';
import { ArrowLeftOutlined, UserAddOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import { paths } from '@/routeConfig';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import ResizableTable from '@/components/common/ResizableTable';
import { useAuth } from '@/utils/AuthContext';
import { useModal } from '@/hooks';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';

interface FactoryWorker {
  id?: string;
  factoryId?: string;
  workerNo?: string;
  workerName?: string;
  phone?: string;
  status?: 'active' | 'inactive';
  createTime?: string;
}

const FactoryWorkerList: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();

  const isFactoryAccount = !!user?.factoryId;
  const factoryIdFromUrl = searchParams.get('factoryId');
  const factoryNameFromUrl = searchParams.get('factoryName') || '';
  const readOnly = !isFactoryAccount;

  // 工厂账号使用自身 factoryId；租户管理员使用 URL 传入的 factoryId
  const effectiveFactoryId = isFactoryAccount
    ? (user?.factoryId ?? undefined)
    : (factoryIdFromUrl ?? undefined);

  const [workers, setWorkers] = useState<FactoryWorker[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [form] = Form.useForm();
  const workerModal = useModal<FactoryWorker>();

  // 创建工厂账号弹窗（仅管理员在只读模式下使用）
  const [accountForm] = Form.useForm();
  const accountModal = useModal<null>();
  const [accountSaving, setAccountSaving] = useState(false);

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (effectiveFactoryId) params.factoryId = effectiveFactoryId;
      if (statusFilter) params.status = statusFilter;
      const data = await api.get('/factory-worker/list', { params });
      setWorkers(Array.isArray(data) ? data : []);
    } catch {
      message.error('加载工人列表失败');
    } finally {
      setLoading(false);
    }
  }, [effectiveFactoryId, statusFilter, message]);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  const handleOpenAdd = () => {
    form.resetFields();
    form.setFieldsValue({ status: 'active' });
    workerModal.open({});
  };

  const handleOpenEdit = (record: FactoryWorker) => {
    form.resetFields();
    form.setFieldsValue(record);
    workerModal.open(record);
  };

  const handleClose = () => {
    workerModal.close();
    form.resetFields();
  };

  const handleSave = async (values: FactoryWorker) => {
    setSaving(true);
    try {
      const payload = workerModal.data?.id ? { ...values, id: workerModal.data.id } : values;
      await api.post('/factory-worker/save', payload);
      message.success(workerModal.data?.id ? '修改成功' : '添加成功');
      handleClose();
      fetchWorkers();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    let remarkValue = '';
    modal.confirm({
      title: '确认删除',
      content: (
        <div>
          <p>确认要删除该账号吗？</p>
          <div style={{ marginTop: 16 }}>
            <span style={{ color: 'red' }}>*</span> 删除原因：
            <Input.TextArea
              rows={3}
              placeholder="请输入删除原因（必填）"
              onChange={(e) => { remarkValue = e.target.value; }}
            />
          </div>
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (!remarkValue.trim()) {
          message.error('请填写删除原因');
          return Promise.reject(new Error('未填写原因'));
        }
        try {
          await api.delete(`/factory-worker/${id}`, { params: { remark: remarkValue.trim() } });
          message.success('删除成功');
          fetchWorkers();
        } catch {
          message.error('删除失败');
        }
      }
    });
  };

  const handleCreateAccount = async (values: { username: string; password: string; name?: string; phone?: string }) => {
    if (!effectiveFactoryId) return;
    setAccountSaving(true);
    try {
      await api.post('/system/organization/factory/create-account', {
        factoryId: effectiveFactoryId,
        ...values,
      });
      message.success('账号创建成功，外发工厂可用此账号登录');
      accountModal.close();
      accountForm.resetFields();
    } catch {
      message.error('创建账号失败');
    } finally {
      setAccountSaving(false);
    }
  };

  const columns = [
    { title: '工号', dataIndex: 'workerNo', key: 'workerNo', width: 120 },
    { title: '姓名', dataIndex: 'workerName', key: 'workerName', width: 120 },
    { title: '联系电话', dataIndex: 'phone', key: 'phone', width: 150 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) =>
        v === 'active' ? <Tag color="success">在职</Tag> : <Tag color="default">离职</Tag>,
    },
    {
      title: '入职时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (v: unknown) => formatDateTime(v),
    },
    ...(!readOnly
      ? [
          {
            title: '操作',
            key: 'actions',
            width: 120,
            render: (_: unknown, record: FactoryWorker) => (
              <RowActions
                actions={[
                  {
                    key: 'edit',
                    label: '编辑',
                    primary: true,
                    onClick: () => handleOpenEdit(record),
                  },
                  {
                    key: 'delete',
                    label: '删除',
                    danger: true,
                    onClick: () => handleDelete(record.id!),
                  },
                ]}
              />
            ),
          },
        ]
      : []),
  ];

  const pageTitle = readOnly
    ? factoryNameFromUrl
      ? `${factoryNameFromUrl} - 工人名册（只读）`
      : '工人名册（只读）'
    : '工人名册';

  return (
    <Layout>
      <Card
        className="page-card"
        title={pageTitle}
        extra={
          readOnly ? (
            <Space>
              <Button
                icon={<UserAddOutlined />}
                onClick={() => accountModal.open(null)}
              >
                创建账号
              </Button>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(paths.factory)}>
                返回供应商管理
              </Button>
            </Space>
          ) : (
            <Button type="primary" onClick={handleOpenAdd}>
              新增工人
            </Button>
          )
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            onChange={(v) => setStatusFilter(v || '')}
            options={[
              { label: '在职', value: 'active' },
              { label: '离职', value: 'inactive' },
            ]}
          />
        </Space>
        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={workers}
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 700 }}
        />
      </Card>

      {!readOnly && (
        <ResizableModal
          open={workerModal.visible}
          title={workerModal.data?.id ? '编辑工人信息' : '新增工人'}
          width="40vw"
          destroyOnHidden
          onCancel={handleClose}
          footer={
            <div className="modal-footer-actions">
              <Button onClick={handleClose}>取消</Button>
              <Button type="primary" loading={saving} onClick={() => form.submit()}>
                保存
              </Button>
            </div>
          }
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
            style={{ padding: '16px 24px' }}
          >
            <Form.Item
              name="workerNo"
              label="工号"
              rules={[{ required: true, message: '请输入工号' }]}
            >
              <Input placeholder="输入工号（工厂内部编号）" />
            </Form.Item>
            <Form.Item
              name="workerName"
              label="姓名"
              rules={[{ required: true, message: '请输入姓名' }]}
            >
              <Input placeholder="输入工人姓名" />
            </Form.Item>
            <Form.Item name="phone" label="联系电话">
              <Input placeholder="输入联系电话（选填）" />
            </Form.Item>
            <Form.Item
              name="status"
              label="状态"
              rules={[{ required: true, message: '请选择状态' }]}
            >
              <Select
                options={[
                  { label: '在职', value: 'active' },
                  { label: '离职', value: 'inactive' },
                ]}
              />
            </Form.Item>
          </Form>
        </ResizableModal>
      )}

      {/* 创建工厂登录账号弹窗（管理员使用） */}
      <ResizableModal
        open={accountModal.visible}
        title={`创建账号 — ${factoryNameFromUrl || '外发工厂'}`}
        width="30vw"
        destroyOnHidden
        onCancel={() => { accountModal.close(); accountForm.resetFields(); }}
        footer={
          <div className="modal-footer-actions">
            <Button onClick={() => { accountModal.close(); accountForm.resetFields(); }}>取消</Button>
            <Button type="primary" loading={accountSaving} onClick={() => accountForm.submit()}>
              创建
            </Button>
          </div>
        }
      >
        <Form
          form={accountForm}
          layout="vertical"
          onFinish={handleCreateAccount}
          style={{ padding: '16px 24px' }}
        >
          <Form.Item
            name="username"
            label="登录用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="工厂登录时使用的用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[{ required: true, message: '请输入初始密码' }, { min: 6, message: '密码至少6位' }]}
          >
            <Input.Password placeholder="设置初始密码（至少6位）" />
          </Form.Item>
          <Form.Item name="name" label="联系人姓名">
            <Input placeholder="可选，方便识别" />
          </Form.Item>
          <Form.Item name="phone" label="联系电话">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </ResizableModal>
    </Layout>
  );
};

export default FactoryWorkerList;
