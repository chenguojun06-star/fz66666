import React from 'react';
import type { OrganizationUnit } from '@/types/system';
import { TreeItem } from './TreeItem';

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

/** 左侧部门树面板 */
const TreePanel: React.FC<TreePanelProps> = ({
  visibleTreeData, selectedUnitId, onSelect, isFactoryAccount,
  onAdd, onEdit, onDelete, onAddMember, onShowQRCode,
  unitMemberCount,
}) => (
  <div className="org-tree-panel" style={{ width: 240 }}>
    {visibleTreeData.map((node) => (
      <TreeItem
        key={node.id ?? node.unitName}
        node={node}
        depth={0}
        selectedId={selectedUnitId}
        onSelect={onSelect}
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
        onAddMember={onAddMember}
        onShowQRCode={onShowQRCode}
        readOnly={isFactoryAccount}
        unitMemberCountMap={unitMemberCount.countMap}
        unitSubUnitsCountMap={unitMemberCount.subUnitsMap}
      />
    ))}
  </div>
);

export default TreePanel;
