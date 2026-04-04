import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import ResizableTable from '@/components/common/ResizableTable';
import PaymentAccountManager from '@/components/common/PaymentAccountManager';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { Factory as FactoryType, FactoryQueryParams, OrganizationUnit, User } from '@/types/system';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useModal } from '@/hooks';
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Tabs, Tag, Tooltip, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { QuestionCircleOutlined, UploadOutlined } from '@ant-design/icons';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';
import { useLocation, useNavigate } from 'react-router-dom';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { SupplierScore } from '@/services/intelligence/intelligenceApi';
import { paths } from '@/routeConfig';
import { organizationApi } from '@/services/system/organizationApi';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, readPageSize } from '@/utils/pageSizeStore';
import CustomerManagementTab from './CustomerManagementTab';
import { usePersistentState } from '@/hooks/usePersistentState';

type DialogMode = 'create' | 'view' | 'edit';

const getDepartmentLabel = (item?: OrganizationUnit | null) => {
  const pathLabel = String(item?.pathNames ?? '').trim();
  const nodeLabel = String(item?.unitName ?? item?.nodeName ?? '').trim();
  return pathLabel || nodeLabel || '未命名部门';
};

const FactoryList: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { isMobile, modalWidth } = useViewport();
  const location = useLocation();
  const navigate = useNavigate();

  // ===== 使用 useModal 管理弹窗 =====
  const factoryModal = useModal<FactoryType>();
  const logModal = useModal();

  type RemarkModalState = {
    open: boolean;
    title: string;
    okText: string;
    okDanger: boolean;
    onConfirm: (remark: string) => Promise<void>;
  };
  const [remarkModalState, setRemarkModalState] = useState<RemarkModalState | null>(null);
  const [remarkLoading, setRemarkLoading] = useState(false);

  const [dialogMode, setDialogMode] = useState<DialogMode>('view');
  const [managementTab, setManagementTab] = usePersistentState<'supplier' | 'customer'>('factory-list-management-tab', 'supplier');
  const [activeTab, setActiveTab] = usePersistentState<'ALL' | 'MATERIAL' | 'OUTSOURCE'>('factory-list-supplier-tab', 'ALL');
  const handleManagementTabChange = (tab: string) => {
    setManagementTab(tab as 'supplier' | 'customer');
  };
  const handleTabChange = (tab: string) => {
    const t = tab as 'ALL' | 'MATERIAL' | 'OUTSOURCE';
    setActiveTab(t);
    setQueryParams((prev) => ({ ...prev, page: 1, supplierType: t === 'ALL' ? undefined : t }));
  };
  const [queryParams, setQueryParams] = useState<FactoryQueryParams>({
    page: 1,
    pageSize: readPageSize(DEFAULT_PAGE_SIZE)
  });

  const [factoryList, setFactoryList] = useState<FactoryType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };
  const [submitLoading, setSubmitLoading] = useState(false);
  const [licenseFileList, setLicenseFileList] = useState<UploadFile[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');
  const [departmentOptions, setDepartmentOptions] = useState<OrganizationUnit[]>([]);
  const [userOptions, setUserOptions] = useState<User[]>([]);

  // 收款账户管理
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountFactory, setAccountFactory] = useState<{ id: string; name: string }>({ id: '', name: '' });

  // 工厂评分卡（悬停懒加载，按工厂名索引）
  const [scorecardMap, setScorecardMap] = useState<Record<string, SupplierScore>>({});
  const [scorecardLoaded, setScorecardLoaded] = useState(false);
  const [scorecardLoading, setScorecardLoading] = useState(false);

  const loadScorecardOnce = useCallback(async () => {
    if (scorecardLoaded || scorecardLoading) return;
    setScorecardLoading(true);
    try {
      const res = await intelligenceApi.getSupplierScorecard();
      const scores: SupplierScore[] = (res as any)?.data?.scores ?? [];
      const m: Record<string, SupplierScore> = {};
      scores.forEach((s) => { m[s.factoryName] = s; });
      setScorecardMap(m);
      setScorecardLoaded(true);
    } catch { /* 静默失败，悬停时显示暂无数据 */ } finally {
      setScorecardLoading(false);
    }
  }, [scorecardLoaded, scorecardLoading]);

  const tierColorMap: Record<string, string> = { S: '#f7a600', A: '#39ff14', B: '#4fc3f7', C: '#ff4136' };

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
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        reportSmartError('供应商列表加载失败', response.message || '服务返回异常，请稍后重试', 'SYSTEM_FACTORY_LIST_FAILED');
        message.error(response.message || '获取供应商列表失败');
      }
    } catch (error: any) {
      reportSmartError('供应商列表加载失败', error?.message || '网络异常或服务不可用，请稍后重试', 'SYSTEM_FACTORY_LIST_EXCEPTION');
      message.error(error?.message || '获取供应商列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = useCallback(async () => {
    try {
      const [deptResult, userResult] = await Promise.all([
        organizationApi.departments(),
        organizationApi.assignableUsers(),
      ]);
      setDepartmentOptions(Array.isArray(deptResult) ? deptResult : []);
      const users = Array.isArray(userResult) ? userResult : [];
      setUserOptions(users);
    } catch (error) {
      console.warn('[FactoryList] fetchData failed', error);
    }
  }, []);

  useEffect(() => {
    if (managementTab !== 'supplier') return;
    fetchFactories();
  }, [managementTab, queryParams]);

  useEffect(() => {
    void fetchDepartments();
  }, [fetchDepartments]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    const factoryName = (params.get('factoryName') || '').trim();
    const factoryCode = (params.get('factoryCode') || '').trim();
    setManagementTab(view === 'customer' ? 'customer' : 'supplier');
    if (factoryName || factoryCode) {
      setQueryParams((prev) => ({
        ...prev,
        page: 1,
        factoryName: factoryName || prev.factoryName,
        factoryCode: factoryCode || prev.factoryCode,
      }));
    }
  }, [location.search]);

  useEffect(() => {
    if (!factoryModal.visible) {
      form.resetFields();
      setLicenseFileList([]);
      return;
    }

    if (dialogMode === 'create') {
      form.setFieldsValue({
        factoryCode: '',
        factoryName: '',
        contactPerson: '',
        contactPhone: '',
        managerId: undefined,
        address: '',
        dailyCapacity: undefined,
        status: 'active',
        supplierType: activeTab === 'ALL' ? 'MATERIAL' : activeTab,
        factoryType: activeTab === 'OUTSOURCE' ? 'EXTERNAL' : 'INTERNAL',
        parentOrgUnitId: undefined,
        businessLicense: undefined,
      });
      setLicenseFileList([]);
      return;
    }

    form.setFieldsValue({
      factoryCode: factoryModal.data?.factoryCode,
      factoryName: factoryModal.data?.factoryName,
      contactPerson: factoryModal.data?.contactPerson,
      contactPhone: factoryModal.data?.contactPhone,
      managerId: factoryModal.data?.managerId,
      address: factoryModal.data?.address,
      dailyCapacity: factoryModal.data?.dailyCapacity,
      status: factoryModal.data?.status || 'inactive',
      supplierType: factoryModal.data?.supplierType || 'MATERIAL',
      factoryType: factoryModal.data?.factoryType || 'INTERNAL',
      parentOrgUnitId: factoryModal.data?.parentOrgUnitId,
      businessLicense: (factoryModal.data as any)?.businessLicense,
    });
    setLicenseFileList(buildImageFileList((factoryModal.data as any)?.businessLicense));
  }, [activeTab, dialogMode, factoryModal.data, factoryModal.visible, form]);

  const openDialog = (mode: DialogMode, factory?: FactoryType) => {
    setDialogMode(mode);
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
    setRemarkModalState({
      open: true,
      title,
      okText,
      okDanger: (okButtonProps as any)?.danger === true,
      onConfirm,
    });
  };

  const handleRemarkConfirm = async (remark: string) => {
    if (!remarkModalState) return;
    setRemarkLoading(true);
    try {
      await remarkModalState.onConfirm(remark);
      setRemarkModalState(null);
    } catch {
      // error already shown inside onConfirm
    } finally {
      setRemarkLoading(false);
    }
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
    {
      title: '供应商名称',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 200,
      ellipsis: true,
      render: (name: string) => {
        const score = scorecardMap[name];
        const tooltipContent = scorecardLoading ? (
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>加载中...</span>
        ) : score ? (
          <div style={{ fontSize: 12, lineHeight: 1.8, minWidth: 160 }}>
            <div style={{ marginBottom: 4 }}>
              <Tag color={tierColorMap[score.tier] ?? '#888'} style={{ fontWeight: 700, fontSize: 12 }}>
                {score.tier}级
              </Tag>
              <span style={{ color: tierColorMap[score.tier] ?? '#ccc', fontWeight: 600 }}>
                综合分 {score.overallScore?.toFixed(1)}
              </span>
            </div>
            <div>准时率：<span style={{ color: score.onTimeRate >= 0.9 ? '#39ff14' : score.onTimeRate >= 0.75 ? '#f7a600' : '#ff4136' }}>{(score.onTimeRate * 100).toFixed(0)}%</span></div>
            <div>质量分：<span style={{ color: score.qualityScore >= 90 ? '#39ff14' : score.qualityScore >= 75 ? '#f7a600' : '#ff4136' }}>{score.qualityScore?.toFixed(1)}</span></div>
            <div>已完成 / 总接单：{score.completedOrders} / {score.totalOrders} 单</div>
            <div>逾期：{score.overdueOrders} 单</div>
          </div>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>暂无评分数据</span>
        );
        return (
          <Tooltip
            title={tooltipContent}
            onOpenChange={(open) => { if (open) void loadScorecardOnce(); }}
            mouseEnterDelay={0.3}
            styles={{ container: { minWidth: 180 } }}
          >
            <span style={{ cursor: 'default', borderBottom: '1px dashed rgba(0,0,0,0.25)', paddingBottom: 1 }}>
              {name}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '归属架构',
      dataIndex: 'orgPath',
      key: 'orgPath',
      width: 260,
      ellipsis: true,
      render: (_: string, record: FactoryType) => record.orgPath || record.parentOrgUnitName || '-',
    },
    {
      title: '内外标签',
      dataIndex: 'factoryType',
      key: 'factoryType',
      width: 110,
      render: (v: string) => {
        if (v === 'INTERNAL') return <Tag color="blue">内部</Tag>;
        if (v === 'EXTERNAL') return <Tag color="purple">外部</Tag>;
        return <Tag>未标记</Tag>;
      },
    },
    {
      title: '类型',
      dataIndex: 'supplierType',
      key: 'supplierType',
      width: 110,
      render: (v: string) => {
        if (v === 'MATERIAL') return <Tag color="blue">面辅料</Tag>;
        if (v === 'OUTSOURCE') return <Tag color="orange">外发厂</Tag>;
        return <Tag>未分类</Tag>;
      },
    },
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
            ...(factory.supplierType === 'OUTSOURCE'
              ? [{
                  key: 'workers',
                  label: '工人管理',
                  title: '工人管理',
                  onClick: () => {
                    const params = new URLSearchParams();
                    if (factory.id) params.set('factoryId', String(factory.id));
                    if (factory.factoryName) params.set('factoryName', factory.factoryName);
                    navigate(`${paths.factoryWorkers}?${params.toString()}`);
                  },
                }]
              : []),
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
        {showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={() => { void fetchFactories(); }} />
          </Card>
        ) : null}
        <div className="page-header">
          <h2 className="page-title">{managementTab === 'customer' ? '客户管理' : '供应商管理'}</h2>
        </div>

        <Tabs
          activeKey={managementTab}
          onChange={handleManagementTabChange}
          items={[
            {
              key: 'supplier',
              label: '供应商管理',
              children: (
                <>
                  <Tabs
                    activeKey={activeTab}
                    onChange={handleTabChange}
                    style={{ marginBottom: 8 }}
                    items={[
                      { key: 'ALL', label: '全部' },
                      { key: 'MATERIAL', label: '面辅料供应商' },
                      { key: 'OUTSOURCE', label: '外发供应商' },
                    ]}
                  />

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
                        <Select
                          placeholder="内外标签"
                          style={{ width: 140 }}
                          allowClear
                          value={String((queryParams as any)?.factoryType || '') || undefined}
                          options={[
                            { value: 'INTERNAL', label: '内部' },
                            { value: 'EXTERNAL', label: '外部' },
                          ]}
                          onChange={(value) => setQueryParams((prev) => ({ ...prev, factoryType: value, page: 1 }))}
                        />
                        <Select
                          placeholder="归属部门"
                          style={{ width: 220 }}
                          allowClear
                          value={String((queryParams as any)?.parentOrgUnitId || '') || undefined}
                          options={departmentOptions.map((item) => ({
                            value: String(item.id || ''),
                            label: getDepartmentLabel(item),
                          }))}
                          onChange={(value) => setQueryParams((prev) => ({ ...prev, parentOrgUnitId: value, page: 1 }))}
                        />
                        <Button type="primary" onClick={() => setQueryParams((prev) => ({ ...prev, page: 1 }))}>
                          查询
                        </Button>
                        <Button
                          onClick={() =>
                            setQueryParams({
                              page: 1,
                              pageSize: queryParams.pageSize,
                              supplierType: activeTab === 'ALL' ? undefined : activeTab,
                            })
                          }
                        >
                          重置
                        </Button>
                      </Space>
                      <Button type="primary" onClick={() => openDialog('create')}>
                        {activeTab === 'OUTSOURCE' ? '新增外发供应商' : '新增面辅料供应商'}
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
                      pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                      onChange: (page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
                    }}
                    stickyHeader
                    scroll={{ x: 'max-content' }}
                  />
                </>
              ),
            },
            {
              key: 'customer',
              label: '客户管理',
              children: <CustomerManagementTab active={managementTab === 'customer'} />,
            },
          ]}
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
          <Form.Item name="supplierType" label="供应商类型" rules={[{ required: true, message: '请选择供应商类型' }]}>
            <Select
              id="supplierType"
              options={[
                { value: 'MATERIAL', label: '面辅料供应商' },
                { value: 'OUTSOURCE', label: '外发供应商' },
              ]}
            />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item
              name="factoryType"
              label={
                <Space size={4}>
                  <span>内外标签</span>
                  <Tooltip
                    title={
                      <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                        <div><strong>内部工厂</strong>：组织内部产能，完成后按人员工序统计工资（<span style={{ color: '#ffd666' }}>工资结算</span>）</div>
                        <div><strong>外部工厂</strong>：外发加工厂，完成后按工厂结算加工费（<span style={{ color: '#95de64' }}>订单结算</span>）</div>
                      </div>
                    }
                  >
                    <QuestionCircleOutlined style={{ color: 'var(--color-text-tertiary, #999)', cursor: 'help' }} />
                  </Tooltip>
                </Space>
              }
              rules={[{ required: true, message: '请选择内外标签' }]}
            >
              <Select
                id="factoryType"
                onChange={(val) => {
                  if (val === 'INTERNAL') {
                    form.setFieldsValue({ contactPerson: '', contactPhone: '' });
                  } else {
                    form.setFieldsValue({ managerId: undefined });
                  }
                }}
                options={[
                  { value: 'INTERNAL', label: '内部工厂（工资结算）' },
                  { value: 'EXTERNAL', label: '外部工厂（订单结算）' }
                ]}
              />
            </Form.Item>
            <Form.Item name="parentOrgUnitId" label="归属部门">
              <Select
                id="parentOrgUnitId"
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder={departmentOptions.length === 0 ? '请先在系统设置中创建部门' : '请选择归属部门'}
                options={departmentOptions.map((item) => ({
                  value: String(item.id || ''),
                  label: getDepartmentLabel(item),
                }))}
              />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="factoryCode" label="供应商编码" rules={[{ required: true, message: '请输入供应商编码' }]}>
              <Input id="factoryCode" placeholder="请输入供应商编码" autoComplete="off" />
            </Form.Item>
            <Form.Item name="factoryName" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
              <Input id="factoryName" placeholder="请输入供应商名称" />
            </Form.Item>
          </div>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item noStyle dependencies={['factoryType']}>
                {({ getFieldValue }) => {
                  const factoryType = getFieldValue('factoryType');
                  const isInternal = factoryType === 'INTERNAL';
                  return (
                    <>
                      {isInternal ? (
                        <Form.Item name="managerId" label="负责人">
                          <Select
                            id="managerId"
                            showSearch
                            optionFilterProp="label"
                            placeholder="选择系统用户"
                            options={userOptions.map(u => ({ label: `${u.name} (${u.phone || '-'})`, value: String(u.id) }))}
                            onChange={(val) => {
                              const user = userOptions.find(u => String(u.id) === val);
                              if (user) {
                                form.setFieldsValue({
                                  contactPerson: user.name,
                                  contactPhone: user.phone,
                                });
                              }
                            }}
                          />
                        </Form.Item>
                      ) : (
                        <Form.Item name="contactPerson" label="联系人">
                          <Input id="contactPerson" placeholder="请输入联系人" />
                        </Form.Item>
                      )}
                      {isInternal && <Form.Item name="contactPerson" hidden><Input id="contactPersonHidden" /></Form.Item>}
                    </>
                  );
                }}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="contactPhone" label="联系电话">
                <Input id="contactPhone" placeholder="请输入联系电话" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="address" label="地址">
                <Input id="address" placeholder="请输入地址" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="dailyCapacity"
            label="日产能（件/天）"
            extra="填写实际日均可生产件数，直接影响排产建议评分的准确性"
          >
            <InputNumber
              id="dailyCapacity"
              min={1}
              max={99999}
              precision={0}
              placeholder="请输入日产能，如：200"
              style={{ width: '100%' }}
              suffix="件/天"
            />
          </Form.Item>
          <Form.Item name="businessLicense" label="营业执照" hidden>
            <Input id="businessLicense" />
          </Form.Item>
          <Form.Item label="营业执照图片">
            <Upload
              id="businessLicenseUpload"
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
          <Form.Item name="remark" label="备注">
            <Input.TextArea id="remark" rows={3} placeholder="请输入备注" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              id="status"
              options={[
                { value: 'active', label: '营业中' },
                { value: 'inactive', label: '停业' },
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
      <RejectReasonModal
        open={remarkModalState?.open === true}
        title={remarkModalState?.title ?? ''}
        okText={remarkModalState?.okText}
        okDanger={remarkModalState?.okDanger ?? false}
        fieldLabel="操作原因"
        placeholder="请输入操作原因（必填）"
        required
        loading={remarkLoading}
        onOk={handleRemarkConfirm}
        onCancel={() => setRemarkModalState(null)}
      />
    </Layout>
  );
};

export default FactoryList;
