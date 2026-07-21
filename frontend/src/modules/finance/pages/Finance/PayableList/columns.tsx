import React from 'react';
import { Button, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import type { Payable } from '@/services/finance/payableApi';
import { toMoneyLocale } from '@/utils/format';
import { canMarkPaid, getStatusConfig, isOverdue } from './helpers';

const { Text } = Typography;

export interface BuildColumnsOptions {
  /** 打开应付详情 */
  openPayableDetail: (record: Payable) => void;
  /** 删除操作 */
  handleDelete: (record: Payable) => void;
  /** 登记付款：弹出 MarkPaidModal */
  onMarkPaid: (record: Payable) => void;
}

/** 构造应付账款列表的列定义 */
export function buildColumns(options: BuildColumnsOptions): ColumnsType<Payable> {
  const { openPayableDetail, handleDelete, onMarkPaid } = options;

  return [
    {
      title: '应付单号',
      dataIndex: 'payableNo',
      width: 160,
      render: (v, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openPayableDetail(record)}>
          <Text code style={{ fontSize: 14 }}>{v || '-'}</Text>
        </Button>
      ),
    },
    { title: '供应商/对方名称', dataIndex: 'supplierName', width: 180 },
    { title: '关联订单', dataIndex: 'orderNo', width: 140, render: v => v || '-' },
    {
      title: '来源业务',
      dataIndex: 'orderId',
      width: 120,
      render: (v?: string) => v ? <Tag color="purple">采购订单</Tag> : '-',
    },
    { title: '来源单号', dataIndex: 'orderNo', width: 160, render: v => v || '-' },
    {
      title: '应付金额', dataIndex: 'amount', width: 120, align: 'right',
      render: v => <Text strong>¥ {toMoneyLocale(v)}</Text>,
    },
    {
      title: '已付金额', dataIndex: 'paidAmount', width: 120, align: 'right',
      render: v => <Text type="success">¥ {toMoneyLocale(v)}</Text>,
    },
    {
      title: '待付余额', width: 120, align: 'right',
      render: (_, r) => {
        const rem = Number(r.amount) - Number(r.paidAmount ?? 0);
        return <Text type={rem > 0 ? 'warning' : 'secondary'}>¥ {toMoneyLocale(rem)}</Text>;
      },
    },
    {
      title: '到期日', dataIndex: 'dueDate', width: 110,
      render: v => {
        if (!v) return '-';
        return <Text type={isOverdue(v) ? 'danger' : undefined}>{v}</Text>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 110,
      render: v => {
        const cfg = getStatusConfig(v);
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '创建时间', dataIndex: 'createTime', width: 150, render: v => v?.substring(0, 16) ?? '-' },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, record) => {
        const actions: RowAction[] = [
          {
            key: 'detail',
            label: '应付详情',
            onClick: () => openPayableDetail(record),
          },
          ...(canMarkPaid(record) ? [{
            key: 'pay',
            label: '登记付款',
            primary: true,
            onClick: () => onMarkPaid(record),
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
