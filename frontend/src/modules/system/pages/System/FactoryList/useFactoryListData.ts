import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Form } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { Factory as FactoryType, FactoryQueryParams, OrganizationUnit, User } from '@/types/system';
import api, { type ApiResult } from '@/utils/api';
import { useModal } from '@/hooks';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { usePersistentState } from '@/hooks/usePersistentState';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { SupplierScore } from '@/services/intelligence/intelligenceApi';
import { organizationApi } from '@/services/system/organizationApi';
import { DEFAULT_PAGE_SIZE, readPageSize } from '@/utils/pageSizeStore';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useViewport } from '@/utils/useViewport';
import { paths } from '@/routeConfig';
import { useExtColumns } from '@/hooks/useExtColumns';
import { flattenExtJson, collectExtValues } from '@/components/common/SchemaForm/ExtFieldsSection';
import { getFactoryColumns } from './factoryListColumns';

type DialogMode = 'create' | 'view' | 'edit';

type RemarkModalState = {
  open: boolean;
  title: string;
  okText: string;
  okDanger: boolean;
  onConfirm: (remark: string) => Promise<void>;
};

export function useFactoryListData() {
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
  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  }, [showSmartErrorNotice]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const businessLicenseUrl = Form.useWatch('businessLicense', form) as string | undefined;
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');
  const [departmentOptions, setDepartmentOptions] = useState<OrganizationUnit[]>([]);
  const [userOptions, setUserOptions] = useState<User[]>([]);

  // ===== 字段配置（多租户扩展字段） =====
  const { extColumns, fieldConfigs } = useExtColumns<FactoryType>({ bizType: 'supplier', platform: 'pc' });
  const customFields = useMemo(
    () => fieldConfigs.filter(f => f.isSystem === 0),
    [fieldConfigs]
  );
  const goToFieldConfig = () => {
    navigate(`${paths.fieldConfig}?bizType=supplier`);
  };

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

  // ===== 工厂/供应商统计（用于顶部统计卡片）=====
  const factoryStats = useMemo(() => {
    let materialCount = 0;
    let outsourceCount = 0;
    let internalCount = 0;
    let externalCount = 0;
    let activeCount = 0;
    let inactiveCount = 0;
    let approvedCount = 0;
    let pendingCount = 0;

    factoryList.forEach((f) => {
      const supplierType = String(f.supplierType || '').toUpperCase();
      const factoryType = String(f.factoryType || '').toUpperCase();
      const status = String(f.status || 'active');
      const admissionStatus = String((f as any).admissionStatus || '').toLowerCase();

      if (supplierType === 'MATERIAL') materialCount++;
      if (supplierType === 'OUTSOURCE') outsourceCount++;
      if (factoryType === 'INTERNAL') internalCount++;
      if (factoryType === 'EXTERNAL') externalCount++;

      if (status === 'active') activeCount++;
      else inactiveCount++;

      if (admissionStatus === 'approved') approvedCount++;
      if (admissionStatus === 'pending' || admissionStatus === '') pendingCount++;
    });

    return {
      materialCount,
      outsourceCount,
      internalCount,
      externalCount,
      activeCount,
      inactiveCount,
      approvedCount,
      pendingCount,
    };
  }, [factoryList]);

  // ===== 数据获取 =====
  const fetchFactories = useCallback(async () => {
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
  }, [queryParams, showSmartErrorNotice, reportSmartError, message]);

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
  }, [debouncedFactoryCode, debouncedFactoryName, queryParams.factoryCode, queryParams.factoryName]);

  useEffect(() => {
    if (managementTab !== 'supplier') return;
    fetchFactories();
  }, [managementTab, queryParams, fetchFactories]);

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
  }, [location.search, setManagementTab]);

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
      ...flattenExtJson(factoryModal.data?.extJson),
    });
  }, [activeTab, dialogMode, factoryModal.data, factoryModal.visible, form]);

  // ===== Handlers =====
  const handleManagementTabChange = (tab: string) => setManagementTab(tab as 'supplier' | 'customer');
  const handleTabChange = (tab: string) => {
    const t = tab as 'ALL' | 'MATERIAL' | 'OUTSOURCE';
    setActiveTab(t);
    setQueryParams((prev) => ({ ...prev, page: 1, supplierType: t === 'ALL' ? undefined : t }));
  };

  const openDialog = useCallback((mode: DialogMode, factory?: FactoryType) => {
    setDialogMode(mode);
    factoryModal.open(factory ?? undefined);
  }, [factoryModal]);
  const closeDialog = () => {
    factoryModal.close();
    form.resetFields();
  };

  const openRemarkModal = useCallback((
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
  }, []);
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

  const openLogModal = useCallback(async (bizType: string, bizId: string, title: string) => {
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
  }, [logModal, message]);

  const handleSave = async () => {
    const values = await form.validateFields();
    const submit = async (remark?: string) => {
      const extJson = collectExtValues(form, customFields, { extJson: factoryModal.data?.extJson });
      const payload: unknown = {
        ...values,
        extJson,
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

  const handleDelete = useCallback(async (id?: string) => {
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
  }, [message, openRemarkModal]);

  // ===== Columns =====
  const baseColumns = useMemo(() => getFactoryColumns({
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
  }), [scorecardMap, scorecardLoading, loadScorecardOnce, navigate, handleDelete, openDialog, openLogModal]);

  const columns = useMemo(() => {
    const actionColIndex = baseColumns.findIndex(c => c.key === 'actions');
    if (actionColIndex === -1) {
      return [...baseColumns, ...extColumns] as any;
    }
    const before = baseColumns.slice(0, actionColIndex);
    const actionCol = baseColumns[actionColIndex];
    const after = baseColumns.slice(actionColIndex + 1);
    return [...before, ...extColumns, actionCol, ...after] as any;
  }, [baseColumns, extColumns]);

  return {
    // UI
    isMobile, modalWidth, modalInitialHeight,
    form, businessLicenseUrl,
    // 弹窗
    factoryModal, logModal,
    remarkModalState, setRemarkModalState, remarkLoading,
    dialogMode, setDialogMode,
    // Tabs
    managementTab, activeTab,
    handleManagementTabChange, handleTabChange,
    // 列表
    queryParams, setQueryParams,
    factoryCodeInput, setFactoryCodeInput,
    factoryNameInput, setFactoryNameInput,
    factoryList, total, loading,
    smartError, showSmartErrorNotice, fetchFactories,
    submitLoading,
    logLoading, logRecords, logTitle,
    departmentOptions, userOptions,
    // 字段配置
    extColumns, fieldConfigs, customFields, goToFieldConfig,
    // 日志
    setLogRecords,
    // 收款/账号弹窗
    accountModalOpen, setAccountModalOpen, accountFactory,
    supplierUserModalOpen, setSupplierUserModalOpen, supplierUserFactory,
    // 评分
    scorecardMap, scorecardLoading, loadScorecardOnce,
    // 统计
    factoryStats,
    // 列
    columns,
    // Handlers
    openDialog, closeDialog,
    handleRemarkConfirm,
    openLogModal, handleSave, handleDelete,
  };
}
