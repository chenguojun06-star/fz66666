import type { ColumnType } from 'antd/es/table';

const emptyRender = (v: unknown) => String(v ?? '').trim() || '-';

export const processNameColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '工序名称',
  dataIndex: 'processName',
  key: 'processName',
  width: 120,
  ellipsis: true,
  render: emptyRender,
  ...overrides,
});

export const factoryNameColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '工厂',
  dataIndex: 'factoryName',
  key: 'factoryName',
  width: 120,
  ellipsis: true,
  render: emptyRender,
  ...overrides,
});

export const quantityColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '数量',
  dataIndex: 'quantity',
  key: 'quantity',
  width: 90,
  align: 'right',
  render: (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : '-';
  },
  ...overrides,
});
