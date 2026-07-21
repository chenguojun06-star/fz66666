import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Form, message } from 'antd';
import type { ButtonProps } from 'antd';
import { Role } from '@/types/system';
import { getErrorMessage } from '@/types/api';
import api, { requestWithPathFallback } from '@/utils/api';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { useModal } from '@/hooks';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { roleTemplateApi } from '@/services/system/roleTemplateApi';
import type { RoleTemplate } from './components/RoleTemplateSelector';
import { MODULE_SECTIONS } from './helpers';
import type { OperationLog, PermissionNode, RemarkModalState, RoleRecord } from './helpers';

/**
 * 角色列表数据 Hook
 * 包含所有 useState/useEffect/useCallback 与业务处理函数
 */
export function useRoleListData() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const roleModal = useModal<Role>();

  // 角色模板选择弹窗
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
  // 权限搜索词（原始值，用于即时显示）
  const [permKeywordInput, setPermKeywordInput] = useState('');
  // 防抖后的搜索词
  const permKeyword = useDebouncedValue(permKeywordInput, 200);
  // 当前编辑的职位名称（截图风格：顶部直接编辑）
  const [editingRoleName, setEditingRoleName] = useState('');

  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeList, setEmployeeList] = useState<any[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);

  const [logVisible, setLogVisible] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<OperationLog[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');

  const [remarkModalState, setRemarkModalState] = useState<RemarkModalState | null>(null);
  const [remarkLoading, setRemarkLoading] = useState(false);

  // 新租户开户向导
  const [showSetupGuide, setShowSetupGuide] = useState(false);

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
      message.error(String(result.message || '获取角色列表失败'));
    } catch (error) {
      reportSmartError('角色列表加载失败', getErrorMessage(error, '网络异常'), 'SYSTEM_ROLE_LIST_EXCEPTION');
      message.error(getErrorMessage(error, '获取角色列表失败'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, showSmartErrorNotice]);

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
    // 检测是否为新租户
    checkNewTenant();
  }, []);

  // 角色切换时加载权限树（带防抖，防止快速切换）
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
    } catch { message.error('加载权限失败'); setPermTree([]); setCheckedPermIds(new Set()); }
    finally { setPermLoading(false); }
  }, [message]);

  // 防抖后的角色ID
  const [debouncedRoleId, setDebouncedRoleId] = useState<string | null>(null);
  const roleIdDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // 角色切换时延迟加载权限树
  const handleRoleSelect = useCallback((role: RoleRecord | null) => {
    setSelectedRole(role);
    setEditingRoleName(role?.roleName || '');
    if (roleIdDebounceTimer.current) clearTimeout(roleIdDebounceTimer.current);
    if (role?.id) {
      roleIdDebounceTimer.current = setTimeout(() => {
        setDebouncedRoleId(String(role.id));
      }, 150); // 150ms防抖
    } else {
      setDebouncedRoleId(null);
      setPermTree([]); setCheckedPermIds(new Set());
    }
  }, []);

  useEffect(() => {
    if (debouncedRoleId) loadPermTreeAndChecked(debouncedRoleId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRoleId]);

  const permCodeMap = useMemo(() => {
    const map = new Map<string, PermissionNode>();
    const walk = (nodes: PermissionNode[]) => {
      for (const n of nodes) {
        const code = String(n.permissionCode || '').trim();
        if (code) map.set(code, n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(permTree);
    return map;
  }, [permTree]);

  const sectionsComputed = useMemo(() => {
    const kw = String(permKeyword || '').trim().toLowerCase();
    const firstCodeLabel = new Map<string, string>();
    const result = MODULE_SECTIONS.map((section) => {
      const items: Array<{ label: string; permNode: PermissionNode | null; sharedWith: string | null; allIds: number[] }> = [];
      for (const item of section.items) {
        const sharedWith = firstCodeLabel.has(item.code) ? firstCodeLabel.get(item.code)! : null;
        if (!firstCodeLabel.has(item.code)) firstCodeLabel.set(item.code, item.label);
        const node = permCodeMap.get(item.code) || null;
        const childIds: number[] = (!sharedWith && node?.children) ? node.children.filter(c => c.id != null).map(c => Number(c.id)) : [];
        const selfId = node?.id != null && !sharedWith ? [Number(node.id)] : [];
        const allIds = [...selfId, ...childIds];
        items.push({ label: item.label, permNode: node, sharedWith, allIds });
      }
      // 本模块统计
      let moduleTotal = 0;
      let moduleChecked = 0;
      for (const it of items) {
        for (const id of it.allIds) {
          moduleTotal++;
          if (checkedPermIds.has(id)) moduleChecked++;
        }
      }
      return { title: section.title, items, moduleTotal, moduleChecked };
    }).filter(s => s.items.length > 0);
    if (!kw) return result;
    return result.filter(s =>
      s.title.toLowerCase().includes(kw) ||
      s.items.some(it => it.label.toLowerCase().includes(kw) || (it.permNode?.children || []).some((c: PermissionNode) => String(c.permissionName || '').toLowerCase().includes(kw)))
    );
  }, [permKeyword, permCodeMap, checkedPermIds]);

  const totalPermCount = useMemo(() => {
    let total = 0;
    const walk = (nodes: PermissionNode[]) => {
      for (const n of nodes) {
        if (n.id != null) total++;
        if (n.children?.length) walk(n.children);
      }
    };
    walk(permTree);
    return total;
  }, [permTree]);

  const savePerms = async () => {
    if (!selectedRole?.id) return;
    openRemarkModal('确认保存', '确认保存', undefined, async (remark) => {
      setPermSaving(true);
      try {
        // 1. 先保存职位名称（截图风格：顶部输入框直接编辑）
        const nameChanged = editingRoleName.trim() !== '' && editingRoleName.trim() !== selectedRole.roleName;
        if (nameChanged) {
          const rolePayload = { ...selectedRole, roleName: editingRoleName.trim(), operationRemark: remark };
          const roleRes = await requestWithPathFallback('put', '/system/role', '/auth/role', rolePayload);
          const roleResult = roleRes as { code?: number; message?: unknown };
          if (roleResult.code !== 200) {
            message.error(String(roleResult.message || '保存职位名称失败'));
            return;
          }
          setSelectedRole(prev => prev ? { ...prev, roleName: editingRoleName.trim() } : prev);
          setRoleList(prev => prev.map(r => r.id === selectedRole.id ? { ...r, roleName: editingRoleName.trim() } : r));
        }
        // 2. 保存权限
        const ids = Array.from(checkedPermIds.values());
        const res = await requestWithPathFallback('put', `/system/role/${selectedRole.id}/permission-ids`, `/auth/role/${selectedRole.id}/permission-ids`, { permissionIds: ids, remark });
        const result = res as { code?: number; message?: unknown };
        if (result.code === 200) {
          message.success('保存成功');
        } else message.error(String(result.message || '保存权限失败'));
      } catch { message.error('保存失败'); } finally { setPermSaving(false); }
    });
  };

  const handleSelectAll = () => {
    const next = new Set(checkedPermIds);
    const walk = (nodes: PermissionNode[]) => {
      for (const n of nodes) {
        if (n.id != null) next.add(Number(n.id));
        if (n.children?.length) walk(n.children);
      }
    };
    walk(permTree);
    setCheckedPermIds(next);
  };

  const handleDeselectAll = () => {
    setCheckedPermIds(new Set());
  };

  const toggleIds = (ids: number[], selected: boolean) => {
    const next = new Set(checkedPermIds);
    if (selected) ids.forEach(id => next.add(id));
    else ids.forEach(id => next.delete(id));
    setCheckedPermIds(next);
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
    // 保存模板ID到表单外部，供后续使用（如apply接口）
    (form as any).__templateId = template.id;
  };

  // 从模板直接创建角色（调用apply接口）
  const handleApplyTemplate = async (template: RoleTemplate) => {
    setTemplateModalOpen(false);
    try {
      const res: any = await api.post('/role-template/apply', {
        templateId: template.id,
        remark: '应用角色模板',
      });
      if (res?.code === 200) {
        message.success('角色创建成功');
        fetchRoles();
      } else {
        message.error(res?.message || '创建失败');
      }
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '创建失败'));
    }
  };

  const closeDialog = () => { roleModal.close(); form.resetFields(); (form as any).__templateId = undefined; };

  const openRemarkModal = (title: string, okText: string, okButtonProps: ButtonProps | undefined, onConfirm: (remark: string) => Promise<void>) => {
    setRemarkModalState({ open: true, title, okText, okDanger: okButtonProps?.danger === true, onConfirm });
  };

  const handleRemarkConfirm = async (remark: string) => {
    if (!remarkModalState) return;
    setRemarkLoading(true);
    try { await remarkModalState.onConfirm(remark); setRemarkModalState(null); } catch (e) { console.error('[RoleList] 备注确认失败:', e); message.error('操作失败'); } finally { setRemarkLoading(false); }
  };

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
        if (result.code === 200) { message.success('保存成功'); closeDialog(); fetchRoles(); }
        else message.error(String(result.message || '保存失败'));
      };
      if (payload?.id) { openRemarkModal('确认保存', '确认保存', undefined, submit); return; }
      await submit();
    } catch (error: unknown) { message.error(getErrorMessage(error, '保存失败')); }
  };

  const handleDelete = async (id?: string | number) => {
    const rid = String(id ?? '').trim();
    if (!rid) return;
    openRemarkModal('确认删除', '删除', { danger: true }, async (remark) => {
      try {
        const response = await requestWithPathFallback('delete', `/system/role/${rid}`, `/auth/role/${rid}`, undefined, { params: { remark } });
        const result = response as { code?: number; message?: unknown };
        if (result.code === 200) { message.success('删除成功'); fetchRoles(); if (selectedRole?.id === rid) setSelectedRole(null); return; }
        throw new Error(String(result.message || '删除失败'));
      } catch (error: unknown) { message.error(getErrorMessage(error, '删除失败')); throw error; }
    });
  };

  const handleOpenEmployeeList = async () => {
    if (!selectedRole?.id) return;
    setEmployeeModalOpen(true);
    setEmployeeLoading(true);
    try {
      // 使用动态pageSize，确保能获取所有用户
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
          if (res?.code === 200) { message.success('已移除角色'); await handleOpenEmployeeList(); }
          else message.error(res?.message || '移除失败');
        } catch { message.error('移除失败'); }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, modal, message]);

  const openLogModal = async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title); setLogVisible(true); setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', { params: { bizType, bizId } });
      const result = res as { code?: number; data?: unknown; message?: unknown };
      if (result.code === 200) setLogRecords(Array.isArray(result.data) ? (result.data as OperationLog[]) : []);
      else { message.error(String(result.message || '获取日志失败')); setLogRecords([]); }
    } catch (e: unknown) { message.error(getErrorMessage(e, '获取日志失败')); setLogRecords([]); }
    finally { setLogLoading(false); }
  };

  return {
    // form & modals
    form,
    roleModal,
    // state
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
    logVisible,
    setLogVisible,
    logLoading,
    logRecords,
    setLogRecords,
    logTitle,
    remarkModalState,
    setRemarkModalState,
    remarkLoading,
    showSetupGuide,
    setShowSetupGuide,
    // computed
    sectionsComputed,
    totalPermCount,
    // actions
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
    openRemarkModal,
    handleRemarkConfirm,
    handleSave,
    handleDelete,
    handleOpenEmployeeList,
    handleRemoveEmployeeFromRole,
    openLogModal,
  };
}
