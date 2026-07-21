import React from 'react';
import { Button, Checkbox, Empty, Input, Spin, Typography } from 'antd';
import type { PermissionNode, RoleRecord } from './helpers';

const { Text } = Typography;

interface PermissionSection {
  title: string;
  items: Array<{ label: string; permNode: PermissionNode | null; sharedWith: string | null; allIds: number[] }>;
  moduleTotal: number;
  moduleChecked: number;
}

interface PermissionMatrixProps {
  selectedRole: RoleRecord | null;
  permLoading: boolean;
  sectionsComputed: PermissionSection[];
  totalPermCount: number;
  checkedPermIds: Set<number>;
  permKeywordInput: string;
  editingRoleName: string;
  permSaving: boolean;
  onPermKeywordChange: (value: string) => void;
  onEditingRoleNameChange: (value: string) => void;
  onToggleIds: (ids: number[], selected: boolean) => void;
  onSavePerms: () => void;
  onOpenEmployeeList: () => void;
}

/**
 * 权限配置面板（右侧）
 * 包含：顶部职位名称编辑栏 + 权限矩阵 Tab
 */
const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  selectedRole,
  permLoading,
  sectionsComputed,
  totalPermCount,
  checkedPermIds,
  permKeywordInput,
  editingRoleName,
  permSaving,
  onPermKeywordChange,
  onEditingRoleNameChange,
  onToggleIds,
  onSavePerms,
  onOpenEmployeeList,
}) => {
  // 空状态
  if (!selectedRole) {
    return (
      <Empty
        description={
          <div style={{ textAlign: 'center' }}>
            <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>请选择一个职位</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>从左侧职位列表中选择，查看或编辑它的权限配置</Text>
          </div>
        }
        style={{ padding: '80px 0' }}
      />
    );
  }

  // 渲染权限矩阵 Tab
  const renderPermTab = () => {
    if (permLoading) return <div style={{ padding: '48px 0', textAlign: 'center' }}><Spin size="large" tip="加载权限中..." /></div>;
    if (!sectionsComputed.length) return <Empty description="暂无可配置权限" style={{ padding: '48px 0' }} />;

    const allIds = sectionsComputed.flatMap(s => s.items.flatMap(it => it.allIds));
    const allChecked = allIds.length > 0 && allIds.every(id => checkedPermIds.has(id));
    const someChecked = allIds.some(id => checkedPermIds.has(id));

    return (
      <div className="perm-matrix-container">
        <div className="perm-matrix-global-header">
          <Checkbox
            checked={allChecked}
            indeterminate={!allChecked && someChecked}
            onChange={(e) => onToggleIds(allIds, e.target.checked)}
          >
            全选
          </Checkbox>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 16 }}>
            已选 <Text strong style={{ color: 'var(--primary-color, var(--color-primary))' }}>{checkedPermIds.size}</Text> / {totalPermCount} 项
          </Text>
          <Input
            value={permKeywordInput}
            onChange={(e) => onPermKeywordChange(e.target.value)}
            placeholder="搜索权限名称"
            style={{ width: 200, marginLeft: 'auto' }}
            allowClear
          />
        </div>
        {sectionsComputed.map((section) => {
          const sectionIds = section.items.flatMap(it => it.allIds);
          const sectionAll = sectionIds.length > 0 && sectionIds.every(id => checkedPermIds.has(id));
          const sectionSome = sectionIds.some(id => checkedPermIds.has(id));
          const singleItem = section.items.length === 1 ? section.items[0] : null;
          const hasPrefix = !!singleItem && singleItem.label !== section.title && !singleItem.sharedWith;

          return (
            <div key={section.title} className="perm-matrix-section">
              <div className="perm-matrix-section-header">
                <Checkbox
                  checked={sectionAll}
                  indeterminate={!sectionAll && sectionSome}
                  onChange={(e) => onToggleIds(sectionIds, e.target.checked)}
                >
                  {section.title}
                </Checkbox>
              </div>
              <div className={`perm-matrix-section-body ${hasPrefix ? 'has-prefix' : ''}`}>
                {hasPrefix && <span className="perm-matrix-section-prefix">{singleItem!.label}：</span>}
                {section.items.map((item) => {
                  if (!item.permNode || item.sharedWith) return null;
                  const nodes = [item.permNode, ...(item.permNode.children || [])].filter(n => n.id != null);
                  return nodes.map((n) => (
                    <span key={String(n.id)} className="perm-matrix-item">
                      <Checkbox
                        checked={checkedPermIds.has(Number(n.id))}
                        onChange={(e) => onToggleIds([Number(n.id)], e.target.checked)}
                      >
                        {n.permissionName}
                      </Checkbox>
                    </span>
                  ));
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="role-perm-title">该职位拥有的权限</div>
      <div className="role-perm-formbar">
        <div className="role-perm-formbar-left">
          <label className="role-perm-required-label">职位名称</label>
          <Input
            value={editingRoleName}
            onChange={(e) => onEditingRoleNameChange(e.target.value)}
            placeholder="请输入职位名称"
            style={{ width: 220 }}
          />
          <Button type="link" onClick={onOpenEmployeeList}>配置员工</Button>
        </div>
        <Button type="primary" onClick={onSavePerms} loading={permSaving}>保存权限</Button>
      </div>
      {renderPermTab()}
    </>
  );
};

export default PermissionMatrix;
