import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import PaymentAccountManager from '@/components/common/PaymentAccountManager';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { Factory as FactoryType, FactoryQueryParams, OrganizationUnit, User } from '@/types/system';
import api, { type ApiResult } from '@/utils/api';
import { useModal } from '@/hooks';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { App, Card, Form, Tabs } from 'antd';
import { useViewport } from '@/utils/useViewport';
import { useLocation, useNavigate } from 'react-router-dom';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { SupplierScore } from '@/services/intelligence/intelligenceApi';
import { organizationApi } from '@/services/system/organizationApi';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, readPageSize } from '@/utils/pageSizeStore';
import { usePersistentState } from '@/hooks/usePersistentState';
import CustomerManagementTab from './CustomerManagementTab';
import SupplierUserManager from './SupplierUserManager';
import { getFactoryColumns, logColumns } from './factoryListColumns';
import FactoryFormModal from './components/FactoryFormModal';
import FactoryFilterBar from './components/FactoryFilterBar';

type DialogMode = 'create' | 'view' | 'edit';

type RemarkModalState = {
  open: boolean;
  title: string;
  okText: string;
  okDanger: boolean;
  onConfirm: (remark: string) => Promise<void>;
};

const FactoryList: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { isMobile, modalWidth } = useViewport();
  const location = useLocation();
  const navigate = useNavigate();

  // ===== 弹窗 =====
  const factoryModal = useModal<FactoryType>();
  const logModal = useModal();
  const [remarkModalState, setRemarkModalState] = useState<RemarkModalState | null>(null);
  const [remarkLoading, setRemarkLoading] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('view');

  // ===== Tabs 状态 =====
  const [managementTab, setManagementTab] = usePersistentState<'supplier' | 'customer'>('factory-list-management-tab', 'supplier');
  const [activeTab, setActiveTab] = usePersistentState<'ALL' | 'MATERIAL' | 'OUTSOURCE'>('factory-list-supplier-tab', 'ALL');

  // ===== 列表数据 =====
  const [queryParams, setQueryParams] = useState<FactoryQueryParams>({
    page: 1,
    pageSize: readPageSize(DEFAULT_PAGE_SIZE),
  });
  const [factoryCodeInput, setFactoryCodeInput] = useState('');
  const [factoryNameInput, setFactoryNameInput] = useState('');
  const debouncedFactoryCode = useDebouncedValue(factoryCodeInput, 300);
  const debouncedFactoryName = useDebouncedValue(factoryNameInput, 300);
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
  const businessLicenseUrl = Form.useWatch('businessLicense', form) as string | undefined;
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');
  const [departmentOptions, setDepartmentOptions] = useState<OrganizationUnit[]>([]);
  const [userOptions, setUserOptions] = useState<User[]>([]);

  // 收款账户 / 供应商账号 弹窗
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountFactory, setAccountFactory] = useState<{ id: string; name: string }>({ id: '', name: '' });
  const [supplierUserModalOpen, setSupplierUserModalOpen] = useState(false);
  const [supplierUserFactory, setSupplierUserFactory] = useState<{ id: string; name: string }>({ id: '', name: '' });

  // 评分卡（懒加载）
  const [scorecardMap, setScorecardMap] = useState<Record<string, SupplierScore>>({});
  const [scorecardLoaded, setScorecardLoaded] = useState(false);
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const loadScorecardOnce = useCallback(async () => {
    if (scorecardLoaded || scorecardLoading) return;
    setScorecardLoading(true);
    try {
      const res = await intelligenceApi.getSupplierScorecard() as ApiResult<{ scores: SupplierScore[] }>;
      const scores: SupplierScore[] = res?.data?.scores ?? [];
      const m: Record<string, SupplierScore> = {};
      scores.forEach((s) => { m[s.factoryName] = s; });
      setScorecardMap(m);
      setScorecardLoaded(true);
    } catch { /* 静默失败 */ } finally {
      setScorecardLoading(false);
    }
  }, [scorecardLoaded, scorecardLoading]);

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  // ===== 数据获取 =====
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
    } catch (error: unknown) {
      reportSmartError('供应商列表加载失败', error instanceof Error ? error.message : '网络异常或服务不可用，请稍后重试', 'SYSTEM_FACTORY_LIST_EXCEPTION');
      message.error(error instanceof Error ? error.message : '获取供应商列表失败');
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
      setUserOptions(Array.isArray(userResult) ? userResult : []);
    } catch (error) {
      console.warn('[FactoryList] fetchData failed', error);
    }
  }, []);

  // ===== Effects =====
  useEffect(() => {
    const codeChanged = debouncedFactoryCode !== (queryParams.factoryCode || '');
    const nameChanged = debouncedFactoryName !== (queryParams.factoryName || '');
    if (codeChanged || nameChanged) {
      setQueryParams((prev) => ({ ...prev, factoryCode: debouncedFactoryCode, factoryName: debouncedFactoryName, page: 1 }));
    }
  }, [debouncedFactoryCode, debouncedFactoryName]);

  useEffect(() => {
    if (managementTab !== 'supplier') return;
    fetchFactories();
  }, [managementTab, queryParams]);

  useEffect(() => { void fetchDepartments(); }, [fetchDepartments]);

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
  }, [activeTab, dialogMode, factoryModal.data, factoryModal.visible, form]);

  // ===== Handlers =====
  const handleManagementTabChange = (tab: string) => setManagementTab(tab as 'supplier' | 'customer');
  const handleTabChange = (tab: string) => {
    const t = tab as 'ALL' | 'MATERIAL' | 'OUTSOURCE';
    setActiveTab(t);
    setQueryParams((prev) => ({ ...prev, page: 1, supplierType: t === 'ALL' ? undefined : t }));
  };

  const openDialog = (mode: DialogMode, factory?: FactoryType) => {
    setDialogMode(mode);
    factoryModal.open(factory ?? undefined);
  };
  const closeDialog = () => {
    factoryModal.close();
    form.resetFields();
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
      const res = await api.get('/system/operation-log/list', { params: { bizType, bizId } });
      const result = res as any;
      if (result.code === 200) {
        setLogRecords(Array.isArray(result.data) ? result.data : []);
      } else {
        message.error(result.message || '获取日志失败');
        setLogRecords([]);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '获取日志失败');
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
      } catch (error: unknown) {
        message.error(error instanceof Error ? error.message : '保存失败');
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

  // ===== Columns =====
  const columns = useMemo(() => getFactoryColumns({
    openDialog,
    handleDelete,
    openLogModal,
    setAccountFactory,
    setAccountModalOpen,
    setSupplierUserFactory,
    setSupplierUserModalOpen,
    loadScorecardOnce,
    scorecardMap,
    scorecardLoading,
    navigate,
  }), [scorecardMap, scorecardLoading, loadScorecardOnce, navigate]);

  return (
    <>
      <PageLayout
        title={managementTab === 'customer' ? '客户管理' : '供应商管理'}
        headerContent={showSmartErrorNotice && smartError ? (
          <Card style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={() => { void fetchFactories(); }} />
          </Card>
        ) : null}
      >
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
                  <FactoryFilterBar
                    queryParams={queryParams}
                    setQueryParams={setQueryParams}
                    setFactoryCodeInput={setFactoryCodeInput}
                    setFactoryNameInput={setFactoryNameInput}
                    departmentOptions={departmentOptions}
                    activeTab={activeTab}
                    onCreate={() => openDialog('create')}
                  />
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
      </PageLayout>

      <FactoryFormModal
        open={factoryModal.visible}
        mode={dialogMode}
        form={form}
        submitLoading={submitLoading}
        modalWidth={modalWidth}
        isMobile={isMobile}
        initialHeight={modalInitialHeight}
        departmentOptions={departmentOptions}
        userOptions={userOptions}
        businessLicenseUrl={businessLicenseUrl}
        onCancel={closeDialog}
        onOk={handleSave}
      />

      <ResizableModal
        open={logModal.visible}
        title={logTitle}
        onCancel={() => { logModal.close(); setLogRecords([]); }}
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

      <PaymentAccountManager
        open={accountModalOpen}
        ownerType="FACTORY"
        ownerId={accountFactory.id}
        ownerName={accountFactory.name}
        onClose={() => setAccountModalOpen(false)}
      />

      <SupplierUserManager
        open={supplierUserModalOpen}
        supplierId={supplierUserFactory.id}
        supplierName={supplierUserFactory.name}
        onClose={() => setSupplierUserModalOpen(false)}
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
    </>
  );
};

export default FactoryList;
