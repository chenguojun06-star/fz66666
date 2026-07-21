import { useEffect, useRef, useState } from 'react';
import { Form } from 'antd';
import { Role, User as UserType } from '@/types/system';
import api from '@/utils/api';
import tenantService from '@/services/tenantService';
import organizationApi from '@/services/system/organizationApi';
import type { useModal } from '@/hooks';

interface UseUserFormOpsParams {
  user: any;
  isSuperAdmin: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  userModal: ReturnType<typeof useModal<UserType>>;
  modal: any;
  message: any;
  roleOptions: Role[];
  roleOptionsLoading: boolean;
  fetchRoleOptions: () => Promise<void>;
  getUserList: () => Promise<void>;
  setUserList: React.Dispatch<React.SetStateAction<UserType[]>>;
  setPermTree: React.Dispatch<React.SetStateAction<any[]>>;
  setPermCheckedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  openRemarkModal: (title: string, okText: string, okButtonProps: any, onConfirm: (remark: string) => Promise<void>) => void;
}

/**
 * 用户表单与 CRUD 操作子 hook
 * 负责弹窗控制、新增/编辑/状态变更/角色授权/重置密码/在职状态变更
 */
export function useUserFormOps({
  user, isSuperAdmin, form, userModal, modal, message,
  roleOptions, roleOptionsLoading, fetchRoleOptions,
  getUserList, setUserList, setPermTree, setPermCheckedIds, openRemarkModal,
}: UseUserFormOpsParams) {
  const [submitLoading, setSubmitLoading] = useState(false);
  const submitLoadingRef = useRef(false);
  const [activeEditTab, setActiveEditTab] = useState<'base' | 'perm'>('base');
  const [inviteQr, setInviteQr] = useState<{ open: boolean; loading: boolean; qrBase64?: string; expiresAt?: string }>({ open: false, loading: false });

  // ---- 表单 & 弹窗控制 ----
  useEffect(() => {
    if (!userModal.visible) { form.resetFields(); return; }
    if (userModal.data) {
      const next = { ...userModal.data, roleId: String((userModal.data as any).roleId ?? '') };
      const t1 = setTimeout(() => { form.setFieldsValue(next); }, 50);
      return () => clearTimeout(t1);
    }
    form.resetFields();
    const t2 = setTimeout(() => { form.setFieldsValue({ permissionRange: 'all', status: 'active', approvalStatus: 'approved' }); }, 50);
    return () => clearTimeout(t2);
  }, [form, userModal.data, userModal.visible]);

  const openDialog = (editUser?: UserType, initialTab: 'base' | 'perm' = 'base') => {
    setActiveEditTab(initialTab);
    userModal.open(editUser ?? undefined);
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
      if (result?.code === 200 && result?.data?.qrCodeBase64) {
        setInviteQr({ open: true, loading: false, qrBase64: result.data.qrCodeBase64, expiresAt: result.data.expiresAt });
      } else if (result?.code === 200 && result?.data) {
        message.error('生成邀请码失败：微信服务配置异常，无法获取小程序码');
        setInviteQr({ open: false, loading: false });
      } else {
        message.error('生成邀请码失败：' + (result?.message || '未知错误'));
        setInviteQr({ open: false, loading: false });
      }
    } catch {
      message.error('生成邀请码失败');
      setInviteQr({ open: false, loading: false });
    }
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
      } catch (error: unknown) { message.error(error instanceof Error ? error.message : '状态更新失败'); }
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
    if (submitLoadingRef.current) return;
    try {
      const values: any = await form.validateFields();
      const submit = async (remark?: string) => {
        submitLoadingRef.current = true;
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
        } finally { setSubmitLoading(false); submitLoadingRef.current = false; }
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

  const handleResetPassword = (record: UserType) => {
    modal.confirm({
      title: '重置密码',
      content: `确定将「${record.name || record.username}」的密码重置为 123456？重置后该成员需使用新密码重新登录。`,
      okText: '确定重置',
      okButtonProps: { danger: true },
      onOk: async () => {
        await organizationApi.ownerResetMemberPwd(String(record.id));
        message.success('密码已重置为 123456');
      },
    });
  };

  // 快捷变更在职状态（调岗/离职/归档）
  const changeEmploymentStatus = async (record: UserType, nextStatus: 'transferred' | 'resigned' | 'archived') => {
    const statusLabel: Record<typeof nextStatus, string> = {
      transferred: '调岗',
      resigned: '离职',
      archived: '归档',
    };
    openRemarkModal(`确认${statusLabel[nextStatus]}`, '确认', undefined, async (remark) => {
      try {
        const tenantId = record?.tenantId ? Number(record.tenantId) : null;
        const payload: any = {
          id: record.id,
          username: record.username,
          name: record.name,
          employmentStatus: nextStatus,
          operationRemark: remark,
        };
        if (!isSuperAdmin && tenantId) {
          const response = await tenantService.updateSubAccount(Number(record.id), payload);
          const result = response as any;
          if (result.code === 200) {
            message.success(`${statusLabel[nextStatus]}成功`);
            setUserList(prev => prev.map(u => u.id === record.id ? { ...u, employmentStatus: nextStatus } : u));
          } else { message.error(result.message || `${statusLabel[nextStatus]}失败`); }
          return;
        }
        const response = await api.put('/system/user', payload);
        const result = response as any;
        if (result.code === 200) {
          message.success(`${statusLabel[nextStatus]}成功`);
          setUserList(prev => prev.map(u => u.id === record.id ? { ...u, employmentStatus: nextStatus } : u));
        } else { message.error(result.message || `${statusLabel[nextStatus]}失败`); }
      } catch (error: unknown) {
        message.error(error instanceof Error ? error.message : `${statusLabel[nextStatus]}失败`);
      }
    });
  };

  return {
    submitLoading,
    activeEditTab,
    setActiveEditTab,
    inviteQr,
    setInviteQr,
    openDialog,
    closeDialog,
    handleGenerateInvite,
    handleSubmit,
    toggleUserStatus,
    applyRoleToUser,
    handleResetPassword,
    changeEmploymentStatus,
  };
}
