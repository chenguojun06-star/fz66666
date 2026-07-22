import { Tag } from 'antd';
import { formatDateTime } from '@/utils/datetime';
import { getQualityStatusConfig } from '../../utils';
import type { BuildColumnsParams } from './columns';

export function buildQualityColumns(_params: BuildColumnsParams) {
  return [
    {
      title: '裁剪',
      dataIndex: 'cuttingQuantity',
      key: 'cuttingQuantity',
      width: 55,
      align: 'right' as const,
      render: (v: unknown) => v ?? '-',
    },
    {
      title: '质检',
      dataIndex: 'warehousingQuantity',
      key: 'warehousingQuantity',
      width: 55,
      align: 'right' as const,
    },
    {
      title: '合格',
      dataIndex: 'qualifiedQuantity',
      key: 'qualifiedQuantity',
      width: 55,
      align: 'right' as const,
    },
    {
      title: '不合格',
      dataIndex: 'unqualifiedQuantity',
      key: 'unqualifiedQuantity',
      width: 60,
      align: 'right' as const,
    },
    {
      title: '扫码方式',
      dataIndex: 'scanMode',
      key: 'scanMode',
      width: 80,
      render: (v: unknown) => {
        const mode = String(v || '').trim().toLowerCase();
        if (mode === 'ucode') return <Tag color="green" style={{ marginInlineEnd: 0, fontSize: 'var(--table-cell-font-size)' }}>U编码</Tag>;
        return <Tag color="blue" style={{ marginInlineEnd: 0, fontSize: 'var(--table-cell-font-size)' }}>菲号</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'qualityStatus',
      key: 'qualityStatus',
      width: 72,
      render: (status: any) => {
        const { text, color } = getQualityStatusConfig(status);
        return <Tag color={color} style={{ marginInlineEnd: 0, fontSize: 'var(--table-cell-font-size)' }}>{text}</Tag>;
      },
    },
    {
      title: '质检人',
      key: 'qualityOperatorName',
      width: 70,
      ellipsis: true,
      render: (_: any, record: any) => {
        const name = String(record?.qualityOperatorName || record?.receiverName || record?.warehousingOperatorName || '').trim();
        return name || '-';
      },
    },
    {
      title: '时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 90,
      render: (value: unknown) => {
        const s = formatDateTime(value);
        if (!s || s === '-') return '-';
        const m = s.match(/(\d{2}-\d{2})\s+(\d{2}:\d{2})/);
        return m ? <span title={s} style={{ fontSize: 'var(--table-cell-font-size)' }}>{m[1]} {m[2]}</span> : <span style={{ fontSize: 'var(--table-cell-font-size)' }}>{s}</span>;
      },
    },
  ];
}
