import { useState, useCallback, useEffect } from 'react';
import { App, Form } from 'antd';
import type { User } from '@/types/system';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';

/**
 * 人员新增/编辑/启停/改密 等操作 Hook
 * 拆自原 OrganizationTree/index.tsx（行 127-162, 295-384）
 * @param loadData  刷新数据
 * @param selectedUnitId  当前选中的部门 ID（用于新增人员时预填所属部门）
 */
export function useUserActions(
  loadData: () => Promise<void>,
  selectedUnitId: string | null,
) {
  const { message, modal } = App.useApp();
  const { user } = useUser();

  const [userForm] = Form.useForm();
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userSubmitLoading, setUserSubmitLoading] = useState(false);
  const [roleOptions, setRoleOptions] = useState<any[]>([]);
  const [roleOptionsLoading, setRoleOptionsLoading] = useState(false);

  // 加载角色选项（依赖 user.tenantId）
  useEffect(() => {
    const loadRoles = async () => {
      setRoleOptionsLoading(true);
      try {
        const tenantId = (user as any)?.tenantId ? Number((user as any).tenantId) : null;
        if (tenantId) {
          const res: any = await api.get('/system/role/list', { params: { page: 1, pageSize: 500 } });
          if (res?.code === 200) {
            setRoleOptions(Array.isArray(res.data?.records) ? res.data.records : []);
          }
        }
      } catch { /* ignore */ } finally {
        setRoleOptionsLoading(false);
      }
    };
    void loadRoles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openUserDialog = useCallback((u?: User) => {
    setEditingUser(u ?? null);
    if (u) {
      userForm.setFieldsValue({
        username: u.username,
        name: u.name,
        phone: u.phone,
        email: (u as any).email,
        gender: (u as any).gender,
        status: u.status,
        roleId: String((u as any).roleId || ''),
        employmentStatus: (u as any).employmentStatus,
        hireDate: (u as any).hireDate,
        permissionRange: (u as any).permissionRange,
      });
    } else {
      userForm.resetFields();
      if (selectedUnitId) {
        userForm.setFieldsValue({ orgUnitId: selectedUnitId });
      }
    }
    setUserModalOpen(true);
  }, [userForm, selectedUnitId]);

  const closeUserDialog = useCallback(() => {
    setUserModalOpen(false);
    setEditingUser(null);
    userForm.resetFields();
  }, [userForm]);

  const handleUserSubmit = useCallback(async () => {
    try {
      const values = await userForm.validateFields();
      setUserSubmitLoading(true);
      const payload = { ...values, id: editingUser?.id };
      const res: any = editingUser
        ? await api.put('/system/user', payload)
        : await api.post('/system/user', payload);
      if (res?.code === 200) {
        message.success(editingUser ? '保存成功' : '新增成功');
        closeUserDialog();
        await loadData();
      } else {
        message.error(res?.message || '保存失败');
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setUserSubmitLoading(false);
    }
  }, [editingUser, userForm, closeUserDialog, loadData, message]);

  const handleToggleUserStatus = useCallback(async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'inactive' ? '停用' : '启用';
    try {
      const res: any = await api.put('/system/user', { id: userId, status: newStatus });
      if (res?.code === 200) {
        message.success(`已${action}`);
        await loadData();
      } else {
        message.error(res?.message || `${action}失败`);
      }
    } catch {
      message.error(`${action}失败`);
    }
  }, [loadData, message]);

  const handleResetPassword = useCallback(async (record: User) => {
    modal.confirm({
      width: '30vw',
      title: `重置「${record.name || record.username}」的密码`,
      content: <div>确认重置该用户密码为默认密码？</div>,
      okText: '确认重置',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res: any = await api.post('/system/user/admin-reset-member-pwd', { userId: record.id });
          if (res?.code === 200) {
            message.success('密码已重置');
          } else {
            message.error(res?.message || '重置失败');
          }
        } catch {
          message.error('重置失败');
        }
      },
    });
  }, [modal, message]);

  return {
    userForm,
    userModalOpen,
    editingUser,
    userSubmitLoading,
    roleOptions,
    roleOptionsLoading,
    openUserDialog,
    closeUserDialog,
    handleUserSubmit,
    handleToggleUserStatus,
    handleResetPassword,
  };
}
