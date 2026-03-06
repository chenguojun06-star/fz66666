import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Button, Card, Form, Input, Select, Space, Tag } from 'antd';
import Layout from '@/components/Layout';
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
  const { message } = App.useApp();

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
    try {
      await api.delete(`/factory-worker/${id}`);
      message.success('删除成功');
      fetchWorkers();
    } catch {
      message.error('删除失败');
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
          !readOnly && (
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
          defaultWidth="40vw"
          defaultHeight="50vh"
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
    </Layout>
  );
};

export default FactoryWorkerList;
