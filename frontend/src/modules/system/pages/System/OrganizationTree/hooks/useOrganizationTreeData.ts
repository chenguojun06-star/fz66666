import { useState, useCallback, useEffect, useMemo } from 'react';
import { App } from 'antd';
import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit, User } from '@/types/system';
import { useUser } from '@/utils/AuthContext';

/** 递归过滤组织树，只保留属于指定工厂的节点（工厂账号数据隔离） */
function filterTreeByFactory(nodes: OrganizationUnit[], factoryId: string): OrganizationUnit[] {
  return nodes.flatMap(node => {
    if (node.factoryId && String(node.factoryId) === factoryId) {
      return [node];
    }
    const filteredChildren = filterTreeByFactory(node.children ?? [], factoryId);
    if (filteredChildren.length > 0) {
      return [{ ...node, children: filteredChildren }];
    }
    return [];
  });
}

/**
 * 供应商管理每创建一个工厂（自有/外协）都会经 syncFactoryNode 在组织树同步一个
 * nodeType=FACTORY 节点（ownerType=OWN/OUTSOURCE/EXTERNAL）。内部组织架构页
 * 只管理内部部门，须将全部 FACTORY 节点连同外部标签部门一起剔除。
 */
function filterInternalNodes(nodes: OrganizationUnit[]): OrganizationUnit[] {
  return nodes.flatMap(node => {
    if (node.nodeType === 'FACTORY' || node.ownerType === 'EXTERNAL') return [];
    const filteredChildren = filterInternalNodes(node.children ?? []);
    return [{ ...node, children: filteredChildren }];
  });
}

export function useOrganizationTreeData() {
  const { message } = App.useApp();
  const { user } = useUser();

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
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '组织架构加载失败');
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
    } catch (e: unknown) {
      message.error('加载用户列表失败：' + (e instanceof Error ? e.message : '请重试'));
      setAssignableUsers([]);
    }
  }, [message]);

  useEffect(() => { void loadData(); }, [loadData]);

  const totalMembers = useMemo(() => {
    return Object.values(membersMap).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  }, [membersMap]);

  /**
   * 工厂账号：仅保留本工厂子树（含其工厂节点），靠 factoryId 隔离，无需再剔外部节点；
   * 租户管理视角：仅显示内部部门，剔除全部 FACTORY 同步节点与外部标签部门。
   */
  const visibleTreeData = useMemo(() => {
    if (isFactoryAccount && currentUserFactoryId) {
      return filterTreeByFactory(treeData, currentUserFactoryId);
    }
    return filterInternalNodes(treeData);
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
