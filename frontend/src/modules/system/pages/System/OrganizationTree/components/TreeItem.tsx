import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import {
  DownOutlined,
  RightOutlined,
  BankOutlined,
  ApartmentOutlined,
  QrcodeOutlined,
  UserAddOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { OrganizationUnit } from '@/types/system';

interface TreeItemProps {
  node: OrganizationUnit;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (parent: OrganizationUnit) => void;
  onEdit: (record: OrganizationUnit) => void;
  onDelete: (record: OrganizationUnit) => void;
  onAddMember: (node: OrganizationUnit) => void;
  onShowQRCode: (node: OrganizationUnit) => void;
  /** 工厂账号只读模式：隐藏新增/编辑/删除等操作按钮 */
  readOnly?: boolean;
}

export const TreeItem: React.FC<TreeItemProps> = ({
  node, depth, selectedId, onSelect, onAdd, onEdit, onDelete, onAddMember, onShowQRCode, readOnly,
}) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isSelected = String(node.id) === selectedId;
  const isFactory = node.nodeType === 'FACTORY';
  const isExternal = node.ownerType === 'EXTERNAL';

  return (
    <div>
      <div
        className={`tree-item${isSelected ? ' tree-item-selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        <span
          className="tree-chevron"
          onClick={() => hasChildren && setExpanded(v => !v)}
          style={{ cursor: hasChildren ? 'pointer' : 'default', opacity: hasChildren ? 1 : 0 }}
        >
          {expanded ? <DownOutlined /> : <RightOutlined />}
        </span>
        <span className="tree-node-label" onClick={() => onSelect(String(node.id))}>
          {isFactory
            ? <BankOutlined style={{ color: '#1677ff', marginRight: 4 }} />
            : <ApartmentOutlined style={{ color: '#722ed1', marginRight: 4 }} />
          }
          <span className="tree-node-name">{node.unitName}</span>
        </span>
        <div className="tree-item-actions">
          {!readOnly && (isExternal ? (
            <Tooltip title="注册二维码">
              <Button type="text" size="small" icon={<QrcodeOutlined />}
                onClick={e => { e.stopPropagation(); onShowQRCode(node); }} />
            </Tooltip>
          ) : (
            <Tooltip title="添加成员">
              <Button type="text" size="small" icon={<UserAddOutlined />}
                onClick={e => { e.stopPropagation(); onAddMember(node); }} />
            </Tooltip>
          ))}
          {!readOnly && (!isFactory || isExternal) && (
            <>
              <Tooltip title="新增下级">
                <Button type="text" size="small" icon={<PlusOutlined />}
                  onClick={e => { e.stopPropagation(); onAdd(node); }} />
              </Tooltip>
              <Tooltip title="编辑">
                <Button type="text" size="small" icon={<EditOutlined />}
                  onClick={e => { e.stopPropagation(); onEdit(node); }} />
              </Tooltip>
              <Tooltip title="删除">
                <Button type="text" size="small" danger icon={<DeleteOutlined />}
                  onClick={e => { e.stopPropagation(); onDelete(node); }} />
              </Tooltip>
            </>
          )}
        </div>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children!.map((child: OrganizationUnit) => (
            <TreeItem
              key={child.id ?? child.unitName}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddMember={onAddMember}
              onShowQRCode={onShowQRCode}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
};
