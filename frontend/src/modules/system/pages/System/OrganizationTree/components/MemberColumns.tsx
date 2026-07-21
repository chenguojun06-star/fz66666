import React from 'react';
import { Avatar, Button, Space, Tag } from 'antd';
import { CrownFilled, UserOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import type { OrganizationUnit, User } from '@/types/system';
import RowActions from '@/components/common/RowActions';
import { getEmploymentStatusConfig, getGenderText } from '../../UserList/hooks/useUserListColumns';
import { formatDate } from '@/utils/datetime';

export interface MemberColumnHandlers {
  /** 打开用户编辑弹窗 */
  openUserDialog: (u?: User) => void;
  /** 重置密码 */
  handleResetPassword: (record: User) => void;
  /** 启停用户 */
  handleToggleUserStatus: (userId: string, currentStatus: string) => void;
  /** 移出成员 */
  handleRemoveMember: (userId: string, userName: string) => void;
  /** 设为工厂老板（外协专用） */
  handleSetFactoryOwner: (user: User) => void;
  /** 设为老板 loading 的 userId */
  setOwnerLoading: string | null;
  /** 点击头像查看资料 */
  setProfileUser: (u: User | null) => void;
  /** 部门 ID → 名称 快查表 */
  unitNameMap: Record<string, string>;
}

interface BuildColumnParams extends MemberColumnHandlers {
  /** 当前选中的部门（用于判断"领取人"） */
  selectedUnit: OrganizationUnit | null;
}

/**
 * 外协工厂成员列表列定义
 * 拆自原 OrganizationTree/index.tsx（行 428-483）
 */
export function buildExternalMemberColumns(params: BuildColumnParams): TableColumnsType<User> {
  const { setProfileUser, unitNameMap, setOwnerLoading, handleSetFactoryOwner, handleRemoveMember } = params;
  return [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (v: string, r: User) => (
        <Space size={6}>
          <Avatar
            size={24}
            icon={<UserOutlined />}
            style={{ backgroundColor: r.isFactoryOwner ? 'var(--color-warning, var(--color-warning))' : 'var(--color-success, var(--color-success))', flexShrink: 0, cursor: 'pointer' }}
            onClick={() => setProfileUser(r)}
          />
          {v || r.username}
          {r.isFactoryOwner && (
            <Tag icon={<CrownFilled />} color="gold" style={{ marginLeft: 2 }}>老板</Tag>
          )}
        </Space>
      ),
    },
    { title: '手机号码', dataIndex: 'phone', render: (v: string) => v || '—' },
    { title: '所属部门', dataIndex: 'orgUnitId', render: (v: string) => v ? (unitNameMap[v] || '未知部门') : '—' },
    {
      title: '在职状态',
      dataIndex: 'employmentStatus',
      width: 90,
      render: (v: string) => {
        const cfg = getEmploymentStatusConfig(v);
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, r: User) => r.isFactoryOwner ? (
        <Tag color="gold"><CrownFilled /> 主账号</Tag>
      ) : (
        <Space size={4}>
          <Button
            icon={<CrownFilled />}
            loading={setOwnerLoading === String(r.id)}
            onClick={() => handleSetFactoryOwner(r)}
            size="small"
          >
            设为老板
          </Button>
          <Button
            danger
            size="small"
            onClick={() => handleRemoveMember(String(r.id), r.name || r.username || '')}
          >
            移出
          </Button>
        </Space>
      ),
    },
  ];
}

/**
 * 内部成员列表列定义
 * 拆自原 OrganizationTree/index.tsx（行 485-586）
 */
export function buildInternalMemberColumns(params: BuildColumnParams): TableColumnsType<User> {
  const { setProfileUser, unitNameMap, selectedUnit, openUserDialog, handleResetPassword, handleToggleUserStatus, handleRemoveMember } = params;
  return [
    {
      title: '姓名',
      dataIndex: 'name',
      width: 120,
      render: (v: string, r: User) => (
        <Space size={6}>
          <Avatar size={24} icon={<UserOutlined />} style={{ backgroundColor: 'var(--primary-color, var(--color-primary))', flexShrink: 0, cursor: 'pointer' }} onClick={() => setProfileUser(r)} />
          {v || r.username}
          {selectedUnit?.managerUserId && String(r.id) === String(selectedUnit.managerUserId) && (
            <Tag color="blue" style={{ fontSize: 14 }}>领取人</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '部门',
      dataIndex: 'orgUnitId',
      width: 120,
      render: (v: string) => v ? (unitNameMap[v] || '未知部门') : '—',
    },
    {
      title: '职位权限',
      dataIndex: 'roleName',
      width: 120,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '—',
    },
    {
      title: '性别',
      dataIndex: 'gender',
      width: 70,
      render: (v: string) => getGenderText(v),
    },
    {
      title: '手机号码',
      dataIndex: 'phone',
      width: 130,
      render: (v: string) => v || '—',
    },
    {
      title: '入职日期',
      dataIndex: 'hireDate',
      width: 110,
      render: (v: string) => v ? formatDate(v) : '—',
    },
    {
      title: '在职状态',
      dataIndex: 'employmentStatus',
      width: 90,
      render: (v: string) => {
        const cfg = getEmploymentStatusConfig(v);
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '部门领取人',
      width: 90,
      render: (_: unknown, r: User) => {
        if (!selectedUnit?.managerUserId) return '—';
        return String(r.id) === String(selectedUnit.managerUserId) ? <Tag color="blue">是</Tag> : '—';
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, r: User) => (
        <RowActions
          maxInline={2}
          actions={[
            {
              key: 'edit',
              label: '修改',
              title: '修改',
              onClick: () => openUserDialog(r),
              primary: true,
            },
            {
              key: 'resetPwd',
              label: '改密',
              title: '改密',
              onClick: () => handleResetPassword(r),
            },
            {
              key: 'toggleStatus',
              label: r.status === 'active' ? '停用' : '启用',
              title: r.status === 'active' ? '停用' : '启用',
              danger: r.status === 'active',
              onClick: () => handleToggleUserStatus(String(r.id), r.status),
            },
            {
              key: 'remove',
              label: '移出',
              title: '移出部门',
              danger: true,
              onClick: () => handleRemoveMember(String(r.id), r.name || r.username || ''),
            },
          ]}
        />
      ),
    },
  ];
}
