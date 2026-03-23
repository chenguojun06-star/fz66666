import { useState, useCallback, useEffect, useMemo } from 'react';
import { App } from 'antd';
import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit, User } from '@/types/system';
import { useAuth } from '@/utils/AuthContext';

/** 递归过滤组织树，只保留属于指定工厂的节点（工厂账号数据隔离） */
function filterTreeByFactory(nodes: OrganizationUnit[], factoryId: string): OrganizationUnit[] {
  return nodes.flatMap(node => {
    if (node.factoryId && String(node.factoryId) === factoryId) {
      return [node]; // 完整保留该节点及其所有子节点
    }
    const filteredChildren = filterTreeByFactory(node.children ?? [], factoryId);
    if (filteredChildren.length > 0) {
      return [{ ...node, children: filteredChildren }];
    }
    return [];
  });
}

export function useOrganizationTreeData() {
  const { message } = App.useApp();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<OrganizationUnit[]>([]);
  const [treeData, setTreeData] = useState<OrganizationUnit[]>([]);
  const [membersMap, setMembersMap] = useState<Record<string, User[]>>({});
  const [assignableUsers, setAssignableUsers] = useState<User[]>([]);

  const isFactoryAccount = !!(user as any)?.factoryId;
  const currentUserFactoryId = isFactoryAccount ? String((user as any).factoryId) : null;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 关键数据：tree + departments 必须成功
      const [tree, departmentList] = await Promise.all([
        organizationApi.tree(),
        organizationApi.departments(),
      ]);
      setTreeData(Array.isArray(tree) ? tree : []);
      setDepartments(Array.isArray(departmentList) ? departmentList : []);
    } catch (error: any) {
      message.error(error?.message || '组织架构加载失败');
    } finally {
      setLoading(false);
    }
    // 成员数据独立加载，失败不影响主体
    organizationApi.members()
      .then((m) => setMembersMap(m && typeof m === 'object' ? m : {}))
      .catch(() => { /* 静默，成员数据非关键 */ });
  }, [message]);

  // 加载可分配用户（一次性，点开弹窗时刷新）
  const loadAssignableUsers = useCallback(async () => {
    try {
      const users = await organizationApi.assignableUsers();
      setAssignableUsers(Array.isArray(users) ? users : []);
    } catch (e: any) {
      message.error('加载用户列表失败：' + (e?.message || '请重试'));
      setAssignableUsers([]);
    }
  }, [message]);

  useEffect(() => { void loadData(); }, [loadData]);

  const totalMembers = useMemo(() => {
    return Object.values(membersMap).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  }, [membersMap]);

  /** 工厂账号只能看到自己工厂相关的组织节点 */
  const visibleTreeData = useMemo(() => {
    if (!isFactoryAccount || !currentUserFactoryId) return treeData;
    return filterTreeByFactory(treeData, currentUserFactoryId);
  }, [isFactoryAccount, currentUserFactoryId, treeData]);

  // 部门 ID → 名称 快查表
  const unitNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    departments.forEach(d => {
      if (d.id) map[String(d.id)] = d.unitName || '';
    });
    return map;
  }, [departments]);

  return {
    loading,
    treeData,
    visibleTreeData,
    departments,
    membersMap,
    setMembersMap,
    assignableUsers,
    loadData,
    loadAssignableUsers,
    totalMembers,
    unitNameMap,
    isFactoryAccount,
  };
}
