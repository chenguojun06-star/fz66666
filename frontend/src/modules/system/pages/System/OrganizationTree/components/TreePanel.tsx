/**
 * 左侧部门树面板 — 使用全局 SideCardPanel（岗位管理卡片式标准）
 */
import React from 'react';
import { Button, Tooltip } from 'antd';
import {
  ApartmentOutlined, BankOutlined, PlusOutlined,
  QrcodeOutlined, UserAddOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import SideCardPanel from '@/components/common/SideCardPanel';
import type { SidePanelNode } from '@/components/common/SideCardPanel';
import type { OrganizationUnit } from '@/types/system';

interface TreePanelProps {
  visibleTreeData: OrganizationUnit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
  isFactoryAccount: boolean;
  onAdd: (parent: OrganizationUnit) => void;
  onEdit: (record: OrganizationUnit) => void;
  onDelete: (record: OrganizationUnit) => void;
  onAddMember: (node: OrganizationUnit) => void;
  onShowQRCode: (node: OrganizationUnit) => void;
  unitMemberCount: { countMap: Record<string, number>; subUnitsMap: Record<string, number> };
}

const TreePanel: React.FC<TreePanelProps> = ({
  visibleTreeData, selectedUnitId, onSelect, isFactoryAccount,
  onAdd, onEdit, onDelete, onAddMember, onShowQRCode,
  unitMemberCount,
}) => {
  const toNode = (node: OrganizationUnit): SidePanelNode => {
    const totalMembers = unitMemberCount.countMap[String(node.id)] ?? 0;
    const subUnits = unitMemberCount.subUnitsMap[String(node.id)] ?? (node.children?.length || 0);
    const isExternal = node.ownerType === 'EXTERNAL';
    const isFactoryNode = node.nodeType === 'FACTORY';
    const metaParts: string[] = [];
    if (totalMembers > 0) metaParts.push(`${totalMembers} 人`);
    if (subUnits > 0) metaParts.push(`${subUnits} 子部门`);
    if (node.managerUserName) metaParts.push(`审批人 ${node.managerUserName}`);

    return {
      key: String(node.id),
      title: node.unitName,
      icon: isFactoryNode
        ? <BankOutlined style={{ color: 'var(--color-primary)' }} />
        : <ApartmentOutlined style={{ color: 'var(--color-accent-purple)' }} />,
      meta: metaParts.length > 0 ? metaParts.join(' · ') : undefined,
      actions: isFactoryAccount ? undefined : (
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <Tooltip title={isExternal ? '注册二维码' : '添加成员'}>
            <Button
              type="text" size="small"
              icon={isExternal ? <QrcodeOutlined style={{ fontSize: 12 }} /> : <UserAddOutlined style={{ fontSize: 12 }} />}
              onClick={e => { e.stopPropagation(); isExternal ? onShowQRCode(node) : onAddMember(node); }}
            />
          </Tooltip>
          {(!isFactoryNode || isExternal) && (
            <>
              <Tooltip title="新增下级">
                <Button type="text" size="small" icon={<PlusOutlined style={{ fontSize: 12 }} />}
                  onClick={e => { e.stopPropagation(); onAdd(node); }} />
              </Tooltip>
              <Tooltip title="编辑">
                <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 12 }} />}
                  onClick={e => { e.stopPropagation(); onEdit(node); }} />
              </Tooltip>
              <Tooltip title="删除">
                <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                  onClick={e => { e.stopPropagation(); onDelete(node); }} />
              </Tooltip>
            </>
          )}
        </span>
      ),
      children: node.children?.length ? node.children.map(toNode) : undefined,
    };
  };

  return (
    <SideCardPanel
      style={{ width: 240 }}
      headerTitle="组织结构"
      nodes={visibleTreeData.map(toNode)}
      activeKey={selectedUnitId}
      onSelect={(key) => onSelect(String(key))}
      defaultExpandedDepth={2}
      emptyText="暂无组织架构数据"
    />
  );
};

export default TreePanel;
