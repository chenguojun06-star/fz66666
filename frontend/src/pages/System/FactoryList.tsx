import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/ResizableModal';
import RowActions from '../../components/RowActions';
import ResizableTable from '../../components/ResizableTable';
import { Factory as FactoryType, FactoryQueryParams } from '../../types/system';
import api from '../../utils/api';
import { Button, Card, Space, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { formatDateTime } from '../../utils/datetime';
import './styles.css';

type DialogMode = 'create' | 'view' | 'edit';

const FactoryList: React.FC = () => {
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

  const [formValues, setFormValues] = useState<Partial<FactoryType>>({
    factoryCode: '',
    factoryName: '',
    contactPerson: '',
    contactPhone: '',
    address: '',
    status: 'active'
  });

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
    if (mode === 'create') {
      setFormValues({
        factoryCode: '',
        factoryName: '',
        contactPerson: '',
        contactPhone: '',
        address: '',
        status: 'active'
      });
    } else {
      setFormValues({
        id: factory?.id,
        factoryCode: factory?.factoryCode,
        factoryName: factory?.factoryName,
        contactPerson: factory?.contactPerson,
        contactPhone: factory?.contactPhone,
        address: factory?.address,
        status: factory?.status
      });
    }
    setVisible(true);
  };

  const closeDialog = () => {
    setVisible(false);
  };

  const handleSave = async () => {
    const payload: any = {
      ...formValues,
      status: formValues.status || 'active'
    };
    if (!payload.factoryCode || !payload.factoryName) {
      message.error('请填写加工厂编码与名称');
      return;
    }

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
    if (!window.confirm('确定要删除该加工厂吗？')) return;
    try {
      const response = await api.delete<any>(`/system/factory/${id}`);
      const result = response as any;
      if (result.code === 200) {
        message.success('删除成功');
        setQueryParams(prev => ({ ...prev, page: 1 }));
      } else {
        message.error(result.message || '删除失败');
      }
    } catch (error: any) {
      message.error(error?.message || '删除失败');
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      active: '启用',
      inactive: '停用'
    };
    return statusMap[status] || '未知';
  };

  const getStatusClass = (status: string) => {
    const statusClassMap: Record<string, string> = {
      active: 'status-active',
      inactive: 'status-inactive'
    };
    return statusClassMap[status] || '';
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
        return <span className={`status-tag ${getStatusClass(status)}`}>{getStatusText(status)}</span>;
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
      <div className="factory-page">
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">加工厂管理</h2>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog('create')}>
              新增加工厂
            </Button>
          </div>

          <Card size="small" className="filter-card mb-sm">
            <div className="filter-section">
              <div className="filter-row">
                <div className="filter-item">
                  <label className="form-label">加工厂编码</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="请输入加工厂编码"
                    onChange={(e) => setQueryParams(prev => ({ ...prev, factoryCode: e.target.value, page: 1 }))}
                  />
                </div>

                <div className="filter-item">
                  <label className="form-label">加工厂名称</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="请输入加工厂名称"
                    onChange={(e) => setQueryParams(prev => ({ ...prev, factoryName: e.target.value, page: 1 }))}
                  />
                </div>

                <div className="filter-item">
                  <label className="form-label">状态</label>
                  <select
                    className="form-input"
                    onChange={(e) => setQueryParams(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                  >
                    <option value="">全部</option>
                    <option value="active">启用</option>
                    <option value="inactive">停用</option>
                  </select>
                </div>

                <div className="filter-item filter-actions">
                  <Space>
                    <Button type="primary" onClick={() => setQueryParams(prev => ({ ...prev, page: 1 }))}>
                      查询
                    </Button>
                    <Button onClick={() => setQueryParams({ page: 1, pageSize: 10 })}>
                      重置
                    </Button>
                  </Space>
                </div>
              </div>
            </div>
          </Card>

          <div className="table-section">
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
              scroll={{ x: 'max-content' }}
            />
          </div>
        </Card>
      </div>

      <ResizableModal
        open={visible}
        title={dialogMode === 'create' ? '新增加工厂' : dialogMode === 'edit' ? '编辑加工厂' : '加工厂详情'}
        onCancel={closeDialog}
        footer={null}
        width="60vw"
      >
        <div className="factory-form">
          <div className="row">
            <div className="col-6">
              <div className="form-item">
                <label className="form-label">加工厂编码</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="请输入加工厂编码"
                  disabled={dialogMode === 'view'}
                  value={formValues.factoryCode || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, factoryCode: e.target.value }))}
                />
              </div>
            </div>
            <div className="col-6">
              <div className="form-item">
                <label className="form-label">加工厂名称</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="请输入加工厂名称"
                  disabled={dialogMode === 'view'}
                  value={formValues.factoryName || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, factoryName: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="row mt-sm">
            <div className="col-6">
              <div className="form-item">
                <label className="form-label">联系人</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="请输入联系人"
                  disabled={dialogMode === 'view'}
                  value={formValues.contactPerson || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, contactPerson: e.target.value }))}
                />
              </div>
            </div>
            <div className="col-6">
              <div className="form-item">
                <label className="form-label">联系电话</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="请输入联系电话"
                  disabled={dialogMode === 'view'}
                  value={formValues.contactPhone || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, contactPhone: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="row mt-sm">
            <div className="col-12">
              <div className="form-item">
                <label className="form-label">地址</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="请输入地址"
                  disabled={dialogMode === 'view'}
                  value={formValues.address || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="row mt-sm">
            <div className="col-6">
              <div className="form-item">
                <label className="form-label">状态</label>
                <select
                  className="form-input"
                  disabled={dialogMode === 'view'}
                  value={formValues.status || 'active'}
                  onChange={(e) => setFormValues(prev => ({ ...prev, status: e.target.value as any }))}
                >
                  <option value="active">启用</option>
                  <option value="inactive">停用</option>
                </select>
              </div>
            </div>
          </div>

          {dialogMode !== 'view' && (
            <div className="row mt-sm" style={{ justifyContent: 'flex-end' }}>
              <Space>
                <Button onClick={closeDialog} disabled={submitLoading}>
                  取消
                </Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} disabled={submitLoading} loading={submitLoading}>
                  保存
                </Button>
              </Space>
            </div>
          )}
        </div>
      </ResizableModal>
    </Layout>
  );
};

export default FactoryList;
