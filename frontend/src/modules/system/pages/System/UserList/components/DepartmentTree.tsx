/**
 * 部门树 — 使用全局 SideCardPanel（岗位管理卡片式标准）
 * 点击已选部门再次点击取消选择；"全部部门"为伪节点
 */
import React from 'react';
import { ApartmentOutlined, TeamOutlined } from '@ant-design/icons';
import SideCardPanel from '@/components/common/SideCardPanel';
import type { SidePanelNode } from '@/components/common/SideCardPanel';
import { OrganizationUnit } from '@/types/system';

const DepartmentTree: React.FC<{
  departments: OrganizationUnit[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}> = ({ departments, selectedId, onSelect }) => {
  const ALL_KEY = '__all__';

  const toNode = (node: OrganizationUnit): SidePanelNode => ({
    key: String(node.id),
    title: node.unitName,
    icon: <ApartmentOutlined style={{ color: 'var(--color-accent-purple)' }} />,
    children: node.children?.length ? node.children.map(toNode) : undefined,
  });

  const nodes: SidePanelNode[] = [
    { key: ALL_KEY, title: '全部部门', icon: <TeamOutlined style={{ color: 'var(--color-primary)' }} /> },
    ...departments.map(toNode),
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
