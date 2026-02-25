import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import ResizableTable from '@/components/common/ResizableTable';
import PaymentAccountManager from '@/components/common/PaymentAccountManager';
import { Factory as FactoryType, FactoryQueryParams } from '@/types/system';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useModal } from '@/hooks';
import { App, Button, Card, Form, Input, Select, Space, Tag, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';
import { useLocation } from 'react-router-dom';

type DialogMode = 'create' | 'view' | 'edit';

const FactoryList: React.FC = () => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const { isMobile, modalWidth } = useViewport();
  const location = useLocation();

  // ===== 使用 useModal 管理弹窗 =====
  const factoryModal = useModal<FactoryType>();
  const logModal = useModal();

  const [dialogMode, setDialogMode] = useState<DialogMode>('view');
  const [queryParams, setQueryParams] = useState<FactoryQueryParams>({
    page: 1,
    pageSize: 10
  });

  const [factoryList, setFactoryList] = useState<FactoryType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [licenseFileList, setLicenseFileList] = useState<UploadFile[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');

  // 收款账户管理
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountFactory, setAccountFactory] = useState<{ id: string; name: string }>({ id: '', name: '' });

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  // 构建图片文件列表
  const buildImageFileList = (url: any): UploadFile[] => {
    const u = String(url || '').trim();
    if (!u) return [];
    return [{ uid: 'license-1', name: '营业执照', status: 'done', url: getFullAuthedFileUrl(u) } as UploadFile];
  };

  // 上传营业执照
  const uploadBusinessLicense = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('仅支持图片文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片过大，最大5MB');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await api.post<{ code: number; message: string; data: string }>('/common/upload', formData);
      if (response.code === 200) {
        const url = String(response.data || '').trim();
        if (!url) {
          message.error('上传失败');
          return;
        }
        form.setFieldsValue({ businessLicense: url });
        setLicenseFileList(buildImageFileList(url));
        message.success('上传成功');
      } else {
        message.error(response.message || '上传失败');
      }
    } catch (e: any) {
      message.error(String(e?.message || '上传失败'));
    }
  };

  const fetchFactories = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: FactoryType[]; total: number } }>('/system/factory/list', { params: queryParams });
      if (response.code === 200) {
        setFactoryList(response.data.records || []);
        setTotal(response.data.total || 0);
      } else {
        message.error(response.message || '获取供应商列表失败');
      }
    } catch (error: any) {
      message.error(error?.message || '获取供应商列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFactories();
  }, [queryParams]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const factoryName = (params.get('factoryName') || '').trim();
    const factoryCode = (params.get('factoryCode') || '').trim();
    if (factoryName || factoryCode) {
      setQueryParams((prev) => ({
        ...prev,
        page: 1,
        factoryName: factoryName || prev.factoryName,
        factoryCode: factoryCode || prev.factoryCode,
      }));
    }
  }, [location.search]);

  const openDialog = (mode: DialogMode, factory?: FactoryType) => {
    setDialogMode(mode);
    if (mode === 'create') {
      form.setFieldsValue({
        factoryCode: '',
        factoryName: '',
        contactPerson: '',
        contactPhone: '',
        address: '',
        status: 'active',
        businessLicense: undefined,
      });
      setLicenseFileList([]);
    } else {
      form.setFieldsValue({
        factoryCode: factory?.factoryCode,
        factoryName: factory?.factoryName,
        contactPerson: factory?.contactPerson,
        contactPhone: factory?.contactPhone,
        address: factory?.address,
        status: factory?.status || 'inactive',
        businessLicense: (factory as any)?.businessLicense,
      });
      setLicenseFileList(buildImageFileList((factory as any)?.businessLicense));
    }
    factoryModal.open(factory || null);
  };

  const closeDialog = () => {
    factoryModal.close();
    form.resetFields();
    setLicenseFileList([]);
  };

  const openRemarkModal = (
    title: string,
    okText: string,
    okButtonProps: any,
    onConfirm: (remark: string) => Promise<void>
  ) => {
    let remarkValue = '';
    modal.confirm({
      title,
      content: (
        <Form layout="vertical" onSubmitCapture={(e) => e.preventDefault()}>
          <Form.Item label="操作原因">
            <Input.TextArea
              rows={4}
              maxLength={200}
              showCount
              onChange={(e) => {
                remarkValue = e.target.value;
              }}
            />
          </Form.Item>
        </Form>
      ),
      okText,
      cancelText: '取消',
      okButtonProps,
      onOk: async () => {
        const remark = String(remarkValue || '').trim();
        if (!remark) {
          message.error('请输入操作原因');
          return Promise.reject(new Error('请输入操作原因'));
        }
        await onConfirm(remark);
      },
    });
  };

  const openLogModal = async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title);
    logModal.open();
    setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', {
        params: { bizType, bizId },
      });
      const result = res as any;
      if (result.code === 200) {
        setLogRecords(Array.isArray(result.data) ? result.data : []);
      } else {
        message.error(result.message || '获取日志失败');
        setLogRecords([]);
      }
    } catch (e: any) {
      message.error(e?.message || '获取日志失败');
      setLogRecords([]);
    } finally {
      setLogLoading(false);
    }
  };

  const handleSave = async () => {
    const values = await form.validateFields();

    const submit = async (remark?: string) => {
      const payload: unknown = {
        ...values,
        status: values.status || 'active',
        id: factoryModal.data?.id,
        operationRemark: remark,
      };

      setSubmitLoading(true);
      try {
        const response = dialogMode === 'edit'
          ? await api.put<{ code: number; message: string }>('/system/factory', payload)
          : await api.post<{ code: number; message: string }>('/system/factory', payload);

        if (response.code === 200) {
          message.success('保存成功');
          closeDialog();
          fetchFactories();
        } else {
          message.error(response.message || '保存失败');
        }
      } catch (error: any) {
        message.error(error?.message || '保存失败');
      } finally {
        setSubmitLoading(false);
      }
    };

    if (dialogMode === 'edit') {
      openRemarkModal('确认保存', '确认保存', undefined, submit);
      return;
    }

    await submit();
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;

    openRemarkModal('确认删除', '删除', { danger: true }, async (remark) => {
      const response = await api.delete<{ code: number; message: string }>(`/system/factory/${id}`, { params: { remark } });
      if (response.code === 200) {
        message.success('删除成功');
        setQueryParams((prev) => ({ ...prev, page: 1 }));
        return;
      }
      throw new Error(response.message || '删除失败');
    });
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      active: '启用',
      inactive: '停用',
    };
    return statusMap[status] || '未知';
  };

  const logColumns = [
    {
      title: '动作',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '操作人',
      dataIndex: 'operator',
      key: 'operator',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '原因',
      dataIndex: 'remark',
      key: 'remark',
      render: (v: string) => v || '-',
    },
    {
      title: '时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (v: string) => formatDateTime(v),
    },
  ];

  const columns = [
    { title: '供应商编码', dataIndex: 'factoryCode', key: 'factoryCode', width: 140 },
    { title: '供应商名称', dataIndex: 'factoryName', key: 'factoryName', width: 180, ellipsis: true },
    { title: '联系人', dataIndex: 'contactPerson', key: 'contactPerson', width: 120 },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', width: 140 },
    { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v: unknown) => {
        const status = String(v || '').trim() || 'inactive';
        if (status === 'active') return <Tag color="success">{getStatusText(status)}</Tag>;
        if (status === 'inactive') return <Tag>{getStatusText(status)}</Tag>;
        return <Tag>{getStatusText(status)}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (v: unknown) => formatDateTime(v),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right' as const,
      render: (_: any, factory: FactoryType) => (
        <RowActions
          className="table-actions"
          maxInline={2}
          actions={[
            {
              key: 'view',
              label: '查看',
              title: '查看',
              onClick: () => openDialog('view', factory),
              primary: true,
            },
            {
              key: 'edit',
              label: '编辑',
              title: '编辑',
              onClick: () => openDialog('edit', factory),
              primary: true,
            },
            {
              key: 'account',
              label: '收款账户',
              title: '收款账户',
              onClick: () => {
                setAccountFactory({ id: String(factory.id || ''), name: factory.factoryName || '' });
                setAccountModalOpen(true);
              },
            },
            {
              key: 'log',
              label: '日志',
              title: '日志',
              onClick: () => openLogModal('factory', String(factory.id || ''), `供应商 ${factory.factoryName} 操作日志`),
            },
            {
              key: 'delete',
              label: '删除',
              title: '删除',
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
          <h2 className="page-title">供应商管理</h2>
        </div>

        <Card size="small" className="filter-card mb-sm">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
            <Space wrap size={12}>
              <Input
                placeholder="供应商编码"
                style={{ width: 180 }}
                allowClear
                value={String((queryParams as any)?.factoryCode || '')}
                onChange={(e) => setQueryParams((prev) => ({ ...prev, factoryCode: e.target.value, page: 1 }))}
              />
              <Input
                placeholder="供应商名称"
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
            <Button type="primary" onClick={() => openDialog('create')}>
              新增加工厂
            </Button>
          </div>
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
            showTotal: (t) => `共 ${t} 条`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <ResizableModal
        open={factoryModal.visible}
        title={dialogMode === 'create' ? '新增供应商' : dialogMode === 'edit' ? '编辑供应商' : '供应商详情'}
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
            <Form.Item name="factoryCode" label="供应商编码" rules={[{ required: true, message: '请输入供应商编码' }]}>
              <Input placeholder="请输入供应商编码" />
            </Form.Item>
            <Form.Item name="factoryName" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
              <Input placeholder="请输入供应商名称" />
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
          <Form.Item name="businessLicense" label="营业执照" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="营业执照图片">
            <Upload
              accept="image/*"
              listType="picture-card"
              maxCount={1}
              fileList={licenseFileList}
              disabled={dialogMode === 'view'}
              onRemove={() => {
                form.setFieldsValue({ businessLicense: undefined });
                setLicenseFileList([]);
                return true;
              }}
              beforeUpload={(file) => {
                void uploadBusinessLicense(file as File);
                return Upload.LIST_IGNORE;
              }}
            >
              {licenseFileList.length ? null : (
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)' }}>上传营业执照</div>
                </div>
              )}
            </Upload>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text-disabled)', marginTop: 4 }}>支持jpg、png格式，最大10MB（非必填）</div>
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

      <ResizableModal
        open={logModal.visible}
        title={logTitle}
        onCancel={() => {
          logModal.close();
          setLogRecords([]);
        }}
        footer={null}
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        minWidth={isMobile ? 320 : 520}
        scaleWithViewport
      >
        <ResizableTable
          columns={logColumns as any}
          dataSource={logRecords}
          rowKey={(r) => String(r.id || `${r.bizType}-${r.bizId}-${r.createTime}`)}
          loading={logLoading}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </ResizableModal>

      {/* 收款账户管理弹窗 */}
      <PaymentAccountManager
        open={accountModalOpen}
        ownerType="FACTORY"
        ownerId={accountFactory.id}
        ownerName={accountFactory.name}
        onClose={() => setAccountModalOpen(false)}
      />
    </Layout>
  );
};

export default FactoryList;
