import React from 'react';
import { Tag, Button, Dropdown, MenuProps, App } from 'antd';
import { CheckOutlined, CloseOutlined, UserOutlined, AppstoreOutlined, ShopOutlined, TeamOutlined } from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import { Role, User as UserType } from '@/types/system';
import { formatDate } from '@/utils/datetime';
import { requestWithPathFallback } from '@/utils/api';

/** 用户归属类型 */
type UserAffiliation = 'internal' | 'external_factory' | 'supplier' | 'other';

/** 角色类型对应的用户归属 */
function getUserAffiliation(roleName?: string, roleCode?: string): { type: UserAffiliation; label: string; color: string; icon: React.ReactNode } {
  const name = (roleName || '').toLowerCase();
  const code = (roleCode || '').toLowerCase();

  // 外发工厂用户
  if (name.includes('factory') || name.includes('外发') || name.includes('外包') ||
      code.includes('factory_owner') || code.includes('external')) {
    return {
      type: 'external_factory',
      label: '外发工厂',
      color: 'warning',
      icon: <AppstoreOutlined />,
    };
  }

  // 第三方供应商用户
  if (name.includes('supplier') || name.includes('vendor') || name.includes('供应商') ||
      name.includes('面辅料') || name.includes('物料')) {
    return {
      type: 'supplier',
      label: '第三方供应商',
      color: 'info',
      icon: <ShopOutlined />,
    };
  }

  // 内部员工
  if (name.includes('admin') || name.includes('manager') || name.includes('主管') ||
      name.includes('组长') || name.includes('员工') || name.includes('operator') ||
      name.includes('merchandiser') || name.includes('采购') || name.includes('财务') ||
      name.includes('仓库')) {
    return {
      type: 'internal',
      label: '内部员工',
      color: 'success',
      icon: <UserOutlined />,
    };
  }

  return {
    type: 'other',
    label: '其他',
    color: 'default',
    icon: <TeamOutlined />,
  };
}

export const getStatusConfig = (status: UserType['status']) => {
  const statusMap = {
    active: { text: '启用', color: 'success', icon: <CheckOutlined /> },
    inactive: { text: '停用', color: 'error', icon: <CloseOutlined /> },
  };
  const resolved = (statusMap as any)[status];
  return resolved ?? { text: '未知', color: 'default', icon: null };
};

export const getEmploymentStatusConfig = (status?: string) => {
  const map: Record<string, { text: string; color: string }> = {
    normal: { text: '正式', color: 'success' },
    probation: { text: '试用期', color: 'warning' },
    temporary: { text: '临时工', color: 'processing' },
    transferred: { text: '调岗', color: 'blue' },
    resigned: { text: '离职', color: 'error' },
    archived: { text: '已归档', color: 'default' },
  };
  return map[status || ''] ?? { text: '未设置', color: 'default' };
};

export const getGenderText = (gender?: string) => {
  const map: Record<string, string> = { male: '男', female: '女' };
  return map[gender || ''] || '未设置';
};

interface UseUserListColumnsProps {
  openDialog: (user?: UserType) => void;
  applyRoleToUser: (user: UserType, role: Role) => void;
  roleOptions: Role[];
  roleOptionsLoading: boolean;
  setAccountUser: (u: { id: string; name: string }) => void;
  setAccountModalOpen: (v: boolean) => void;
  openLogModal: (type: string, id: string, title: string) => void;
  toggleUserStatus: (id: string, status: UserType['status']) => void;
  isTenantOwner?: boolean;
  onResetPassword?: (record: UserType) => void;
  onChangeEmploymentStatus?: (record: UserType, nextStatus: 'transferred' | 'resigned' | 'archived') => void;
}

export function useUserListColumns(props: UseUserListColumnsProps) {
  const {
    openDialog,
    applyRoleToUser,
    roleOptions,
    roleOptionsLoading,
    setAccountUser: _setAccountUser,
    setAccountModalOpen: _setAccountModalOpen,
    openLogModal: _openLogModal,
    toggleUserStatus,
    isTenantOwner: _isTenantOwner,
    onResetPassword,
    onChangeEmploymentStatus,
  } = props;
  const { message } = App.useApp();

  // 快速切换用户角色
  const handleQuickChangeRole = async (user: UserType, newRole: Role) => {
    try {
      // 传必要字段：id + roleId + operationRemark（后端要求）
      const response = await requestWithPathFallback('put', '/system/user', '/auth/user', {
        id: user.id,
        roleId: Number(newRole.id),
        operationRemark: `快速切换角色为「${newRole.roleName}」`,
      });
      const result = response as any;
      if (result?.code === 200) {
        message.success(`已将 ${user.name || user.username} 设置为「${newRole.roleName}」`);
      } else {
        message.error(result?.message || '设置角色失败');
      }
    } catch {
      message.error('设置角色失败');
    }
  };

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      render: (v: string, r: UserType) => v || r.username,
    },
    {
      title: '部门',
      dataIndex: 'orgUnitName',
      key: 'orgUnitName',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '职位',
      dataIndex: 'position',
      key: 'position',
      width: 140,
      render: (v: string) => v ? <Tag color="info">{v}</Tag> : '-',
    },
    {
      title: '角色权限',
      dataIndex: 'roleName',
      key: 'roleName',
      width: 180,
      render: (v: string, r: UserType) => {
        const affiliation = getUserAffiliation(String(v || ''), String(r.roleCode || ''));

        // 无角色时显示设置按钮
        if (!v) {
          const noRoleItems = roleOptions.map(role => ({
            key: String(role.id),
            label: role.roleName,
            onClick: () => handleQuickChangeRole(r, role),
          }));
          return (
            <Dropdown menu={{ items: noRoleItems }} disabled={roleOptionsLoading} trigger={['click']}>
              <Button size="small" type="dashed">
                <span style={{ fontSize: 12, color: "var(--color-text-secondary, #666)" }}>
                  <UserOutlined style={{ fontSize: 11 }} />
                  <span style={{ marginLeft: 4 }}>点击设置角色</span>
                </span>
              </Button>
            </Dropdown>
          );
        }

        // 有角色时显示可切换的标签
        const items = roleOptions.map(role => {
          const isCurrent = String(role.id) === String(r.roleId);
          return {
            key: String(role.id),
            label: (
              <span style={{ display: 'inline-block', width: '100%' }}>
                {isCurrent && (
                  <CheckOutlined style={{ fontSize: 10, marginRight: 4, color: 'var(--color-primary, var(--color-success))' }} />
                )}
                {role.roleName}
                {isCurrent && (
                  <span style={{ fontSize: 10, marginLeft: 8, color: 'var(--color-text-quaternary, #999)' }}>
                    （当前）
                  </span>
                )}
              </span>
            ),
            onClick: () => handleQuickChangeRole(r, role),
          };
        });

        return (
          <Dropdown menu={{ items }} trigger={['click']}>
            <Tag
              icon={affiliation.icon}
              color={affiliation.color}
              style={{
                cursor: 'pointer',
                padding: '2px 10px',
                fontSize: 12,
                border: `1px solid var(--color-border-antd, var(--color-border-antd))`,
                borderRadius: 4,
              }}
            >
              <span style={{ fontSize: 12 }}>{v}</span>
              <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--color-text-quaternary, #999)' }}>
                点击切换
              </span>
            </Tag>
          </Dropdown>
        );
      },
    },
    {
      title: '归属',
      key: 'affiliation',
      width: 110,
      render: (_: any, r: UserType) => {
        const affiliation = getUserAffiliation(String(r.roleName || ''), String(r.roleCode || ''));
        return (
          <Tag color={affiliation.color}>
            {affiliation.icon} {affiliation.label}
          </Tag>
        );
      },
    },
    {
      title: '性别',
      dataIndex: 'gender',
      key: 'gender',
      width: 80,
      render: (v: string) => getGenderText(v),
    },
    {
      title: '手机号码',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      render: (v: string) => v || '-',
    },
    {
      title: '入职日期',
      dataIndex: 'hireDate',
      key: 'hireDate',
      width: 120,
      render: (v: string) => v ? formatDate(v) : '-',
    },
    {
      title: '在职状态',
      dataIndex: 'employmentStatus',
      key: 'employmentStatus',
      width: 100,
      render: (v: string) => {
        const cfg = getEmploymentStatusConfig(v);
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_: any, record: UserType) => {
        const _roleItems: MenuProps['items'] = (() => {
          const items: MenuProps['items'] = [];
          for (const r of roleOptions) {
            const rid = String(r.id ?? '').trim();
            if (!rid) continue;
            items.push({
              key: rid,
              label: `设为：${r.roleName}`,
              onClick: () => applyRoleToUser(record, r),
            });
          }
          if (!items.length) {
            items.push({
              key: 'empty',
              label: roleOptionsLoading ? '角色加载中…' : '暂无可用角色',
              disabled: true,
            });
          }
          return items;
        })();

        // 当前在职状态：非调岗/离职/归档的视为"在职"
        const empStatus = String(record.employmentStatus || '');
        const isTransferred = empStatus === 'transferred';
        const isResigned = empStatus === 'resigned';
        const isArchived = empStatus === 'archived';

        return (
          <RowActions
            maxInline={2}
            actions={[
              {
                key: 'edit',
                label: '修改',
                title: '修改',
                onClick: () => openDialog(record),
                primary: true,
              },
              {
                key: 'resetPwd',
                label: '改密',
                title: '改密',
                onClick: () => onResetPassword?.(record),
              },
              {
                key: 'more',
                label: '更多',
                children: [
                  {
                    key: 'emp-status-group',
                    label: '变更在职状态',
                    children: [
                      {
                        key: 'set-transferred',
                        label: '调岗',
                        disabled: isTransferred,
                        onClick: () => onChangeEmploymentStatus?.(record, 'transferred'),
                      },
                      {
                        key: 'set-resigned',
                        label: '离职',
                        disabled: isResigned,
                        onClick: () => onChangeEmploymentStatus?.(record, 'resigned'),
                      },
                      {
                        key: 'set-archived',
                        label: '归档',
                        disabled: isArchived,
                        onClick: () => onChangeEmploymentStatus?.(record, 'archived'),
                      },
                    ],
                  },
                ],
              },
              {
                key: 'delete',
                label: '删除',
                title: '删除',
                danger: true,
                onClick: () => toggleUserStatus(String(record.id!), record.status),
              },
            ]}
          />
        );
      },
    },
  ];

  return { columns };
}
