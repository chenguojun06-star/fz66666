/**
 * 部门树 — 使用全局 SideCardPanel（岗位管理卡片式标准）
 * 点击已选部门再次点击取消选择；"全部部门"为伪节点
 * D-280：数据兼容两种形态——后端 /departments 返回平铺列表（含子部门，带 parentId），
 * 这里按 parentId 组树后再渲染，保证与组织架构页的层级联动一致
 */
import React, { useMemo } from 'react';
import { ApartmentOutlined, TeamOutlined } from '@ant-design/icons';
import SideCardPanel from '@/components/common/SideCardPanel';
import type { SidePanelNode } from '@/components/common/SideCardPanel';
import { OrganizationUnit } from '@/types/system';

/** 平铺部门列表按 parentId 组树（父节点不在列表内的按根处理；防御环：自身不挂自己） */
const buildDeptTree = (list: OrganizationUnit[]): OrganizationUnit[] => {
  const nodes = (Array.isArray(list) ? list : []).map(u => ({ ...u, children: [] as OrganizationUnit[] }));
  const byId = new Map<string, OrganizationUnit>();
  nodes.forEach(n => {
    if (n.id != null) byId.set(String(n.id), n);
  });
  const roots: OrganizationUnit[] = [];
  nodes.forEach(n => {
    const pid = n.parentId != null ? String(n.parentId) : '';
    const parent = pid ? byId.get(pid) : undefined;
    if (parent && parent !== n) parent.children!.push(n);
    else roots.push(n);
  });
  // 全部挂上了父级（无根，理论不可能）→ 兜底按原顺序平铺，保证不丢节点
  return roots.length ? roots : nodes;
};

const DepartmentTree: React.FC<{
  departments: OrganizationUnit[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}> = ({ departments, selectedId, onSelect }) => {
  const ALL_KEY = '__all__';

  const tree = useMemo(() => buildDeptTree(departments), [departments]);

  const toNode = (node: OrganizationUnit): SidePanelNode => ({
    key: String(node.id),
    title: node.unitName,
    icon: <ApartmentOutlined style={{ color: 'var(--color-accent-purple)' }} />,
    children: node.children?.length ? node.children.map(toNode) : undefined,
  });

  const nodes: SidePanelNode[] = [
    { key: ALL_KEY, title: '全部部门', icon: <TeamOutlined style={{ color: 'var(--color-primary)' }} /> },
    ...tree.map(toNode),
  ];

  return (
    <SideCardPanel
      style={{ width: 240, height: '100%' }}
      headerTitle="部门"
      nodes={nodes}
      activeKey={selectedId == null ? ALL_KEY : String(selectedId)}
      autoExpandOnDataChange
      onSelect={(key) => {
        if (key === ALL_KEY) {
          onSelect(null);
        } else {
          // 与原行为一致：再次点击已选部门取消筛选
          onSelect(String(key) === String(selectedId) ? null : String(key));
        }
      }}
      emptyText="暂无部门"
    />
  );
};

export default DepartmentTree;
