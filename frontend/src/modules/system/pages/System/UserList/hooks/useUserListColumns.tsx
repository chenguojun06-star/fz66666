import { Tag } from 'antd';
import type { MenuProps } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import { Role, User as UserType } from '@/types/system';
import { formatDateTime } from '@/utils/datetime';

// ============================================================
// 纯工具函数（无状态依赖，可单独导出使用）
// ============================================================

/** 获取状态标签配置 */
export const getStatusConfig = (status: UserType['status']) => {
  const statusMap = {
    active: { text: '启用', color: 'success', icon: <CheckOutlined /> },
    inactive: { text: '停用', color: 'error', icon: <CloseOutlined /> },
  };
  const resolved = (statusMap as any)[status];
  return resolved ?? { text: '未知', color: 'default', icon: null };
};

/** 获取数据权限范围文本 */
export const getPermissionRangeText = (range: string): string => {
  const rangeMap: Record<string, string> = {
    all: '查看全部',
    team: '查看团队',
    own: '仅看自己',
    // 兼容旧数据
    style: '样衣开发',
    production: '生产管理',
    finance: '财务管理',
    system: '系统设置',
  };
  return rangeMap[range] || range || '未设置';
};

/** 获取数据权限范围标签颜色 */
export const getPermissionRangeColor = (range: string): string => {
  const colorMap: Record<string, string> = {
    all: 'blue',
    team: 'green',
    own: 'orange',
  };
  return colorMap[range] || 'default';
};

// ============================================================
// Hook 接口
// ============================================================
interface UseUserListColumnsProps {
  openDialog: (user?: UserType, tab?: 'base' | 'perm') => void;
  applyRoleToUser: (user: UserType, role: Role) => void;
  roleOptions: Role[];
  roleOptionsLoading: boolean;
  setAccountUser: (u: { id: string; name: string }) => void;
  setAccountModalOpen: (v: boolean) => void;
  openLogModal: (type: string, id: string, title: string) => void;
  toggleUserStatus: (id: string, status: UserType['status']) => void;
}

// ============================================================
// Hook
// ============================================================
export function useUserListColumns(props: UseUserListColumnsProps) {
  const {
    openDialog,
    applyRoleToUser,
    roleOptions,
    roleOptionsLoading,
    setAccountUser,
    setAccountModalOpen,
    openLogModal,
    toggleUserStatus,
  } = props;

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '角色',
      dataIndex: 'roleName',
      key: 'roleName',
      width: 100,
    },
    {
      title: '数据权限',
      dataIndex: 'permissionRange',
      key: 'permissionRange',
      width: 120,
      render: (range: string) => (
        <Tag color={getPermissionRangeColor(range)}>
          {getPermissionRangeText(range)}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: UserType['status']) => {
        const cfg = getStatusConfig(status);
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
      render: (value: string) => value || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 150,
      render: (value: string) => value || '-',
    },
    {
      title: '最后登录时间',
      dataIndex: 'lastLoginTime',
      key: 'lastLoginTime',
      width: 150,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '最后登录IP',
      dataIndex: 'lastLoginIp',
      key: 'lastLoginIp',
      width: 120,
      render: (value: string) => value || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_: any, record: UserType) => {
        const roleItems: MenuProps['items'] = (() => {
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

        const toggleLabel = record.status === 'active' ? '停用' : '启用';

        return (
          <RowActions
            maxInline={2}
            actions={[
              {
                key: 'edit',
                label: '编辑',
                title: '编辑',
                onClick: () => openDialog(record, 'base'),
                primary: true,
              },
              {
                key: 'perm',
                label: '权限',
                title: '权限',
                onClick: () => openDialog(record, 'perm'),
                primary: true,
              },
              {
                key: 'grant',
                label: '一键授权',
                disabled: roleOptionsLoading || !roleOptions.length,
                children: roleItems,
              },
              {
                key: 'account',
                label: '收款账户',
                title: '收款账户',
                onClick: () => {
                  setAccountUser({ id: String(record.id || ''), name: record.name || record.username || '' });
                  setAccountModalOpen(true);
                },
              },
              {
                key: 'log',
                label: '日志',
                title: '日志',
                onClick: () => openLogModal('user', String(record.id || ''), `人员 ${record.name || record.username} 操作日志`),
              },
              {
                key: 'toggle',
                label: toggleLabel,
                danger: record.status === 'active',
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
