import React, { useState, useCallback, useMemo } from 'react';
import { App, Input } from 'antd';
import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit, User } from '@/types/system';

export function useMemberActions(
  membersMap: Record<string, User[]>,
  setMembersMap: React.Dispatch<React.SetStateAction<Record<string, User[]>>>,
  assignableUsers: User[],
  loadAssignableUsers: () => Promise<void>
) {
  const { message, modal } = App.useApp();

  // 成员分配弹窗状态
  const [assignModal, setAssignModal] = useState<{ open: boolean; node: OrganizationUnit | null }>({ open: false, node: null });
  const [assignSearch, setAssignSearch] = useState('');
  // 批量添加：选中用户ID列表 + loading
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [batchAssignLoading, setBatchAssignLoading] = useState(false);
  // 设为老板操作 loading（存 userId）
  const [setOwnerLoading, setSetOwnerLoading] = useState<string | null>(null);
  // 成员资料 mini 弹窗
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [resetPwdVisible, setResetPwdVisible] = useState(false);
  const [resetPwdLoading, setResetPwdLoading] = useState(false);
  const [resetPwdValue, setResetPwdValue] = useState('');

  const handleResetMemberPwd = useCallback(async () => {
    if (!profileUser?.id) return;
    if (!resetPwdValue || resetPwdValue.length < 6) {
      message.warning('新密码不能少于6位');
      return;
    }
    setResetPwdLoading(true);
    try {
      await organizationApi.adminResetMemberPwd(String(profileUser.id), resetPwdValue);
      message.success('密码已重置');
      setResetPwdVisible(false);
      setResetPwdValue('');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '重置失败');
    } finally {
      setResetPwdLoading(false);
    }
  }, [profileUser, resetPwdValue, message]);

  // 打开分配成员弹窗
  const handleOpenAssign = useCallback(async (node: OrganizationUnit) => {
    setAssignSearch('');
    setBatchSelectedIds([]);
    setAssignModal({ open: true, node });
    await loadAssignableUsers();
  }, [loadAssignableUsers]);

  // 批量分配用户到节点
  const handleBatchAssign = useCallback(async () => {
    if (!assignModal.node?.id || batchSelectedIds.length === 0) {
      message.warning('请勾选要添加的用户');
      return;
    }
    setBatchAssignLoading(true);
    try {
      const count = await organizationApi.batchAssignMembers(batchSelectedIds, String(assignModal.node!.id));
      message.success(`已成功添加 ${count} 名成员`);
      setBatchSelectedIds([]);
      const [m] = await Promise.allSettled([organizationApi.members(), loadAssignableUsers()]);
      if (m.status === 'fulfilled' && m.value && typeof m.value === 'object') {
        setMembersMap(m.value);
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '批量添加失败');
    } finally {
      setBatchAssignLoading(false);
    }
  }, [assignModal.node, batchSelectedIds, message, loadAssignableUsers, setMembersMap]);

  // 移出成员
  const handleRemoveMember = useCallback(async (userId: string, userName: string) => {
    let remarkValue = '';
    modal.confirm({
      width: '30vw',
      title: `移出成员「${userName}」`,
      content: (
        <div>
          <p>该成员将从当前组织节点移出，账号本身不受影响。</p>
          <div style={{ marginTop: 16 }}>
            <span style={{ color: 'red' }}>*</span> 移出原因：
            <Input.TextArea
              id="removeMemberReason"
              rows={3}
              placeholder="请输入移出原因（必填）"
              onChange={e => { remarkValue = e.target.value; }}
            />
          </div>
        </div>
      ),
      okText: '移出',
      okButtonProps: { danger: true, type: 'default' },
      cancelText: '取消',
      onOk: async () => {
        if (!remarkValue.trim()) {
          message.error('请填写移出原因');
          return Promise.reject(new Error('未填写原因'));
        }
        try {
          await organizationApi.removeMember(userId, remarkValue.trim());
          message.success('已移出');
          organizationApi.members().then((m: Record<string, User[]>) => setMembersMap(m && typeof m === 'object' ? m : {})).catch((e) => { console.warn('[OrgTree] 成员列表刷新失败:', e?.message); });
        } catch (error: unknown) {
          message.error(error instanceof Error ? error.message : '移出失败');
        }
      },
    });
  }, [modal, message, setMembersMap]);

  const handleSetFactoryOwner = useCallback(async (user: User) => {
    if (!user.factoryId || !user.id) return;
    setSetOwnerLoading(String(user.id));
    try {
      await organizationApi.setFactoryOwner(String(user.id), String(user.factoryId));
      message.success(`已设置「${user.name || user.username}」为工厂主账号（老板）`);
      organizationApi.members().then((m: Record<string, User[]>) => setMembersMap(m && typeof m === 'object' ? m : {})).catch((e) => { console.warn('[OrgTree] 成员列表刷新失败:', e?.message); });
    } catch (e: unknown) {
      const err = e as { message?: string };
      message.error(err?.message || '设置失败');
    } finally {
      setSetOwnerLoading(null);
    }
  }, [message, setMembersMap]);

  // 当前弹窗节点下的成员 id 集合（用于标注已添加状态，不过滤）
  const currentNodeMemberIds = useMemo(() => {
    if (!assignModal.node?.id) return new Set<string>();
    const members = membersMap[String(assignModal.node.id)] || [];
    return new Set(members.map((u) => String(u.id)));
  }, [assignModal.node, membersMap]);

  // 可供分配的用户列表（显示所有人，按搜索过滤，已在本节点的排在后面）
  const filteredAssignableUsers = useMemo(() => {
    const filtered = assignableUsers.filter((u) => {
      if (!assignSearch.trim()) return true;
      const q = assignSearch.toLowerCase();
      return (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
    });
    // 已在本节点的排到最后
    return [
      ...filtered.filter(u => !currentNodeMemberIds.has(String(u.id))),
      ...filtered.filter(u => currentNodeMemberIds.has(String(u.id))),
    ];
  }, [assignableUsers, currentNodeMemberIds, assignSearch]);

  return {
    assignModal, setAssignModal,
    assignSearch, setAssignSearch,
    batchSelectedIds, setBatchSelectedIds,
    batchAssignLoading,
    setOwnerLoading,
    profileUser, setProfileUser,
    resetPwdVisible, setResetPwdVisible,
    resetPwdLoading,
    resetPwdValue, setResetPwdValue,
    handleResetMemberPwd,
    handleOpenAssign,
    handleBatchAssign,
    handleRemoveMember,
    handleSetFactoryOwner,
    currentNodeMemberIds,
    filteredAssignableUsers,
  };
}
