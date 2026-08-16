import React from 'react';
import { Button, Dropdown, Empty, Typography } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
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

/**
 * 左侧岗位列表（卡片式：图标 + 名称 + 人数/权限点指标）
 */
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
  return (
    <div className="role-list-panel">
      <div className="role-list-header">
        <div className="role-list-header-top">
          <Text strong>岗位列表（{roleList.length}）</Text>
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
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>共 {totalMembers} 人</Text>
      </div>
      <div className="role-list-items">
        {roleList.map(role => {
          const rid = String(role.id ?? '');
          const isActive = rid === String(selectedRoleId);
          const memberCount = memberCountMap[rid] ?? 0;
          const permCount = permCountMap[rid] ?? 0;
          return (
            <div
              key={rid || String(role.roleCode)}
              className={`role-card${isActive ? ' role-card-active' : ''}`}
              onClick={() => { onSelect(role); }}
            >
              <div className="role-card-top">
                <span className="role-card-name-wrap">
                  <span className="role-card-icon" style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary, var(--color-gray-dark))' }}>
                    {getRoleIcon(String(role.roleName || ''))}
                  </span>
                  <span className="role-card-name">{role.roleName}</span>
                </span>
                {isActive
                  ? <span className="role-card-current">当前</span>
                  : (
                    <span className="role-card-actions" onClick={(e) => e.stopPropagation()}>
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
                  )}
              </div>
              <div className="role-card-metrics">
                <span>{memberCount} 人</span>
                <span className="role-card-metrics-dot">·</span>
                <span>{permCount} 权限点</span>
              </div>
            </div>
          );
        })}
        {roleList.length === 0 && <Empty description="暂无岗位" style={{ padding: '40px 0' }} />}
      </div>
    </div>
  );
};

export default RoleListPanel;
