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
  onSelect: (role: RoleRecord) => void;
  onEdit: (role: Role) => void;
  onDelete: (id?: string | number) => void;
  onCreate: () => void;
  onOpenTemplate: () => void;
}

/**
 * 左侧角色列表渲染（截图风格：图标+名称+编辑删除）
 */
const RoleListPanel: React.FC<RoleListPanelProps> = ({
  roleList,
  selectedRoleId,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
  onOpenTemplate,
}) => {
  return (
    <div className="role-list-panel">
      <div className="role-list-header">
        <Text strong>职位</Text>
        <Dropdown
          menu={{
            items: [
              { key: 'create', label: '新建职位', onClick: () => onCreate() },
              { key: 'template', label: '从模板创建', onClick: () => onOpenTemplate() },
            ],
          }}
          placement="bottomRight"
        >
          <Button type="primary" size="small">添加</Button>
        </Dropdown>
      </div>
      <div className="role-list-items">
        {roleList.map(role => {
          const isActive = String(role.id) === String(selectedRoleId);
          return (
            <div
              key={String(role.id || role.roleCode)}
              className={`role-list-item${isActive ? ' role-list-item-active' : ''}`}
              onClick={() => { onSelect(role); }}
            >
              <span className="role-list-item-icon" style={{ color: isActive ? '#cf1322' : 'var(--color-text-secondary, #666)' }}>
                {getRoleIcon(String(role.roleName || ''))}
              </span>
              <span className="role-list-item-name">{role.roleName}</span>
              <span className="role-list-item-actions" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined style={{ fontSize: 12 }} />}
                  style={{ color: isActive ? '#cf1322' : 'var(--color-text-secondary, #666)' }}
                  onClick={() => onEdit(role as any)}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                  style={{ color: isActive ? '#cf1322' : 'var(--color-text-secondary, #666)' }}
                  onClick={() => onDelete(role.id)}
                />
              </span>
            </div>
          );
        })}
        {roleList.length === 0 && <Empty description="暂无角色" style={{ padding: '40px 0' }} />}
      </div>
    </div>
  );
};

export default RoleListPanel;
