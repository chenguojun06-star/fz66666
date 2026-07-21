import React from 'react';
import { Tag } from 'antd';
import RowActions from '@/components/common/RowActions';
import { User } from '@/types/system';
import { formatDateTime } from '@/utils/datetime';

export interface UserApprovalColumnsProps {
  onApprove: (user: User) => void;
  onReject: (user: User) => void;
}

export const buildTenantColumns = ({ onApprove, onReject }: UserApprovalColumnsProps) => [
  { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '角色', dataIndex: 'roleName', key: 'roleName', width: 120, render: (text: string) => text || '-' },
  { title: '手机号', dataIndex: 'phone', key: 'phone', width: 120, render: (text: string) => text || '-' },
  { title: '邮箱', dataIndex: 'email', key: 'email', width: 180, render: (text: string) => text || '-' },
  { title: '注册时间', dataIndex: 'createTime', key: 'createTime', width: 160, render: (time: string) => formatDateTime(time) },
  {
    title: '操作', key: 'action', width: 120, fixed: 'right' as const,
    render: (_: any, record: User) => (
      <RowActions
        actions={[
          { key: 'approve', label: '批准', title: '批准', onClick: () => onApprove(record), primary: true },
          { key: 'reject', label: '拒绝', title: '拒绝', onClick: () => onReject(record), danger: true },
        ]}
      />
    ),
  },
];

export interface FactoryColumnsProps extends UserApprovalColumnsProps {
  canApproveFactory: boolean;
  onNavigateToFactoryWorkers: (factoryId: string, factoryName: string) => void;
}

export const buildFactoryColumns = ({
  onApprove,
  onReject,
  canApproveFactory,
  onNavigateToFactoryWorkers,
}: FactoryColumnsProps) => [
  { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '手机号', dataIndex: 'phone', key: 'phone', width: 120, render: (text: string) => text || '-' },
  {
    title: '所属工厂', dataIndex: 'factoryName', key: 'factoryName', width: 140,
    render: (v: string, record: User) => v ? <Tag color="blue">{v}</Tag> : (record.factoryId ? <Tag color="blue">外发工厂</Tag> : '-'),
  },
  { title: '注册时间', dataIndex: 'createTime', key: 'createTime', width: 160, render: (time: string) => formatDateTime(time) },
  {
    title: '操作', key: 'factoryAction', width: canApproveFactory ? 220 : 120, fixed: 'right' as const,
    render: (_: any, record: User) => (
      <RowActions
        actions={[
          ...(canApproveFactory ? [
            { key: 'approve', label: '批准', title: '批准', onClick: () => onApprove(record), primary: true },
            { key: 'reject', label: '拒绝', title: '拒绝', onClick: () => onReject(record), danger: true },
          ] : []),
          ...(record.factoryId ? [{
            key: 'workers',
            label: '人员名册',
            title: '查看工厂人员名册',
            onClick: () => onNavigateToFactoryWorkers(String(record.factoryId ?? ''), String(record.factoryName ?? '')),
          }] : []),
        ]}
      />
    ),
  },
];
