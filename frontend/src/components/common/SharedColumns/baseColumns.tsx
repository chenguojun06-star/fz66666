import type { ColumnType } from 'antd/es/table';

const emptyRender = (v: unknown) => String(v ?? '').trim() || '-';

export const orderNoColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '订单号',
  dataIndex: 'orderNo',
  key: 'orderNo',
  width: 150,
  ellipsis: true,
  render: emptyRender,
  ...overrides,
});

export const styleNoColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '款号',
  dataIndex: 'styleNo',
  key: 'styleNo',
  width: 120,
  ellipsis: true,
  render: emptyRender,
  ...overrides,
});

export const styleNameColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '款名',
  dataIndex: 'styleName',
  key: 'styleName',
  width: 140,
  ellipsis: true,
  render: emptyRender,
  ...overrides,
});

export const colorColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '颜色',
  dataIndex: 'color',
  key: 'color',
  width: 80,
  render: emptyRender,
  ...overrides,
});

export const sizeColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '尺码',
  dataIndex: 'size',
  key: 'size',
  width: 80,
  render: emptyRender,
  ...overrides,
});

export const unitColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '单位',
  dataIndex: 'unit',
  key: 'unit',
  width: 70,
  render: emptyRender,
  ...overrides,
});

export const remarkColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '备注',
  dataIndex: 'remark',
  key: 'remark',
  width: 150,
  ellipsis: true,
  render: emptyRender,
  ...overrides,
});
