import { useState } from 'react';
import { App, Form } from 'antd';
import type { NavigateFunction } from 'react-router-dom';
import { User as UserType } from '@/types/system';
import api from '@/utils/api';
import { RemarkModalState } from '../userListUtils';
import type { useModal } from '@/hooks';
import { useUserFetch } from './useUserFetch';
import { useUserRoleOps } from './useUserRoleOps';
import { useUserFormOps } from './useUserFormOps';

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
  const { message, modal } = App.useApp();
  const canManageUsers = isSuperAdmin || isTenantOwner;

  // ---- 备注弹窗（主 hook 持有，供多子 hook 共享）----
  const [remarkModalState, setRemarkModalState] = useState<RemarkModalState | null>(null);
  const [remarkLoading, setRemarkLoading] = useState(false);
  const openRemarkModal = (title: string, okText: string, okButtonProps: any, onConfirm: (remark: string) => Promise<void>) => {
    setRemarkModalState({ open: true, title, okText, okDanger: (okButtonProps as any)?.danger === true, onConfirm });
  };
  const handleRemarkConfirm = async (remark: string) => {
    if (!remarkModalState) return;
    setRemarkLoading(true);
    try { await remarkModalState.onConfirm(remark); setRemarkModalState(null); } catch { /* error shown inside onConfirm */ } finally { setRemarkLoading(false); }
  };

  // ---- 日志弹窗 ----
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [logTitle, setLogTitle] = useState('操作日志');
  const openLogModal = async (bizType: string, bizId: string, title: string) => {
    setLogTitle(title);
    logModal.open();
    setLogLoading(true);
    try {
      const res = await api.get('/system/operation-log/list', { params: { bizType, bizId } });
      const result = res as any;
      if (result.code === 200) { setLogRecords(Array.isArray(result.data) ? result.data : []); } else { message.error(result.message || '获取日志失败'); setLogRecords([]); }
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '获取日志失败'); setLogRecords([]); } finally { setLogLoading(false); }
  };

  // ---- 子 hook 组合 ----
  const {
    queryParams, setQueryParams, userList, setUserList, total, loading,
    pendingUserCount, smartError, showSmartErrorNotice, getUserList,
  } = useUserFetch({ user, isSuperAdmin, userModalVisible: userModal.visible, message, navigate });

  const {
    roleOptions, roleOptionsLoading,
    permTree, setPermTree, permCheckedIds, setPermCheckedIds, permLoading, permSaving,
    formRules, selectedRoleId, selectedRoleName, permissionsByModule,
    fetchRoleOptions, loadPermTreeAndChecked, savePerms,
  } = useUserRoleOps({ user, isSuperAdmin, form, userModal, message, openRemarkModal });

  const {
    submitLoading, activeEditTab, setActiveEditTab, inviteQr, setInviteQr,
    openDialog, closeDialog, handleGenerateInvite, handleSubmit,
    toggleUserStatus, applyRoleToUser, handleResetPassword, changeEmploymentStatus,
  } = useUserFormOps({
    user, isSuperAdmin, form, userModal, modal, message,
    roleOptions, roleOptionsLoading, fetchRoleOptions,
    getUserList, setUserList, setPermTree, setPermCheckedIds, openRemarkModal,
  });

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
    loadPermTreeAndChecked, handleResetPassword, changeEmploymentStatus,
  };
}
