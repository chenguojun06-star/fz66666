import React, { useState, useEffect } from 'react';
import { OrganizationUnit } from '@/types/system';

const DepartmentTree: React.FC<{
  departments: OrganizationUnit[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}> = ({ departments, selectedId, onSelect }) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set<string>();
    const collect = (nodes: OrganizationUnit[]) => {
      for (const n of nodes) {
        if (n.id) ids.add(String(n.id));
        if (n.children?.length) collect(n.children);
      }
    };
    collect(departments);
    setExpandedIds(ids);
  }, [departments]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderNode = (node: OrganizationUnit, depth: number) => {
    const id = String(node.id);
    const isSelected = id === selectedId;
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(id);

    return (
      <div key={id}>
        <div
          className={`user-dept-item${isSelected ? ' user-dept-item-selected' : ''}`}
          style={{ paddingLeft: depth * 16 + 8 }}
        >
          <span
            className="user-dept-chevron"
            onClick={() => hasChildren && toggleExpand(id)}
            style={{ cursor: hasChildren ? 'pointer' : 'default', opacity: hasChildren ? 1 : 0 }}
          >
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="user-dept-name" onClick={() => onSelect(isSelected ? null : id)}>
            {node.unitName}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="user-dept-tree">
      <div
        className={`user-dept-item${!selectedId ? ' user-dept-item-selected' : ''}`}
        style={{ paddingLeft: 8 }}
      >
        <span className="user-dept-chevron" style={{ opacity: 0 }}>▶</span>
        <span className="user-dept-name" onClick={() => onSelect(null)}>
          全部部门
        </span>
      </div>
      {departments.map(node => renderNode(node, 0))}
    </div>
  );
};

export default DepartmentTree;
