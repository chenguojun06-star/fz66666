import React from 'react';
import { Button, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import type { Receivable } from '@/services/crm/customerApi';
import { formatMoney } from '@/utils/format';
import { STATUS_CONFIG } from './helpers';

const { Text } = Typography;

export interface ReceivableColumnHandlers {
  openReceivableDetail: (record: Receivable) => void;
  goToMaterialPickup: (record: Receivable, tab: 'pickup' | 'payment') => void;
  handleDelete: (record: Receivable) => void;
  openReceiveModal: (record: Receivable) => void;
}

export function buildColumns(handlers: ReceivableColumnHandlers): ColumnsType<Receivable> {
  const { openReceivableDetail, goToMaterialPickup, handleDelete, openReceiveModal } = handlers;
  return [
    {
      title: '单号',
      dataIndex: 'receivableNo',
      width: 160,
      render: (v, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openReceivableDetail(record)}>
          <Text code style={{ fontSize: 14 }}>{v}</Text>
        </Button>
      ),
    },
    { title: '客户名称', dataIndex: 'customerName', width: 160 },
    { title: '关联订单', dataIndex: 'orderNo', width: 140, render: v => v || '-' },
    {
      title: '来源业务',
      dataIndex: 'sourceBizType',
      width: 120,
      render: (v?: string) => v === 'MATERIAL_PICKUP' ? <Tag color="purple">面辅料领取</Tag> : (v || '-'),
    },
    {
      title: '来源单号',
      dataIndex: 'sourceBizNo',
      width: 160,
      render: (v, record) => (
        record.sourceBizType === 'MATERIAL_PICKUP' && v ? (
          <Button type="link" style={{ padding: 0 }} onClick={() => goToMaterialPickup(record, 'pickup')}>
            {v}
          </Button>
        ) : (v || '-')
      ),
    },
    {
      title: '应收金额', dataIndex: 'amount', width: 120, align: 'right',
      render: v => <Text strong>{formatMoney(v)}</Text>,
    },
    {
      title: '已收金额', dataIndex: 'receivedAmount', width: 120, align: 'right',
      render: v => <Text type="success">{formatMoney(v)}</Text>,
    },
    {
      title: '待收余款', width: 120, align: 'right',
      render: (_, r) => {
        const rem = Number(r.amount) - Number(r.receivedAmount ?? 0);
        return <Text type={rem > 0 ? 'warning' : 'secondary'}>{formatMoney(rem)}</Text>;
      },
    },
    {
      title: '到期日', dataIndex: 'dueDate', width: 110,
      render: v => {
        if (!v) return '-';
        const isOverdue = new Date(v) < new Date();
        return <Text type={isOverdue ? 'danger' : undefined}>{v}</Text>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 110,
      render: v => {
        const cfg = STATUS_CONFIG[v] ?? { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '创建时间', dataIndex: 'createTime', width: 150, render: v => v?.substring(0, 16) ?? '-' },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, record) => {
        const canReceive = record.status === 'PENDING' || record.status === 'PARTIAL' || record.status === 'OVERDUE';
        const actions: RowAction[] = [
          {
            key: 'detail',
            label: '应收详情',
            onClick: () => openReceivableDetail(record),
          },
          ...(record.sourceBizType === 'MATERIAL_PICKUP' ? [{
            key: 'pickup',
            label: '查看领料',
            onClick: () => goToMaterialPickup(record, 'pickup'),
          }, {
            key: 'payment-center',
            label: '查看收款汇总',
            onClick: () => goToMaterialPickup(record, 'payment'),
          }] : []),
          ...(canReceive ? [{
            key: 'receive',
            label: '登记到账',
            primary: true,
            onClick: () => openReceiveModal(record),
          }] : []),
          {
            key: 'delete',
            label: '删除',
            danger: true,
            disabled: record.status === 'PAID',
            onClick: () => handleDelete(record),
          },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];
}
