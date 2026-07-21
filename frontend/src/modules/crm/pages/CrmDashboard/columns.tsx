import React from 'react';
import { Button, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import type { Customer } from '@/services/crm/customerApi';

const { Text } = Typography;

export interface CustomerColumnHandlers {
  openDrawer: (record: Customer) => void;
  openEditModal: (record: Customer) => void;
  handleDelete: (record: Customer) => void;
}

export function buildColumns(handlers: CustomerColumnHandlers): ColumnsType<Customer> {
  const { openDrawer, openEditModal, handleDelete } = handlers;
  return [
    { title: '客户编号', dataIndex: 'customerNo', width: 130, render: v => <Text code style={{ fontSize: 14 }}>{v}</Text> },
    { title: '公司名称', dataIndex: 'companyName', width: 180, render: (v, r) => (
      <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => openDrawer(r)}>{v}</Button>
    )},
    { title: '等级', dataIndex: 'customerLevel', width: 90, render: v =>
      v === 'VIP' ? <Tag color="gold">VIP</Tag> : <Tag>普通</Tag>
    },
    { title: '联系人', dataIndex: 'contactPerson', width: 100 },
    { title: '联系电话', dataIndex: 'contactPhone', width: 130 },
    { title: '状态', dataIndex: 'status', width: 90, render: v =>
      v === 'ACTIVE' ? <Tag color="green">合作中</Tag> : <Tag color="default">已停合作</Tag>
    },
    { title: '创建人', dataIndex: 'creatorName', width: 90 },
    { title: '创建时间', dataIndex: 'createTime', width: 160, render: v => v?.substring(0, 16) ?? '-' },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, record) => {
        const actions: RowAction[] = [
          { key: 'detail', label: '详情', primary: true, onClick: () => openDrawer(record) },
          { key: 'edit', label: '编辑', onClick: () => openEditModal(record) },
          { key: 'delete', label: '删除', danger: true, onClick: () => handleDelete(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];
}
