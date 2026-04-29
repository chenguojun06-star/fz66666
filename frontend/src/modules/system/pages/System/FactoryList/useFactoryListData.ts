import { useState, useCallback, useEffect, useMemo } from 'react';
import { App, Form } from 'antd';
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
import { useLocation } from 'react-router-dom';

type DialogMode = 'create' | 'view' | 'edit';
type RemarkModalState = { open: boolean; title: string; okText: string; okDanger: boolean; onConfirm: (remark: string) => Promise<void> };

export function useFactoryListData() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const location = useLocation();
  const factoryModal = useModal<FactoryType>();
  const logModal = useModal();
  const [remarkModalState, setRemarkModalState] = useState<RemarkModalState | null>(null);
  const [remarkLoading, setRemarkLoading] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('view');
  const [managementTab, setManagementTab] = usePersistentState<'supplier' | 'customer'>('factory-list-management-tab', 'supplier');
  const [activeTab, setActiveTab] = usePersistentState<'ALL' | 'MATERIAL' | 'OUTSOURCE'>('factory-list-supplier-tab', 'ALL');

  const [queryParams, setQueryParams] = useState<FactoryQueryParams>({ page: 1, pageSize: readPageSize(DEFAULT_PAGE_SIZE) });
  const [factoryCodeInput, setFactoryCodeInput] = useState('');
  const [factoryNameInput, setFactoryNameInput] = useState('');
  const debouncedFactoryCode = useDebouncedValue(factoryCodeInput, 300);
  const debouncedFactoryName = useDebouncedValue(factoryNameInput, 300);

  useEffect(() => {
    const codeChanged = debouncedFactoryCode !== (queryParams.factoryCode || '');
    const nameChanged = debouncedFactoryName !== (queryParams.factoryName || '');
    if (codeChanged || nameChanged) setQueryParams((prev) => ({ ...prev, factoryCode: debouncedFactoryCode, factoryName: debouncedFactoryName, page: 1 }));
  }, [debouncedFactoryCode, debouncedFactoryName]);

  const [factoryList, setFactoryList] = useState<FactoryType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');
  const [departmentOptions, setDepartmentOptions] = useState<OrganizationUnit[]>([]);
  const [userOptions, setUserOptions] = useState<User[]>([]);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountFactory, setAccountFactory] = useState<{ id: string; name: string }>({ id: '', name: '' });
  const [supplierUserModalOpen, setSupplierUserModalOpen] = useState(false);
  const [supplierUserFactory, setSupplierUserFactory] = useState<{ id: string; name: string }>({ id: '', name: '' });
  const [scorecardMap, setScorecardMap] = useState<Record<string, SupplierScore>>({});
  const [scorecardLoaded, setScorecardLoaded] = useState(false);
  const [scorecardLoading, setScorecardLoading] = useState(false);

  const reportSmartError = (title: string, reason?: string, code?: string) => { if (!showSmartErrorNotice) return; setSmartError({ title, reason, code }); };

  const loadScorecardOnce = useCallback(async () => {
    if (scorecardLoaded || scorecardLoading) return;
    setScorecardLoading(true);
    try { const res = await intelligenceApi.getSupplierScorecard() as ApiResult<{ scores: SupplierScore[] }>; const scores: SupplierScore[] = res?.data?.scores ?? []; const m: Record<string, SupplierScore> = {}; scores.forEach((s) => { m[s.factoryName] = s; }); setScorecardMap(m); setScorecardLoaded(true); } catch { /* 静默失败 */ } finally { setScorecardLoading(false); }
  }, [scorecardLoaded, scorecardLoading]);

  const fetchFactories = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: FactoryType[]; total: number } }>('/system/factory/list', { params: queryParams });
      if (response.code === 200) { setFactoryList(response.data.records || []); setTotal(response.data.total || 0); if (showSmartErrorNotice) setSmartError(null); }
      else { reportSmartError('供应商列表加载失败', response.message || '服务返回异常', 'SYSTEM_FACTORY_LIST_FAILED'); message.error(response.message || '获取供应商列表失败'); }
    } catch (error: unknown) { reportSmartError('供应商列表加载失败', error instanceof Error ? error.message : '网络异常', 'SYSTEM_FACTORY_LIST_EXCEPTION'); message.error(error instanceof Error ? error.message : '获取供应商列表失败'); }
    finally { setLoading(false); }
  }, [queryParams, showSmartErrorNotice, message]);

  const fetchDepartments = useCallback(async () => {
    try { const [deptResult, userResult] = await Promise.all([organizationApi.departments(), organizationApi.assignableUsers()]); setDepartmentOptions(Array.isArray(deptResult) ? deptResult : []); setUserOptions(Array.isArray(userResult) ? userResult : []); } catch (error) { console.warn('[FactoryList] fetchData failed', error); }
  }, []);

  useEffect(() => { if (managementTab !== 'supplier') return; fetchFactories(); }, [managementTab, queryParams, fetchFactories]);
  useEffect(() => { void fetchDepartments(); }, [fetchDepartments]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    const factoryName = (params.get('factoryName') || '').trim();
    const factoryCode = (params.get('factoryCode') || '').trim();
    setManagementTab(view === 'customer' ? 'customer' : 'supplier');
    if (factoryName || factoryCode) setQueryParams((prev) => ({ ...prev, page: 1, factoryName: factoryName || prev.factoryName, factoryCode: factoryCode || prev.factoryCode }));
  }, [location.search, setManagementTab]);

  useEffect(() => {
    if (!factoryModal.visible) { form.resetFields(); return; }
    if (dialogMode === 'create') {
      form.setFieldsValue({ factoryCode: '', factoryName: '', contactPerson: '', contactPhone: '', managerId: undefined, address: '', dailyCapacity: undefined, status: 'active', supplierType: activeTab === 'ALL' ? 'MATERIAL' : activeTab, factoryType: activeTab === 'OUTSOURCE' ? 'EXTERNAL' : 'INTERNAL', parentOrgUnitId: undefined, businessLicense: undefined });
      return;
    }
    form.setFieldsValue({ factoryCode: factoryModal.data?.factoryCode, factoryName: factoryModal.data?.factoryName, contactPerson: factoryModal.data?.contactPerson, contactPhone: factoryModal.data?.contactPhone, managerId: factoryModal.data?.managerId, address: factoryModal.data?.address, dailyCapacity: factoryModal.data?.dailyCapacity, status: factoryModal.data?.status || 'inactive', supplierType: factoryModal.data?.supplierType || 'MATERIAL', factoryType: factoryModal.data?.factoryType || 'INTERNAL', parentOrgUnitId: factoryModal.data?.parentOrgUnitId, businessLicense: (factoryModal.data as any)?.businessLicense });
  }, [activeTab, dialogMode, factoryModal.data, factoryModal.visible, form]);

  const openDialog = useCallback((mode: DialogMode, factory?: FactoryType) => { setDialogMode(mode); factoryModal.open(factory ?? undefined); }, [factoryModal]);
  const closeDialog = useCallback(() => { factoryModal.close(); form.resetFields(); }, [factoryModal, form]);

  const openRemarkModal = useCallback((title: string, okText: string, okButtonProps: any, onConfirm: (remark: string) => Promise<void>) => {
    setRemarkModalState({ open: true, title, okText, okDanger: (okButtonProps as any)?.danger === true, onConfirm });
  }, []);

  const handleRemarkConfirm = useCallback(async (remark: string) => {
    if (!remarkModalState) return;
    setRemarkLoading(true);
    try { await remarkModalState.onConfirm(remark); setRemarkModalState(null); } catch { /* error already shown */ } finally { setRemarkLoading(false); }
  }, [remarkModalState]);

  const openLogModal = useCallback(async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title); logModal.open(); setLogLoading(true);
    try { const res = await api.get('/system/operation-log/list', { params: { bizType, bizId } }); const result = res as any; if (result.code === 200) setLogRecords(Array.isArray(result.data) ? result.data : []); else { message.error(result.message || '获取日志失败'); setLogRecords([]); } }
    catch (e: unknown) { message.error(e instanceof Error ? e.message : '获取日志失败'); setLogRecords([]); } finally { setLogLoading(false); }
  }, [logModal, message]);

  const handleSave = useCallback(async () => {
    const values = await form.validateFields();
    const submit = async (remark?: string) => {
      const payload: unknown = { ...values, status: values.status || 'active', id: factoryModal.data?.id, operationRemark: remark };
      setSubmitLoading(true);
      try { const response = dialogMode === 'edit' ? await api.put<{ code: number; message: string }>('/system/factory', payload) : await api.post<{ code: number; message: string }>('/system/factory', payload); if (response.code === 200) { message.success('保存成功'); closeDialog(); fetchFactories(); } else { message.error(response.message || '保存失败'); } }
      catch (error: unknown) { message.error(error instanceof Error ? error.message : '保存失败'); } finally { setSubmitLoading(false); }
    };
    if (dialogMode === 'edit') { openRemarkModal('确认保存', '确认保存', undefined, submit); return; }
    await submit();
  }, [form, dialogMode, factoryModal.data, message, closeDialog, fetchFactories, openRemarkModal]);

  const handleDelete = useCallback(async (id?: string) => {
    if (!id) return;
    openRemarkModal('确认删除', '删除', { danger: true }, async (remark) => {
      const response = await api.delete<{ code: number; message: string }>(`/system/factory/${id}`, { params: { remark } });
      if (response.code === 200) { message.success('删除成功'); setQueryParams((prev) => ({ ...prev, page: 1 })); return; }
      throw new Error(response.message || '删除失败');
    });
  }, [message, openRemarkModal]);

  return {
    form, factoryModal, logModal, remarkModalState, setRemarkModalState, remarkLoading,
    dialogMode, managementTab, setManagementTab, activeTab, setActiveTab,
    queryParams, setQueryParams, factoryCodeInput, setFactoryCodeInput, factoryNameInput, setFactoryNameInput,
    factoryList, total, loading, smartError, showSmartErrorNotice, submitLoading,
    logLoading, logRecords, logTitle, departmentOptions, userOptions,
    accountModalOpen, setAccountModalOpen, accountFactory, setAccountFactory,
    supplierUserModalOpen, setSupplierUserModalOpen, supplierUserFactory, setSupplierUserFactory,
    scorecardMap, scorecardLoading, loadScorecardOnce,
    openDialog, closeDialog, openRemarkModal, handleRemarkConfirm, openLogModal,
    handleSave, handleDelete, fetchFactories,
    handleTabChange: (tab: string) => { const t = tab as 'ALL' | 'MATERIAL' | 'OUTSOURCE'; setActiveTab(t); setQueryParams((prev) => ({ ...prev, page: 1, supplierType: t === 'ALL' ? undefined : t })); },
    handleManagementTabChange: (tab: string) => setManagementTab(tab as 'supplier' | 'customer'),
  };
}
