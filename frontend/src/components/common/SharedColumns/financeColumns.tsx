import type { ColumnType } from 'antd/es/table';
import { toMoney } from '@/utils/format';
import { formatDateTime } from '@/utils/datetime';

export const amountColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '金额',
  dataIndex: 'amount',
  key: 'amount',
  width: 110,
  align: 'right',
  render: (v: unknown) => `¥${toMoney(v)}`,
  ...overrides,
});

export const totalAmountColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '金额',
  dataIndex: 'totalAmount',
  key: 'totalAmount',
  width: 110,
  align: 'right',
  render: (v: unknown) => `¥${toMoney(v)}`,
  ...overrides,
});

export const unitPriceColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '单价(元)',
  dataIndex: 'unitPrice',
  key: 'unitPrice',
  width: 100,
  align: 'right',
  render: (v: unknown) => `¥${toMoney(v)}`,
  ...overrides,
});

export const createTimeColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '创建时间',
  dataIndex: 'createTime',
  key: 'createTime',
  width: 160,
  render: (v: unknown) => formatDateTime(v as string),
  ...overrides,
});
