import React from 'react';
import { Image } from 'antd';
import AttachmentThumb from '@/components/common/AttachmentThumb';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { toCategoryCn, toSeasonCn } from '@/utils/styleCategory';
import { formatMoney } from '@/utils/format';
import { StyleInfo } from '@/types/style';
import { SkuRow } from './types';

interface ColumnHandlers {
  openDrawer: (record: StyleInfo) => void;
  openEdit: (record: StyleInfo) => void;
  handleInbound: (record: StyleInfo) => void;
  handlePrintTag: (record: StyleInfo) => void;
}

export const buildColumns = (handlers: ColumnHandlers) => [
  {
    title: '图片', dataIndex: 'cover', key: 'cover', width: 56,
    render: (_: unknown, r: StyleInfo) => (
      <AttachmentThumb styleId={r.id!} src={r.cover || null} width={36} height={36} borderRadius={4} />
    ),
  },
  { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true },
  { title: '款名', dataIndex: 'styleName', key: 'styleName', width: 140, ellipsis: true },
  {
    title: '品类', dataIndex: 'category', key: 'category', width: 80,
    render: (v: unknown) => toCategoryCn(v),
  },
  {
    title: '季节', dataIndex: 'season', key: 'season', width: 70,
    render: (v: unknown) => toSeasonCn(v),
  },
  { title: '颜色', dataIndex: 'color', key: 'color', width: 70 },
  { title: '尺码', dataIndex: 'size', key: 'size', width: 80, ellipsis: true },
  { title: 'SKC', dataIndex: 'skc', key: 'skc', width: 130, ellipsis: true },
  {
    title: '客户', dataIndex: 'customer', key: 'customer', width: 90, ellipsis: true,
    render: (v: unknown) => String(v ?? '-'),
  },
  {
    title: '单价', dataIndex: 'price', key: 'price', width: 80, align: 'right' as const,
    render: (v: unknown) => v != null ? formatMoney(v as number | string) : '-',
  },
  {
    title: '下单', dataIndex: 'orderCount', key: 'orderCount', width: 60, align: 'right' as const,
    render: (v: unknown) => v != null ? `${v}次` : '-',
  },
  {
    title: '入库量', dataIndex: 'totalWarehousedQuantity', key: 'totalWarehousedQuantity', width: 70, align: 'right' as const,
    render: (v: unknown) => v != null ? `${v}` : '-',
  },
  {
    title: '状态', dataIndex: 'status', key: 'status', width: 60,
    render: (v: string) => {
      if (v === 'ENABLED') return <span style={{ color: '#16a34a', fontWeight: 500 }}>启用</span>;
      if (v === 'DISABLED') return <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>停用</span>;
      return <span style={{ color: 'var(--color-text-tertiary)' }}>{v || '-'}</span>;
    },
  },
  {
    title: '操作', key: 'actions', width: 180, fixed: 'right' as const,
    render: (_: unknown, record: StyleInfo) => {
      const actions: RowAction[] = [
        { key: 'detail', label: '详情', primary: true, onClick: () => handlers.openDrawer(record) },
        { key: 'edit', label: '编辑', onClick: () => handlers.openEdit(record) },
        { key: 'inbound', label: '入库', onClick: () => handlers.handleInbound(record) },
        { key: 'print', label: '吊牌', onClick: () => handlers.handlePrintTag(record) },
      ];
      return <RowActions actions={actions} />;
    },
  },
];

export const buildSkuColumns = () => [
  {
    title: '图片', key: 'skuColorImage', width: 70,
    render: (_: unknown, record: SkuRow) => {
      if (record.skuColorImage) {
        return (
          <Image
            src={getFullAuthedFileUrl(record.skuColorImage)}
            alt=""
            width={36}
            height={36}
            style={{ objectFit: 'cover', borderRadius: 4 }}
            preview={{ mask: <span style={{ fontSize: 10 }}>查看</span> }}
          />
        );
      }
      return <div style={{ width: 36, height: 36, background: 'var(--color-bg-subtle)', borderRadius: 4 }} />;
    },
  },
  { title: '颜色', dataIndex: 'color', key: 'color', width: 80, render: (v: unknown) => <span style={{ fontWeight: 500 }}>{v ? String(v) : '-'}</span> },
  { title: '尺码', dataIndex: 'size', key: 'size', width: 70, render: (v: unknown) => <span>{v ? String(v) : '-'}</span> },
  { title: 'SKU编码', dataIndex: 'skuCode', key: 'skuCode', width: 180, ellipsis: true },
  { title: '条形码', dataIndex: 'barcode', key: 'barcode', width: 130, ellipsis: true, render: (v: unknown) => String(v ?? '-') },
  {
    title: '成本价', dataIndex: 'costPrice', key: 'costPrice', width: 80, align: 'right' as const,
    render: (v: unknown) => v != null ? formatMoney(v as number | string) : '-',
  },
  {
    title: '销售价', dataIndex: 'salesPrice', key: 'salesPrice', width: 80, align: 'right' as const,
    render: (v: unknown) => v != null ? formatMoney(v as number | string) : '-',
  },
  {
    title: '库存', dataIndex: 'stockQuantity', key: 'stockQuantity', width: 70, align: 'right' as const,
    render: (v: unknown) => {
      if (v == null) return '-';
      const n = Number(v);
      return <span style={{ color: n > 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontWeight: n > 0 ? 600 : 400 }}>{n}</span>;
    },
  },
];
