import { Tag } from 'antd';
import type { MenuProps } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import { Role, User as UserType } from '@/types/system';
import { formatDate } from '@/utils/datetime';

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
    normal: { text: '正式', color: 'green' },
    probation: { text: '试用期', color: 'orange' },
    temporary: { text: '临时工', color: 'blue' },
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
}

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
    isTenantOwner,
    onResetPassword,
  } = props;

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
      title: '职位权限',
      dataIndex: 'roleName',
      key: 'roleName',
      width: 120,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-',
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
