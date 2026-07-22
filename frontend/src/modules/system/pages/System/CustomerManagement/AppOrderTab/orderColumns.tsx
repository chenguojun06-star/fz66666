import React from 'react';
import { Tag, Typography } from 'antd';

const { Text } = Typography;
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import type { AppOrder } from '@/services/system/appStore';
import type { ColumnsType } from 'antd/es/table';
import { formatMoney } from '@/utils/format';
import { ORDER_STATUS, SUB_TYPE } from './constants';

interface OrderColumnsProps {
  onActivate: (record: AppOrder) => void;
}

export const getOrderColumns = ({ onActivate }: OrderColumnsProps): ColumnsType<AppOrder> => [
  {
    title: '订单号',
    dataIndex: 'orderNo',
    width: 160,
    render: (v: string) => <Text copyable={{ text: v }}>{v}</Text>,
  },
  {
    title: '客户名称',
    dataIndex: 'tenantName',
    width: 140,
    ellipsis: true,
  },
  {
    title: '应用名称',
    dataIndex: 'appName',
    width: 140,
    ellipsis: true,
  },
  {
    title: '订阅类型',
    dataIndex: 'subscriptionType',
    width: 100,
    render: (v: string) => {
      const s = SUB_TYPE[v] || { label: v, color: 'default' };
      return <Tag color={s.color}>{s.label}</Tag>;
    },
  },
  {
    title: '金额',
    dataIndex: 'actualAmount',
    width: 100,
    render: (v: number) => v != null ? <Text strong>{formatMoney(Number(v))}</Text> : '-',
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 90,
    render: (v: string) => {
      const s = ORDER_STATUS[v] || { label: v, color: 'default' };
      return <Tag color={s.color}>{s.label}</Tag>;
    },
  },
  {
    title: '联系人',
    dataIndex: 'contactName',
    width: 100,
    ellipsis: true,
    render: (name: string, record: AppOrder) =>
      name ? <span>{name}{record.contactPhone ? ` / ${record.contactPhone}` : ''}</span> : '-',
  },
  {
    title: '下单时间',
    dataIndex: 'createTime',
    width: 160,
  },
  {
    title: '支付时间',
    dataIndex: 'paymentTime',
    width: 160,
    render: (v: string) => v || '-',
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    fixed: 'right',
    render: (_: any, record: AppOrder) => {
      const actions: RowAction[] = [];
      if (record.status === 'PENDING') {
        actions.push({
          key: 'activate',
          label: '激活开通',
          primary: true,
          onClick: () => onActivate(record),
        });
      }
      if (actions.length === 0) {
        return <Text type="secondary">已处理</Text>;
      }
      return <RowActions actions={actions} />;
    },
  },
];
