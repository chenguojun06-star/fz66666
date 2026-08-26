/**
 * 左侧岗位列表 — 使用全局 SideCardPanel（岗位管理卡片式标准）
 */
import React from 'react';
import { Button, Dropdown, Typography } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import SideCardPanel from '@/components/common/SideCardPanel';
import type { SidePanelNode } from '@/components/common/SideCardPanel';
import { Role } from '@/types/system';
import { getRoleIcon } from './helpers';
import type { RoleRecord } from './helpers';

const { Text } = Typography;

interface RoleListPanelProps {
  roleList: RoleRecord[];
  selectedRoleId?: string | number;
  memberCountMap?: Record<string, number>;
  permCountMap?: Record<string, number>;
  totalMembers?: number;
  onSelect: (role: RoleRecord) => void;
  onEdit: (role: Role) => void;
  onDelete: (id?: string | number) => void;
  onCreate: () => void;
  onOpenTemplate: () => void;
}

const RoleListPanel: React.FC<RoleListPanelProps> = ({
  roleList,
  selectedRoleId,
  memberCountMap = {},
  permCountMap = {},
  totalMembers = 0,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
  onOpenTemplate,
}) => {
  const nodes: SidePanelNode[] = roleList.map(role => {
    const rid = String(role.id ?? '');
    const isActive = rid === String(selectedRoleId);
    const memberCount = memberCountMap[rid] ?? 0;
    const permCount = permCountMap[rid] ?? 0;
    return {
      key: rid || String(role.roleCode),
      title: role.roleName,
      icon: getRoleIcon(String(role.roleName || '')),
      meta: `${memberCount} 人 · ${permCount} 权限点`,
      badge: isActive ? <span className="scp-item-badge">当前</span> : undefined,
      actions: !isActive ? (
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined style={{ fontSize: 12 }} />}
            onClick={() => onEdit(role as any)}
          />
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined style={{ fontSize: 12 }} />}
            onClick={() => onDelete(role.id)}
          />
        </span>
      ) : undefined,
    };
  });

  return (
    <SideCardPanel
      style={{ width: 250 }}
      headerTitle={`岗位列表（${roleList.length}）`}
      headerSubtitle={`共 ${totalMembers} 人`}
      headerExtra={
        <Dropdown
          menu={{
            items: [
              { key: 'create', label: '新建岗位', onClick: () => onCreate() },
              { key: 'template', label: '从模板创建', onClick: () => onOpenTemplate() },
            ],
          }}
          placement="bottomRight"
        >
          <Button type="primary" size="small">添加</Button>
        </Dropdown>
      }
      nodes={nodes}
      activeKey={selectedRoleId != null ? String(selectedRoleId) : undefined}
      onSelect={(key) => {
        const role = roleList.find(r => String(r.id ?? '') === key || String(r.roleCode ?? '') === key);
        if (role) onSelect(role);
      }}
      emptyText="暂无岗位"
    />
  );
};

export default RoleListPanel;
