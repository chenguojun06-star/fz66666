import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/common/ResizableModal';
import RowActions from '../../components/common/RowActions';
import ResizableTable from '../../components/common/ResizableTable';
import { Factory as FactoryType, FactoryQueryParams } from '../../types/system';
import api from '../../utils/api';
import { Button, Card, Form, Input, Modal, Select, Space, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { formatDateTime } from '../../utils/datetime';

type DialogMode = 'create' | 'view' | 'edit';

const FactoryList: React.FC = () => {
  const [form] = Form.useForm();
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  const [visible, setVisible] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('view');
  const [queryParams, setQueryParams] = useState<FactoryQueryParams>({
    page: 1,
    pageSize: 10
  });

  const [factoryList, setFactoryList] = useState<FactoryType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [currentFactory, setCurrentFactory] = useState<FactoryType | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1024;
  const modalWidth = isMobile ? '96vw' : isTablet ? '66vw' : '60vw';
  const modalInitialHeight = 720;

  const fetchFactories = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/system/factory/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setFactoryList(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取加工厂列表失败');
      }
    } catch (error: any) {
      message.error(error?.message || '获取加工厂列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFactories();
  }, [queryParams]);

  const openDialog = (mode: DialogMode, factory?: FactoryType) => {
    setDialogMode(mode);
    setCurrentFactory(factory || null);
    if (mode === 'create') {
      form.setFieldsValue({
        factoryCode: '',
        factoryName: '',
        contactPerson: '',
        contactPhone: '',
        address: '',
        status: 'active',
      });
    } else {
      form.setFieldsValue({
        factoryCode: factory?.factoryCode,
        factoryName: factory?.factoryName,
        contactPerson: factory?.contactPerson,
        contactPhone: factory?.contactPhone,
        address: factory?.address,
        status: factory?.status || 'inactive',
      });
    }
    setVisible(true);
  };

  const closeDialog = () => {
    setVisible(false);
    setCurrentFactory(null);
    form.resetFields();
  };

  const handleSave = async () => {
    const values = await form.validateFields();

    const payload: any = {
      ...values,
      status: values.status || 'active',
      id: currentFactory?.id,
    };

    setSubmitLoading(true);
    try {
      const response = dialogMode === 'edit'
        ? await api.put<any>('/system/factory', payload)
        : await api.post<any>('/system/factory', payload);

      const result = response as any;
      if (result.code === 200) {
        message.success('保存成功');
        closeDialog();
        fetchFactories();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error: any) {
      message.error(error?.message || '保存失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;

    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该加工厂吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const response = await api.delete<any>(`/system/factory/${id}`);
        const result = response as any;
        if (result.code === 200) {
          message.success('删除成功');
          setQueryParams((prev) => ({ ...prev, page: 1 }));
          return;
        }
        throw new Error(result.message || '删除失败');
      },
      onCancel: () => { },
    });
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      active: '启用',
      inactive: '停用',
    };
    return statusMap[status] || '未知';
  };

  const columns = [
    { title: '加工厂编码', dataIndex: 'factoryCode', key: 'factoryCode', width: 140 },
    { title: '加工厂名称', dataIndex: 'factoryName', key: 'factoryName', width: 180, ellipsis: true },
    { title: '联系人', dataIndex: 'contactPerson', key: 'contactPerson', width: 120 },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', width: 140 },
    { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v: any) => {
        const status = String(v || '').trim() || 'inactive';
        if (status === 'active') return <Tag color="green">{getStatusText(status)}</Tag>;
        if (status === 'inactive') return <Tag>{getStatusText(status)}</Tag>;
        return <Tag>{getStatusText(status)}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (v: any) => formatDateTime(v),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right' as const,
      render: (_: any, factory: FactoryType) => (
        <RowActions
          className="table-actions"
          maxInline={3}
          actions={[
            {
              key: 'view',
              label: '查看',
              title: '查看',
              icon: <EyeOutlined />,
              onClick: () => openDialog('view', factory),
              primary: true,
            },
            {
              key: 'edit',
              label: '编辑',
              title: '编辑',
              icon: <EditOutlined />,
              onClick: () => openDialog('edit', factory),
              primary: true,
            },
            {
              key: 'delete',
              label: '删除',
              title: '删除',
              icon: <DeleteOutlined />,
              danger: true,
              onClick: () => handleDelete(factory.id),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
      <Card className="page-card">
        <div className="page-header">
          <h2 className="page-title">加工厂管理</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog('create')}>
            新增加工厂
          </Button>
        </div>

        <Card size="small" className="filter-card mb-sm">
          <Space wrap>
            <Input
              placeholder="加工厂编码"
              style={{ width: 180 }}
              allowClear
              value={String((queryParams as any)?.factoryCode || '')}
              onChange={(e) => setQueryParams((prev) => ({ ...prev, factoryCode: e.target.value, page: 1 }))}
            />
            <Input
              placeholder="加工厂名称"
              style={{ width: 220 }}
              allowClear
              value={String((queryParams as any)?.factoryName || '')}
              onChange={(e) => setQueryParams((prev) => ({ ...prev, factoryName: e.target.value, page: 1 }))}
            />
            <Select
              placeholder="状态"
              style={{ width: 140 }}
              allowClear
              value={String((queryParams as any)?.status || '') || undefined}
              options={[
                { value: 'active', label: '启用' },
                { value: 'inactive', label: '停用' },
              ]}
              onChange={(value) => setQueryParams((prev) => ({ ...prev, status: value, page: 1 }))}
            />
            <Button type="primary" onClick={() => setQueryParams((prev) => ({ ...prev, page: 1 }))}>
              查询
            </Button>
            <Button onClick={() => setQueryParams({ page: 1, pageSize: queryParams.pageSize })}>重置</Button>
          </Space>
        </Card>

        <ResizableTable<FactoryType>
          storageKey="system-factory-table"
          rowKey={(r) => String(r.id || r.factoryCode)}
          columns={columns as any}
          dataSource={factoryList}
          loading={loading}
          pagination={{
            current: queryParams.page,
            pageSize: queryParams.pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条记录`,
            onChange: (page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
          }}
          scroll={{ x: 'max-content', y: isMobile ? 360 : 560 }}
        />
      </Card>

      <ResizableModal
        open={visible}
        title={dialogMode === 'create' ? '新增加工厂' : dialogMode === 'edit' ? '编辑加工厂' : '加工厂详情'}
        onCancel={closeDialog}
        onOk={dialogMode === 'view' ? undefined : handleSave}
        okText="保存"
        cancelText="取消"
        confirmLoading={submitLoading}
        footer={
          dialogMode === 'view' ? (
            <div className="modal-footer-actions">
              <Button onClick={closeDialog}>关闭</Button>
            </div>
          ) : undefined
        }
        width={modalWidth}
        initialHeight={modalInitialHeight}
        minWidth={isMobile ? 320 : 520}
        scaleWithViewport
      >
        <Form form={form} layout="vertical" disabled={dialogMode === 'view'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="factoryCode" label="加工厂编码" rules={[{ required: true, message: '请输入加工厂编码' }]}>
              <Input placeholder="请输入加工厂编码" />
            </Form.Item>
            <Form.Item name="factoryName" label="加工厂名称" rules={[{ required: true, message: '请输入加工厂名称' }]}>
              <Input placeholder="请输入加工厂名称" />
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
          <Form.Item name="address" label="地址">
            <Input placeholder="请输入地址" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              options={[
                { value: 'active', label: '启用' },
                { value: 'inactive', label: '停用' },
              ]}
            />
          </Form.Item>
        </Form>
      </ResizableModal>
    </Layout>
  );
};

export default FactoryList;
