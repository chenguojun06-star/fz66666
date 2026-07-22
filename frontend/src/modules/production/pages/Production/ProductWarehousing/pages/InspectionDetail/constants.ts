import { getMaterialTypeLabel } from '@/utils/materialType';

export const BOM_COLUMNS = [
  { title: '物料编码', dataIndex: 'materialCode', key: 'mc', width: 100 },
  { title: '物料名称', dataIndex: 'materialName', key: 'mn', width: 120, ellipsis: true },
  { title: '物料类型', dataIndex: 'materialType', key: 'mt', width: 70, render: (v: unknown) => getMaterialTypeLabel(v) },
  { title: '颜色', dataIndex: 'color', key: 'c', width: 70 },
  { title: '尺码', dataIndex: 'size', key: 's', width: 60 },
  { title: '单位', dataIndex: 'unit', key: 'u', width: 50 },
  { title: '用量', dataIndex: 'usageAmount', key: 'ua', width: 60, render: (v: number) => v?.toFixed(2) },
  { title: '损耗率(%)', dataIndex: 'lossRate', key: 'lr', width: 70, render: (v: number) => v != null ? `${v.toFixed(1)}%` : '-' },
];
