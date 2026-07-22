import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Form } from 'antd';
import { Role } from '@/types/system';
import { getErrorMessage } from '@/types/api';
import api, { requestWithPathFallback } from '@/utils/api';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { useModal } from '@/hooks';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { roleTemplateApi } from '@/services/system/roleTemplateApi';
import type { RoleTemplate } from './components/RoleTemplateSelector';
import type { PermissionNode, RoleRecord } from './helpers';
import { buildPermCodeMap, computeSections, countPermNodes, selectAllPerms, deselectAllPerms, togglePermIds } from './utils';
import { useRemarkModal } from './useRemarkModal';
import { useOperationLog } from './useOperationLog';

export function useRoleListData() {
  const { message: appMessage, modal } = App.useApp();
  const [form] = Form.useForm();
  const roleModal = useModal<Role>();

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<RoleTemplate | undefined>();

  const [roleList, setRoleList] = useState<RoleRecord[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleRecord | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const showSystemGuard = useMemo(() => isSmartFeatureEnabled('smart.system.guard.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => { if (!showSmartErrorNotice) return; setSmartError({ title, reason, code }); };

  const [permTree, setPermTree] = useState<PermissionNode[]>([]);
  const [checkedPermIds, setCheckedPermIds] = useState<Set<number>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permKeywordInput, setPermKeywordInput] = useState('');
  const permKeyword = useDebouncedValue(permKeywordInput, 200);
  const [editingRoleName, setEditingRoleName] = useState('');

  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeList, setEmployeeList] = useState<any[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);

  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const remarkModal = useRemarkModal();
  const operationLog = useOperationLog();

  const fetchRoles = useCallback(async () => {
    try {
      const response = await requestWithPathFallback('get', '/system/role/list', '/auth/role/list', undefined, { params: { page: 1, pageSize: 1000 } });
      const result = response as { code?: number; data?: unknown; message?: unknown };
      if (result.code === 200) {
        const data = (result.data as { records?: RoleRecord[]; total?: number }) || {};
        const list = Array.isArray(data.records) ? data.records : [];
        setRoleList(list);
        if (showSmartErrorNotice) setSmartError(null);
        return;
      }
      reportSmartError('角色列表加载失败', String(result.message || '服务返回异常'), 'SYSTEM_ROLE_LIST_FAILED');
      appMessage.error(String(result.message || '获取角色列表失败'));
    } catch (error) {
      reportSmartError('角色列表加载失败', getErrorMessage(error, '网络异常'), 'SYSTEM_ROLE_LIST_EXCEPTION');
      appMessage.error(getErrorMessage(error, '获取角色列表失败'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appMessage, showSmartErrorNotice]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const checkNewTenant = async () => {
    try {
      const res = await roleTemplateApi.checkNewTenant();
      if (res.data?.isNewTenant) {
        setShowSetupGuide(true);
      }
    } catch (e) {
      // 忽略错误
    }
  };

  useEffect(() => {
    checkNewTenant();
  }, []);

  const loadPermTreeAndChecked = useCallback(async (roleId: string) => {
    const rid = String(roleId || '').trim();
    if (!rid) { setPermTree([]); setCheckedPermIds(new Set()); return; }
    setPermLoading(true);
    try {
      const [treeRes, idsRes] = await Promise.all([
        requestWithPathFallback('get', '/system/permission/tree', '/auth/permission/tree'),
        requestWithPathFallback('get', `/system/role/${rid}/permission-ids`, `/auth/role/${rid}/permission-ids`),
      ]);
      const treeResult = treeRes as any;
      const idsResult = idsRes as any;
      if (treeResult.code === 200) setPermTree(Array.isArray(treeResult.data) ? treeResult.data : []);
      else setPermTree([]);
      const idList = (idsResult.code === 200 && Array.isArray(idsResult.data)) ? idsResult.data : [];
      setCheckedPermIds(new Set(idList.map((id: any) => Number(id))));
    } catch { appMessage.error('加载权限失败'); setPermTree([]); setCheckedPermIds(new Set()); }
    finally { setPermLoading(false); }
  }, [appMessage]);

  const [debouncedRoleId, setDebouncedRoleId] = useState<string | null>(null);
  const roleIdDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleRoleSelect = useCallback((role: RoleRecord | null) => {
    setSelectedRole(role);
    setEditingRoleName(role?.roleName || '');
    if (roleIdDebounceTimer.current) clearTimeout(roleIdDebounceTimer.current);
    if (role?.id) {
      roleIdDebounceTimer.current = setTimeout(() => {
        setDebouncedRoleId(String(role.id));
      }, 150);
    } else {
      setDebouncedRoleId(null);
      setPermTree([]); setCheckedPermIds(new Set());
    }
  }, []);

  useEffect(() => {
    if (debouncedRoleId) loadPermTreeAndChecked(debouncedRoleId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRoleId]);

  const permCodeMap = useMemo(() => buildPermCodeMap(permTree), [permTree]);

  const sectionsComputed = useMemo(() => computeSections(permKeyword, permCodeMap, checkedPermIds), [permKeyword, permCodeMap, checkedPermIds]);

  const totalPermCount = useMemo(() => countPermNodes(permTree), [permTree]);

  const savePerms = async () => {
    if (!selectedRole?.id) return;
    remarkModal.openRemarkModal('确认保存', '确认保存', undefined, async (remark) => {
      setPermSaving(true);
      try {
        const nameChanged = editingRoleName.trim() !== '' && editingRoleName.trim() !== selectedRole.roleName;
        if (nameChanged) {
          const rolePayload = { ...selectedRole, roleName: editingRoleName.trim(), operationRemark: remark };
          const roleRes = await requestWithPathFallback('put', '/system/role', '/auth/role', rolePayload);
          const roleResult = roleRes as { code?: number; message?: unknown };
          if (roleResult.code !== 200) {
            appMessage.error(String(roleResult.message || '保存职位名称失败'));
            return;
          }
          setSelectedRole(prev => prev ? { ...prev, roleName: editingRoleName.trim() } : prev);
          setRoleList(prev => prev.map(r => r.id === selectedRole.id ? { ...r, roleName: editingRoleName.trim() } : r));
        }
        const ids = Array.from(checkedPermIds.values());
        const res = await requestWithPathFallback('put', `/system/role/${selectedRole.id}/permission-ids`, `/auth/role/${selectedRole.id}/permission-ids`, { permissionIds: ids, remark });
        const result = res as { code?: number; message?: unknown };
        if (result.code === 200) {
          appMessage.success('保存成功');
        } else appMessage.error(String(result.message || '保存权限失败'));
      } catch { appMessage.error('保存失败'); } finally { setPermSaving(false); }
    });
  };

  const handleSelectAll = () => {
    setCheckedPermIds(selectAllPerms(permTree, checkedPermIds));
  };

  const handleDeselectAll = () => {
    setCheckedPermIds(deselectAllPerms());
  };

  const toggleIds = (ids: number[], selected: boolean) => {
    setCheckedPermIds(togglePermIds(checkedPermIds, ids, selected));
  };

  const openDialog = (role?: Role) => {
    roleModal.open(role ?? undefined);
    form.setFieldsValue({
      roleName: String(role?.roleName || ''),
      roleCode: String(role?.roleCode || ''),
      description: String(role?.description || ''),
      status: role?.status || 'active',
      dataScope: role?.dataScope || 'all',
    });
  };

  const openDialogWithTemplate = (template: RoleTemplate) => {
    roleModal.open(undefined);
    form.setFieldsValue({
      roleName: '',
      roleCode: '',
      description: template.templateDesc || '',
      status: 'active',
      dataScope: template.permissionRange || 'team',
    });
    (form as any).__templateId = template.id;
  };

  const handleApplyTemplate = async (template: RoleTemplate) => {
    setTemplateModalOpen(false);
    try {
      const res: any = await api.post('/role-template/apply', {
        templateId: template.id,
        remark: '应用角色模板',
      });
      if (res?.code === 200) {
        appMessage.success('角色创建成功');
        fetchRoles();
      } else {
        appMessage.error(res?.message || '创建失败');
      }
    } catch (error: unknown) {
      appMessage.error(getErrorMessage(error, '创建失败'));
    }
  };

  const closeDialog = () => { roleModal.close(); form.resetFields(); (form as any).__templateId = undefined; };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const currentRole = roleModal.data;
      const payload: Role = { ...(currentRole || ({} as any)), ...values, status: (values as any)?.status || 'active', dataScope: (values as any)?.dataScope || 'all' };
      const submit = async (remark?: string) => {
        const nextPayload = { ...payload, operationRemark: remark };
        let response;
        if (nextPayload?.id) response = await requestWithPathFallback('put', '/system/role', '/auth/role', nextPayload);
        else response = await requestWithPathFallback('post', '/system/role', '/auth/role', nextPayload);
        const result = response as { code?: number; message?: unknown };
        if (result.code === 200) { appMessage.success('保存成功'); closeDialog(); fetchRoles(); }
        else appMessage.error(String(result.message || '保存失败'));
      };
      if (payload?.id) { remarkModal.openRemarkModal('确认保存', '确认保存', undefined, submit); return; }
      await submit();
    } catch (error: unknown) { appMessage.error(getErrorMessage(error, '保存失败')); }
  };

  const handleDelete = async (id?: string | number) => {
    const rid = String(id ?? '').trim();
    if (!rid) return;
    remarkModal.openRemarkModal('确认删除', '删除', { danger: true }, async (remark) => {
      try {
        const response = await requestWithPathFallback('delete', `/system/role/${rid}`, `/auth/role/${rid}`, undefined, { params: { remark } });
        const result = response as { code?: number; message?: unknown };
        if (result.code === 200) { appMessage.success('删除成功'); fetchRoles(); if (selectedRole?.id === rid) setSelectedRole(null); return; }
        throw new Error(String(result.message || '删除失败'));
      } catch (error: unknown) { appMessage.error(getErrorMessage(error, '删除失败')); throw error; }
    });
  };

  const handleOpenEmployeeList = async () => {
    if (!selectedRole?.id) return;
    setEmployeeModalOpen(true);
    setEmployeeLoading(true);
    try {
      const res = await api.get('/system/user/list', { params: { roleId: selectedRole.id, page: 1, pageSize: 9999 } });
      const result = res as any;
      if (result.code === 200) setEmployeeList(result.data?.records || []);
      else setEmployeeList([]);
    } catch { setEmployeeList([]); }
    finally { setEmployeeLoading(false); }
  };

  const handleRemoveEmployeeFromRole = useCallback(async (userId: string, userName: string) => {
    modal.confirm({
      width: '30vw',
      title: `移除「${userName}」的${selectedRole?.roleName || ''}角色`,
      content: '该员工将失去此角色对应的权限，确认移除？',
      okText: '确认移除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res: any = await api.put('/system/user', { id: userId, roleId: '' });
          if (res?.code === 200) { appMessage.success('已移除角色'); await handleOpenEmployeeList(); }
          else appMessage.error(res?.message || '移除失败');
        } catch { appMessage.error('移除失败'); }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, modal, appMessage]);

  return {
    form,
    roleModal,
    templateModalOpen,
    setTemplateModalOpen,
    selectedTemplate,
    setSelectedTemplate,
    roleList,
    selectedRole,
    smartError,
    showSmartErrorNotice,
    showSystemGuard,
    permTree,
    checkedPermIds,
    permLoading,
    permSaving,
    permKeywordInput,
    setPermKeywordInput,
    permKeyword,
    editingRoleName,
    setEditingRoleName,
    employeeModalOpen,
    setEmployeeModalOpen,
    employeeList,
    employeeLoading,
    logVisible: operationLog.logVisible,
    setLogVisible: operationLog.setLogVisible,
    logLoading: operationLog.logLoading,
    logRecords: operationLog.logRecords,
    setLogRecords: operationLog.setLogRecords,
    logTitle: operationLog.logTitle,
    remarkModalState: remarkModal.remarkModalState,
    setRemarkModalState: remarkModal.setRemarkModalState,
    remarkLoading: remarkModal.remarkLoading,
    showSetupGuide,
    setShowSetupGuide,
    sectionsComputed,
    totalPermCount,
    fetchRoles,
    handleRoleSelect,
    savePerms,
    handleSelectAll,
    handleDeselectAll,
    toggleIds,
    openDialog,
    openDialogWithTemplate,
    handleApplyTemplate,
    closeDialog,
    openRemarkModal: remarkModal.openRemarkModal,
    handleRemarkConfirm: remarkModal.handleRemarkConfirm,
    handleSave,
    handleDelete,
    handleOpenEmployeeList,
    handleRemoveEmployeeFromRole,
    openLogModal: operationLog.openLogModal,
  };
}
