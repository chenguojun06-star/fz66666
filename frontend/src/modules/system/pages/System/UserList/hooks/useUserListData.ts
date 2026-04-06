import { useMemo, useState, useEffect } from 'react';
import { App, Form } from 'antd';
import type { NavigateFunction } from 'react-router-dom';
import { Role, User as UserType, UserQueryParams } from '@/types/system';
import api, { requestWithPathFallback } from '@/utils/api';
import tenantService from '@/services/tenantService';
import { useSync } from '@/utils/syncManager';
import { RemarkModalState, buildFormRules, buildPermissionsByModule } from '../userListUtils';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { readPageSize } from '@/utils/pageSizeStore';
import type { useModal } from '@/hooks';

interface UseUserListDataDeps {
  user: any;
  isSuperAdmin: boolean;
  isTenantOwner: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  userModal: ReturnType<typeof useModal<UserType>>;
  logModal: ReturnType<typeof useModal>;
  navigate: NavigateFunction;
}

export function useUserListData({ user, isSuperAdmin, isTenantOwner, form, userModal, logModal, navigate }: UseUserListDataDeps) {
  const { message } = App.useApp();
  const canManageUsers = isSuperAdmin || isTenantOwner;

  // ---- 数据状态 ----
  const [queryParams, setQueryParams] = useState<UserQueryParams>({ page: 1, pageSize: readPageSize(10) });
  const [userList, setUserList] = useState<UserType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const [activeEditTab, setActiveEditTab] = useState<'base' | 'perm'>('base');
  const [remarkModalState, setRemarkModalState] = useState<RemarkModalState | null>(null);
  const [remarkLoading, setRemarkLoading] = useState(false);
  const [roleOptions, setRoleOptions] = useState<Role[]>([]);
  const [roleOptionsLoading, setRoleOptionsLoading] = useState(false);
  const [permTree, setPermTree] = useState<any[]>([]);
  const [permCheckedIds, setPermCheckedIds] = useState<Set<number>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [pendingUserCount, setPendingUserCount] = useState(0);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');
  const [inviteQr, setInviteQr] = useState<{ open: boolean; loading: boolean; qrBase64?: string; expiresAt?: string }>({ open: false, loading: false });

  const formRules = useMemo(() => buildFormRules(!!userModal.data), [userModal.data]);
  const selectedRoleId = Form.useWatch('roleId', form);
  const selectedRoleName = useMemo(() => {
    const rid = String(selectedRoleId || '').trim();
    if (!rid) return '';
    const hit = roleOptions.find((r) => String(r.id) === rid);
    return hit?.roleName || '';
  }, [roleOptions, selectedRoleId]);
  const permissionsByModule = useMemo(() => buildPermissionsByModule(permTree), [permTree]);

  // ---- 数据加载 ----
  const fetchRoleOptions = async () => {
    setRoleOptionsLoading(true);
    try {
      const tenantId = user?.tenantId ? Number(user.tenantId) : null;
      if (!isSuperAdmin && tenantId) {
        const response = await tenantService.listTenantRoles(tenantId);
        const result = response as any;
        if (result.code === 200) {
          setRoleOptions(Array.isArray(result.data) ? result.data : []);
        } else {
          setRoleOptions([]);
        }
      } else {
        const response = await requestWithPathFallback('get', '/system/role/list', '/auth/role/list', undefined, {
          params: { page: 1, pageSize: 1000 },
        });
        const result = response as any;
        if (result.code === 200) {
          setRoleOptions(Array.isArray(result.data?.records) ? result.data.records : []);
        } else {
          setRoleOptions([]);
        }
      }
    } catch {
      setRoleOptions([]);
    } finally {
      setRoleOptionsLoading(false);
    }
  };

  const fetchPendingUserCount = async () => {
    try {
      const tenantId = user?.tenantId ? Number(user.tenantId) : null;
      if (!isSuperAdmin && tenantId) {
        const response = await tenantService.listPendingRegistrations({ page: 1, pageSize: 1 });
        const result = response as any;
        if (result.code === 200) {
          const count = result.data?.total || 0;
          setPendingUserCount(count);
        }
        return;
      }
      const response = await api.get('/system/user/pending', { params: { page: 1, pageSize: 1 } });
      const result = response as any;
      if (result.code === 200) {
        const count = result.data?.total || 0;
        if (count > pendingUserCount && pendingUserCount > 0) {
          message.info({
            content: `有 ${count - pendingUserCount} 个新用户待审批`,
            duration: 5,
            onClick: () => { navigate('/system/user-approval'); },
          });
        }
        setPendingUserCount(count);
      }
    } catch (error) {
      console.error('获取待审批用户数量失败', error);
    }
  };

  const getUserList = async () => {
    setLoading(true);
    try {
      const tenantId = user?.tenantId ? Number(user.tenantId) : null;
      if (!isSuperAdmin && tenantId) {
        const response = await tenantService.listSubAccounts({
          page: queryParams.page, pageSize: queryParams.pageSize,
          name: queryParams.name, roleName: queryParams.roleName,
        });
        const result = response as any;
        if (result.code === 200) {
          setUserList(result.data?.records || []);
          setTotal(result.data?.total || 0);
          if (showSmartErrorNotice) setSmartError(null);
        } else {
          reportSmartError('用户列表加载失败', result.message || '服务返回异常，请稍后重试', 'SYSTEM_USER_LIST_FAILED');
          message.error(result.message || '获取用户列表失败');
        }
      } else {
        const response = await api.get<{ code: number; data: { records: any[]; total: number } }>('/system/user/list', {
          params: {
            page: queryParams.page, pageSize: queryParams.pageSize,
            username: queryParams.username, name: queryParams.name,
            roleName: queryParams.roleName, status: queryParams.status,
          },
        });
        const result = response as any;
        if (result.code === 200) {
          setUserList(result.data.records || []);
          setTotal(result.data.total || 0);
          if (showSmartErrorNotice) setSmartError(null);
        } else {
          reportSmartError('用户列表加载失败', result.message || '服务返回异常，请稍后重试', 'SYSTEM_USER_LIST_FAILED');
          message.error(result.message || '获取用户列表失败');
        }
      }
    } catch (error: any) {
      reportSmartError('用户列表加载失败', error?.message || '网络异常或服务不可用，请稍后重试', 'SYSTEM_USER_LIST_EXCEPTION');
      message.error(error?.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 用户身份变化时清空旧数据
  const currentUserId = user?.id;
  useEffect(() => { setUserList([]); setTotal(0); }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    getUserList();
    fetchRoleOptions();
    fetchPendingUserCount();
    const interval = setInterval(() => { fetchPendingUserCount(); }, 30000);
    return () => clearInterval(interval);
  }, [queryParams, currentUserId]);

  useSync(
    'user-list',
    async () => {
      try {
        const tenantId = user?.tenantId ? Number(user.tenantId) : null;
        if (!isSuperAdmin && tenantId) {
          const response = await tenantService.listSubAccounts({
            page: queryParams.page, pageSize: queryParams.pageSize,
            name: queryParams.name, roleName: queryParams.roleName,
          });
          if (response.code === 200) {
            return { records: response.data?.records || [], total: response.data?.total || 0 };
          }
          return null;
        }
        const response = await api.get<{ code: number; data: { records: any[]; total: number } }>('/system/user/list', { params: queryParams });
        if (response.code === 200) {
          return { records: response.data.records || [], total: response.data.total || 0 };
        }
        return null;
      } catch (error: any) {
        const status = error?.response?.status || error?.status;
        if (status !== 403) console.error('[实时同步] 获取用户列表失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setUserList(newData.records);
        setTotal(newData.total);
      }
    },
    {
      interval: 60000,
      enabled: !loading && !userModal.visible,
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 用户列表同步错误', error),
    }
  );

  useEffect(() => { fetchRoleOptions(); }, []);

  // ---- 权限管理 ----
  const loadPermTreeAndChecked = async (roleId: string) => {
    const rid = String(roleId || '').trim();
    if (!rid) { setPermTree([]); setPermCheckedIds(new Set()); return; }
    setPermLoading(true);
    try {
      const [treeRes, idsRes] = await Promise.all([
        requestWithPathFallback('get', '/system/permission/tree', '/auth/permission/tree'),
        requestWithPathFallback('get', `/system/role/${rid}/permission-ids`, `/auth/role/${rid}/permission-ids`),
      ]);
      const treeResult = treeRes as any;
      const idsResult = idsRes as any;
      if (treeResult.code === 200) { setPermTree(Array.isArray(treeResult.data) ? treeResult.data : []); } else { setPermTree([]); }
      const idList = (idsResult.code === 200 && Array.isArray(idsResult.data)) ? idsResult.data : [];
      setPermCheckedIds(new Set(idList.map((id: any) => Number(id))));
    } catch {
      message.error('加载权限失败');
      setPermTree([]); setPermCheckedIds(new Set());
    } finally {
      setPermLoading(false);
    }
  };

  const savePerms = async () => {
    const rid = String(selectedRoleId || '').trim();
    if (!rid) { message.error('请先选择角色'); return; }
    openRemarkModal('确认保存权限', '确认保存', undefined, async (remark) => {
      setPermSaving(true);
      try {
        const ids = Array.from(permCheckedIds.values());
        const res = await requestWithPathFallback('put', `/system/role/${rid}/permission-ids`, `/auth/role/${rid}/permission-ids`, { permissionIds: ids, remark });
        const result = res as any;
        if (result.code === 200) { message.success('权限保存成功'); } else { message.error(result.message || '权限保存失败'); }
      } catch { message.error('权限保存失败'); } finally { setPermSaving(false); }
    });
  };

  useEffect(() => {
    if (!userModal.visible) return;
    const rid = String(selectedRoleId || '').trim();
    if (!rid) { setPermTree([]); setPermCheckedIds(new Set()); return; }
    loadPermTreeAndChecked(rid);
  }, [selectedRoleId, userModal.visible]);

  // ---- 表单 & 弹窗控制 ----
  useEffect(() => {
    if (!userModal.visible) { form.resetFields(); return; }
    if (userModal.data) {
      const next = { ...userModal.data, roleId: String((userModal.data as any).roleId ?? '') };
      setTimeout(() => { form.setFieldsValue(next); }, 50);
      return;
    }
    form.resetFields();
    setTimeout(() => { form.setFieldsValue({ permissionRange: 'all', status: 'active', approvalStatus: 'approved' }); }, 50);
  }, [form, userModal.data, userModal.visible]);

  const openDialog = (editUser?: UserType, initialTab: 'base' | 'perm' = 'base') => {
    setActiveEditTab(initialTab);
    userModal.open(editUser || null);
    if (roleOptions.length === 0 && !roleOptionsLoading) fetchRoleOptions();
  };

  const closeDialog = () => {
    userModal.close();
    setActiveEditTab('base');
    setPermTree([]); setPermCheckedIds(new Set());
    form.resetFields();
  };

  const handleGenerateInvite = async () => {
    setInviteQr({ open: true, loading: true });
    try {
      const resp = await api.post('/wechat/mini-program/invite/generate', {});
      const result = resp?.data;
      if (result?.code === 200 && result?.data) {
        setInviteQr({ open: true, loading: false, qrBase64: result.data.qrCodeBase64, expiresAt: result.data.expiresAt });
      } else {
        message.error('生成邀请码失败：' + (result?.message || '未知错误'));
        setInviteQr({ open: false, loading: false });
      }
    } catch {
      message.error('生成邀请码失败');
      setInviteQr({ open: false, loading: false });
    }
  };

  // ---- 备注弹窗 ----
  const openRemarkModal = (title: string, okText: string, okButtonProps: any, onConfirm: (remark: string) => Promise<void>) => {
    setRemarkModalState({ open: true, title, okText, okDanger: (okButtonProps as any)?.danger === true, onConfirm });
  };

  const handleRemarkConfirm = async (remark: string) => {
    if (!remarkModalState) return;
    setRemarkLoading(true);
    try { await remarkModalState.onConfirm(remark); setRemarkModalState(null); } catch { /* error shown inside onConfirm */ } finally { setRemarkLoading(false); }
  };

  // ---- 日志弹窗 ----
  const openLogModal = async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title);
    logModal.open();
    setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', { params: { bizType, bizId } });
      const result = res as any;
      if (result.code === 200) { setLogRecords(Array.isArray(result.data) ? result.data : []); } else { message.error(result.message || '获取日志失败'); setLogRecords([]); }
    } catch (e: any) { message.error(e?.message || '获取日志失败'); setLogRecords([]); } finally { setLogLoading(false); }
  };

  // ---- CRUD 操作 ----
  const toggleUserStatus = async (id: string, currentStatus: UserType['status']) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    openRemarkModal('确认状态变更', '确认', undefined, async (remark) => {
      try {
        const tenantId = user?.tenantId ? Number(user.tenantId) : null;
        if (!isSuperAdmin && tenantId) {
          const response = await tenantService.updateSubAccount(Number(id), { status: newStatus, operationRemark: remark });
          const result = response as any;
          if (result.code === 200) {
            message.success('状态更新成功');
            setUserList(prev => prev.map(u => u.id === id ? { ...u, status: newStatus } : u));
          } else { message.error(result.message || '状态更新失败'); }
          return;
        }
        const response = await api.put('/system/user/status', null, { params: { id, status: newStatus, remark } });
        const result = response as any;
        if (result.code === 200) {
          message.success('状态更新成功');
          setUserList(prev => prev.map(u => u.id === id ? { ...u, status: newStatus } : u));
        } else { message.error(result.message || '状态更新失败'); }
      } catch (error: any) { message.error(error?.message || '状态更新失败'); }
    });
  };

  const applyRoleToUser = async (targetUser: UserType, role: Role) => {
    const uid = String(targetUser.id ?? '').trim();
    const rid = String(role.id ?? '').trim();
    if (!uid || !rid) { message.error('缺少人员或角色信息'); return; }
    openRemarkModal('一键授权', '确定', undefined, async (remark) => {
      const payload: any = {
        id: targetUser.id, username: targetUser.username, name: targetUser.name,
        roleId: Number(role.id), roleName: role.roleName,
        permissionRange: (targetUser as any).permissionRange,
        status: targetUser.status, phone: targetUser.phone, email: targetUser.email,
        operationRemark: remark,
      };
      const tenantId = targetUser?.tenantId ? Number(targetUser.tenantId) : null;
      if (!isSuperAdmin && tenantId) {
        const response = await tenantService.updateSubAccount(Number(uid), payload as any);
        const result = response as any;
        if (result.code === 200) { message.success('授权成功'); getUserList(); return; }
        message.error(result.message || '授权失败'); throw new Error('grant failed');
      }
      const response = await api.put('/system/user', payload);
      const result = response as any;
      if (result.code === 200) { message.success('授权成功'); getUserList(); return; }
      message.error(result.message || '授权失败'); throw new Error('grant failed');
    });
  };

  const handleSubmit = async () => {
    try {
      const values: any = await form.validateFields();
      const submit = async (remark?: string) => {
        setSubmitLoading(true);
        try {
          let response;
          const tenantId = user?.tenantId ? Number(user.tenantId) : null;
          if (!isSuperAdmin && tenantId) {
            if (userModal.data?.id) {
              response = await tenantService.updateSubAccount(Number(userModal.data.id), { ...values, operationRemark: remark || null });
            } else { response = await tenantService.addSubAccount(values); }
          } else if (userModal.data?.id) {
            response = await api.put('/system/user', { ...values, id: userModal.data.id, operationRemark: remark || null });
          } else { response = await api.post('/system/user', values); }
          const result = response as any;
          if (result.code === 200) {
            message.success(userModal.data?.id ? '编辑人员成功' : '新增人员成功');
            closeDialog(); getUserList();
          } else { message.error(result.message || '保存失败'); }
        } finally { setSubmitLoading(false); }
      };
      if (userModal.data?.id) { openRemarkModal('确认保存', '确认保存', undefined, submit); return; }
      await submit();
    } catch (error) {
      if ((error as any).errorFields) {
        const firstError = (error as any).errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else { message.error((error as Error).message || '保存失败'); }
    }
  };

  return {
    // 数据状态
    queryParams, setQueryParams, userList, total, loading, submitLoading,
    smartError, showSmartErrorNotice, canManageUsers,
    activeEditTab, setActiveEditTab,
    remarkModalState, setRemarkModalState, remarkLoading,
    roleOptions, roleOptionsLoading,
    permTree, permCheckedIds, setPermCheckedIds, permLoading, permSaving,
    pendingUserCount,
    logLoading, logRecords, setLogRecords, logTitle,
    inviteQr, setInviteQr,
    formRules, selectedRoleId, selectedRoleName, permissionsByModule,
    // 操作
    getUserList, openDialog, closeDialog, handleGenerateInvite,
    openRemarkModal, handleRemarkConfirm, openLogModal,
    toggleUserStatus, applyRoleToUser, handleSubmit, savePerms,
    loadPermTreeAndChecked,
  };
}
