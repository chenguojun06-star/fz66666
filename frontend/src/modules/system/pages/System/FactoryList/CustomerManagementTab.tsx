import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, Select, Space, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import StandardPagination from '@/components/common/StandardPagination';
import { useViewport } from '@/utils/useViewport';
import { formatDateTime } from '@/utils/datetime';
import { DEFAULT_PAGE_SIZE, readPageSize } from '@/utils/pageSizeStore';
import { customerApi, type Customer, type CustomerListParams } from '@/services/crm/customerApi';

type DialogMode = 'create' | 'edit' | 'view';

interface Props {
  active: boolean;
}

const CUSTOMER_LEVEL_OPTIONS = [
  { value: 'VIP', label: '核心客户' },
  { value: 'NORMAL', label: '普通客户' },
];

const CUSTOMER_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '合作中' },
  { value: 'INACTIVE', label: '已停合作' },
];

const getCustomerLevelTag = (value?: string) => {
  if (value === 'VIP') return <Tag color="gold">核心客户</Tag>;
  if (value === 'NORMAL') return <Tag color="blue">普通客户</Tag>;
  return <Tag>{value || '未标记'}</Tag>;
};

const getCustomerStatusTag = (value?: string) => {
  if (value === 'ACTIVE') return <Tag color="success">合作中</Tag>;
  if (value === 'INACTIVE') return <Tag>已停合作</Tag>;
  return <Tag>{value || '未知'}</Tag>;
};

const CustomerManagementTab: React.FC<Props> = ({ active }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<Customer>();
  const { isMobile, modalWidth } = useViewport();
  const [dialogMode, setDialogMode] = useState<DialogMode>('view');
  const [modalOpen, setModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<CustomerListParams & { page: number; pageSize: number }>({
    page: 1,
    pageSize: readPageSize(DEFAULT_PAGE_SIZE),
    keyword: '',
    status: '',
    customerLevel: '',
  });

  const fetchCustomers = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const response = await customerApi.list(queryParams);
      if (response.code === 200) {
        setCustomers(response.data.records || []);
        setTotal(response.data.total || 0);
        return;
      }
      message.error(response.message || '获取客户列表失败');
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '获取客户列表失败');
    } finally {
      setLoading(false);
    }
  }, [active, message, queryParams]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (!modalOpen) {
      form.resetFields();
      return;
    }

    if (dialogMode === 'create') {
      form.setFieldsValue({
        companyName: '',
        contactPerson: '',
        contactPhone: '',
        industry: '',
        source: '',
        customerLevel: 'NORMAL',
        status: 'ACTIVE',
        remark: '',
      });
      return;
    }

    form.setFieldsValue({
      companyName: currentRecord?.companyName,
      contactPerson: currentRecord?.contactPerson,
      contactPhone: currentRecord?.contactPhone,
      contactEmail: currentRecord?.contactEmail,
      address: currentRecord?.address,
      customerLevel: currentRecord?.customerLevel || 'NORMAL',
      industry: currentRecord?.industry,
      source: currentRecord?.source,
      status: currentRecord?.status || 'ACTIVE',
      remark: currentRecord?.remark,
    });
  }, [currentRecord, dialogMode, form, modalOpen]);

  const openDialog = (mode: DialogMode, record?: Customer) => {
    setDialogMode(mode);
    setCurrentRecord(record || null);
    setModalOpen(true);
  };

  const closeDialog = () => {
    setModalOpen(false);
    setCurrentRecord(null);
    form.resetFields();
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (dialogMode === 'edit' && currentRecord?.id) {
        const response = await customerApi.update(currentRecord.id, values);
        if (response.code !== 200) {
          message.error(response.message || '保存失败');
          return;
        }
      } else {
        const response = await customerApi.create(values);
        if (response.code !== 200) {
          message.error(response.message || '保存失败');
          return;
        }
      }
      message.success('保存成功');
      closeDialog();
      void fetchCustomers();
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (record: Customer) => {
    if (!record.id) return;
    modal.confirm({
      title: `确认删除客户「${record.companyName || '未命名客户'}」吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const response = await customerApi.delete(record.id!);
        if (response.code === 200) {
          message.success('删除成功');
          setQueryParams((prev) => ({ ...prev, page: 1 }));
          return;
        }
        throw new Error(response.message || '删除失败');
      },
    });
  };

  const columns = [
    { title: '客户编号', dataIndex: 'customerNo', key: 'customerNo', width: 170 },
    {
      title: '客户名称',
      dataIndex: 'companyName',
      key: 'companyName',
      width: 220,
      ellipsis: true,
      render: (value: string) => value || '-',
    },
    {
      title: '客户标签',
      dataIndex: 'customerLevel',
      key: 'customerLevel',
      width: 120,
      render: (value: string) => getCustomerLevelTag(value),
    },
    { title: '联系人', dataIndex: 'contactPerson', key: 'contactPerson', width: 120, render: (value: string) => value || '-' },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', width: 150, render: (value: string) => value || '-' },
    { title: '行业/品类', dataIndex: 'industry', key: 'industry', width: 140, render: (value: string) => value || '-' },
    { title: '客户来源', dataIndex: 'source', key: 'source', width: 140, render: (value: string) => value || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: string) => getCustomerStatusTag(value),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 190,
      fixed: 'right' as const,
      render: (_: unknown, record: Customer) => (
        <RowActions
          className="table-actions"
          maxInline={2}
          actions={[
            {
              key: 'view',
              label: '查看',
              title: '查看',
              onClick: () => openDialog('view', record),
              primary: true,
            },
            {
              key: 'edit',
              label: '编辑',
              title: '编辑',
              onClick: () => openDialog('edit', record),
              primary: true,
            },
            {
              key: 'delete',
              label: '删除',
              title: '删除',
              danger: true,
              onClick: () => handleDelete(record),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <Card size="small" className="filter-card mb-sm">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
          <Space wrap size={12}>
            <Input
              placeholder="客户名称/联系人/电话"
              style={{ width: 240 }}
              allowClear
              value={queryParams.keyword || ''}
              onChange={(e) => setQueryParams((prev) => ({ ...prev, keyword: e.target.value, page: 1 }))}
            />
            <Select
              placeholder="客户标签"
              style={{ width: 160 }}
              allowClear
              value={queryParams.customerLevel || undefined}
              options={CUSTOMER_LEVEL_OPTIONS}
              onChange={(value) => setQueryParams((prev) => ({ ...prev, customerLevel: value, page: 1 }))}
            />
            <Select
              placeholder="状态"
              style={{ width: 140 }}
              allowClear
              value={queryParams.status || undefined}
              options={CUSTOMER_STATUS_OPTIONS}
              onChange={(value) => setQueryParams((prev) => ({ ...prev, status: value, page: 1 }))}
            />
            <Button type="primary" onClick={() => setQueryParams((prev) => ({ ...prev, page: 1 }))}>
              查询
            </Button>
            <Button
              onClick={() =>
                setQueryParams((prev) => ({
                  page: 1,
                  pageSize: prev.pageSize,
                  keyword: '',
                  status: '',
                  customerLevel: '',
                }))
              }
            >
              重置
            </Button>
          </Space>
          <Button type="primary" onClick={() => openDialog('create')}>
            新增客户
          </Button>
        </div>
      </Card>

      <ResizableTable<Customer>
        storageKey="production-customer-table"
        rowKey={(record) => String(record.id || record.customerNo || record.companyName)}
        columns={columns as any}
        dataSource={customers}
        loading={loading}
        pagination={false}
        stickyHeader
        scroll={{ x: 'max-content' }}
      />
      <StandardPagination
        current={queryParams.page}
        pageSize={queryParams.pageSize}
        total={total}
        wrapperStyle={{ paddingTop: 12 }}
        onChange={(page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize }))}
      />

      <ResizableModal
        open={modalOpen}
        title={dialogMode === 'create' ? '新增客户' : dialogMode === 'edit' ? '编辑客户' : '客户详情'}
        onCancel={closeDialog}
        onOk={dialogMode === 'view' ? undefined : handleSave}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        footer={
          dialogMode === 'view' ? (
            <div className="modal-footer-actions">
              <Button onClick={closeDialog}>关闭</Button>
            </div>
          ) : undefined
        }
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.8 : 760}
        minWidth={isMobile ? 320 : 520}
        scaleWithViewport
      >
        <Form form={form} layout="vertical" disabled={dialogMode === 'view'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="companyName" label="客户名称" rules={[{ required: true, message: '请输入客户名称' }]}>
              <Input placeholder="请输入客户名称" />
            </Form.Item>
            <Form.Item name="customerLevel" label="客户标签" rules={[{ required: true, message: '请选择客户标签' }]}>
              <Select options={CUSTOMER_LEVEL_OPTIONS} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="contactPerson" label="联系人">
              <Input placeholder="请输入联系人" />
            </Form.Item>
            <Form.Item name="contactPhone" label="联系电话">
              <Input placeholder="请输入联系电话" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="industry" label="行业/品类">
              <Input placeholder="请输入行业或品类" />
            </Form.Item>
            <Form.Item name="source" label="客户来源">
              <Input placeholder="请输入客户来源" />
            </Form.Item>
          </div>
          <Form.Item name="address" label="地址">
            <Input placeholder="请输入地址" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select options={CUSTOMER_STATUS_OPTIONS} />
          </Form.Item>
        </Form>
      </ResizableModal>
    </>
  );
};

export default CustomerManagementTab;
