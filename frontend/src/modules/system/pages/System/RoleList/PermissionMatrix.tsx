import React from 'react';
import { Button, Checkbox, Empty, Input, Radio, Spin, Table, Tag, Typography } from 'antd';
import type { PermissionNode, RoleRecord } from './helpers';

const { Text } = Typography;

interface PermissionSection {
  title: string;
  items: Array<{ label: string; permNode: PermissionNode | null; buttons: PermissionNode[]; sharedWith: string | null; allIds: number[] }>;
  moduleTotal: number;
  moduleChecked: number;
}

interface MemberPreviewRecord {
  id?: string;
  name?: string;
  employeeNo?: string;
  orgUnitName?: string;
  status?: string;
}

/** 数据权限 4 级（与后端 Role.dataScope 对齐） */
const DATA_SCOPE_OPTIONS = [
  { value: 'all', label: '全部数据', desc: '可查看租户内全部业务数据' },
  { value: 'department', label: '本部门数据', desc: '仅可查看所属部门及其下属的数据' },
  { value: 'team', label: '本团队数据', desc: '仅可查看所属团队产生的数据' },
  { value: 'own', label: '仅本人数据', desc: '仅可查看自己创建或负责的数据' },
];

interface PermissionMatrixProps {
  selectedRole: RoleRecord | null;
  permLoading: boolean;
  sectionsComputed: PermissionSection[];
  totalPermCount: number;
  checkedPermIds: Set<number>;
  permKeywordInput: string;
  editingRoleName: string;
  editingDataScope: string;
  permSaving: boolean;
  memberCount: number;
  membersPreview: MemberPreviewRecord[];
  membersPreviewLoading: boolean;
  onPermKeywordChange: (value: string) => void;
  onEditingRoleNameChange: (value: string) => void;
  onEditingDataScopeChange: (value: string) => void;
  onToggleIds: (ids: number[], selected: boolean) => void;
  onSavePerms: () => void;
  onOpenEmployeeList: () => void;
}

/** 关联人员预览表列（工号/姓名/团队/状态） */
const MEMBER_PREVIEW_COLUMNS = [
  { title: '工号', dataIndex: 'employeeNo', key: 'employeeNo', width: 110, render: (v: string) => v ? <Text code style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">-</Text> },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
  { title: '团队', dataIndex: 'orgUnitName', key: 'orgUnitName', ellipsis: true, render: (v: string) => v || '-' },
  {
    title: '状态', dataIndex: 'status', key: 'status', width: 90,
    render: (v: string) => v === 'inactive'
      ? <Tag color="warning">停用</Tag>
      : <Tag color="success">在职</Tag>,
  },
];

/**
 * 权限配置面板（右侧）
 * 布局：顶部职位信息栏 + 双栏权限区（菜单权限 | 数据权限）+ 底部关联人员表格
 */
const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  selectedRole,
  permLoading,
  sectionsComputed,
  totalPermCount,
  checkedPermIds,
  permKeywordInput,
  editingRoleName,
  editingDataScope,
  permSaving,
  memberCount,
  membersPreview,
  membersPreviewLoading,
  onPermKeywordChange,
  onEditingRoleNameChange,
  onEditingDataScopeChange,
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
            <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>请选择一个岗位</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>从左侧岗位列表中选择，查看或编辑它的权限配置</Text>
          </div>
        }
        style={{ padding: '80px 0' }}
      />
    );
  }

  // 渲染菜单权限卡片
  const renderPermCard = () => {
    if (permLoading) return <div style={{ padding: '48px 0', textAlign: 'center' }}><Spin size="large" /></div>;
    if (!sectionsComputed.length) return <Empty description="暂无可配置权限" style={{ padding: '48px 0' }} />;

    const allIds = sectionsComputed.flatMap(s => s.items.flatMap(it => it.allIds));
    const allChecked = allIds.length > 0 && allIds.every(id => checkedPermIds.has(id));
    const someChecked = allIds.some(id => checkedPermIds.has(id));

    return (
      <>
        <div className="perm-matrix-global-header">
          <Checkbox
            checked={allChecked}
            indeterminate={!allChecked && someChecked}
            onChange={(e) => onToggleIds(allIds, e.target.checked)}
          >
            全选
          </Checkbox>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 16 }}>
            已选 <Text strong style={{ color: 'var(--color-primary)' }}>{checkedPermIds.size}</Text> / {totalPermCount} 项
          </Text>
          <Input
            value={permKeywordInput}
            onChange={(e) => onPermKeywordChange(e.target.value)}
            placeholder="搜索权限名称"
            style={{ width: 160, marginLeft: 'auto' }}
            allowClear
            size="small"
          />
        </div>
        {sectionsComputed.map((section) => {
          const sectionIds = section.items.flatMap(it => it.allIds);
          const sectionAll = sectionIds.length > 0 && sectionIds.every(id => checkedPermIds.has(id));
          const sectionSome = sectionIds.some(id => checkedPermIds.has(id));

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
              <div className="perm-matrix-section-body">
                {section.items.map((item) => {
                  if (!item.permNode || item.sharedWith) return null;
                  const btnIds = item.buttons.map(b => Number(b.id));
                  const nodeChecked = checkedPermIds.has(Number(item.permNode.id));
                  const btnCheckedCount = btnIds.filter(id => checkedPermIds.has(id)).length;
                  const groupAll = nodeChecked && btnIds.length > 0 && btnCheckedCount === btnIds.length;
                  const groupSome = !groupAll && (nodeChecked || btnCheckedCount > 0);
                  // 单子模块且名称与主模块相同时（如 客户管理/应用商店），头部勾选框已覆盖子模块权限本身，
                  // 不再重复渲染一行同名子模块，只展示其按钮
                  const singleDupe = section.items.length === 1 && item.label === section.title;
                  return (
                    <div key={item.label} className="perm-matrix-item-group">
                      {!singleDupe && (
                        <div className="perm-matrix-item-head">
                          <Checkbox
                            checked={groupAll}
                            indeterminate={groupSome}
                            onChange={(e) => onToggleIds([Number(item.permNode!.id), ...btnIds], e.target.checked)}
                          >
                            {item.label}
                          </Checkbox>
                        </div>
                      )}
                      {item.buttons.length > 0 && (
                        <div className="perm-matrix-item-btns">
                          {item.buttons.map((b) => (
                            <span key={String(b.id)} className="perm-matrix-item">
                              <Checkbox
                                checked={checkedPermIds.has(Number(b.id))}
                                onChange={(e) => onToggleIds([Number(b.id)], e.target.checked)}
                              >
                                {b.permissionName}
                              </Checkbox>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <>
      <div className="role-perm-title">
        <div className="role-perm-title-left">
          <span className="role-perm-title-name">{selectedRole.roleName}</span>
          <span className="role-perm-title-sub">权限配置（{memberCount} 人受影响）</span>
        </div>
        <Button type="primary" onClick={onSavePerms} loading={permSaving}>保存</Button>
      </div>
      <div className="role-perm-formbar">
        <div className="role-perm-formbar-left">
          <label className="role-perm-required-label">岗位名称</label>
          <Input
            value={editingRoleName}
            onChange={(e) => onEditingRoleNameChange(e.target.value)}
            placeholder="请输入岗位名称"
            style={{ width: 220 }}
          />
          <Button type="link" onClick={onOpenEmployeeList}>配置员工</Button>
        </div>
      </div>
      <div className="role-perm-body">
        <div className="role-perm-dual">
          <div className="role-perm-card role-perm-card-menu">
            <div className="role-perm-card-header">
              <Text strong style={{ fontSize: 14 }}>菜单权限</Text>
            </div>
            <div className="role-perm-card-scroll perm-matrix-container">
              {renderPermCard()}
            </div>
          </div>
          <div className="role-perm-card role-perm-card-scope">
            <div className="role-perm-card-header">
              <Text strong style={{ fontSize: 14 }}>数据权限（4 级）</Text>
            </div>
            <div className="role-perm-card-scroll">
              <Radio.Group
                value={editingDataScope}
                onChange={(e) => onEditingDataScopeChange(e.target.value)}
                className="data-scope-group"
              >
                {DATA_SCOPE_OPTIONS.map(opt => (
                  <Radio key={opt.value} value={opt.value} className="data-scope-item">
                    <span className="data-scope-item-label">{opt.label}</span>
                    <span className="data-scope-item-desc">{opt.desc}</span>
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          </div>
        </div>
        <div className="role-perm-card role-perm-card-members">
          <div className="role-perm-card-header">
            <Text strong style={{ fontSize: 14 }}>关联人员（{memberCount} 人{memberCount > 5 ? '，前 5' : ''}）</Text>
            <Button type="link" size="small" onClick={onOpenEmployeeList}>查看全部</Button>
          </div>
          <Table
            size="small"
            columns={MEMBER_PREVIEW_COLUMNS}
            dataSource={membersPreview}
            loading={membersPreviewLoading}
            rowKey={(r: MemberPreviewRecord) => String(r.id ?? r.employeeNo ?? r.name ?? Math.random())}
            pagination={false}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该岗位暂无关联人员" style={{ padding: '16px 0' }} /> }}
          />
        </div>
      </div>
    </>
  );
};

export default PermissionMatrix;
