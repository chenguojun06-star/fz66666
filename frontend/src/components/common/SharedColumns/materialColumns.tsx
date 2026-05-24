import type { ColumnType } from 'antd/es/table';

const emptyRender = (v: unknown) => String(v ?? '').trim() || '-';

export const materialCodeColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '物料编码',
  dataIndex: 'materialCode',
  key: 'materialCode',
  width: 120,
  ellipsis: true,
  render: emptyRender,
  ...overrides,
});

export const materialNameColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '物料名称',
  dataIndex: 'materialName',
  key: 'materialName',
  width: 150,
  ellipsis: true,
  render: emptyRender,
  ...overrides,
});

export const supplierNameColumn = (overrides?: Partial<ColumnType<any>>): ColumnType<any> => ({
  title: '供应商',
  dataIndex: 'supplierName',
  key: 'supplierName',
  width: 140,
  ellipsis: true,
  render: emptyRender,
  ...overrides,
});
