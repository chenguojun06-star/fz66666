import React, { useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { getMaterialTypeLabel } from '@/utils/materialType';
import type { CuttingTask } from '@/types/production';
import type { CuttingBundleRow } from './hooks';

export function usePurchaseColumns() {
  return useMemo(
    () =>
      [
        {
          title: '物料类型',
          dataIndex: 'materialType',
          key: 'materialType',
          width: 110,
          render: (v: unknown) => getMaterialTypeLabel(v),
        },
        { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, ellipsis: true },
        { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true },
        {
          title: '规格',
          dataIndex: 'specifications',
          key: 'specifications',
          width: 180,
          ellipsis: true,
          render: (v: unknown) => String(v || '').trim() || '-',
        },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 90, ellipsis: true },
        {
          title: '实际到料',
          dataIndex: 'arrivedQuantity',
          key: 'arrivedQuantity',
          width: 110,
          align: 'right' as const,
          render: (v: unknown) => Number(v ?? 0) || 0,
        },
      ],
    []
  );
}

export function useBundleColumns(activeTask: CuttingTask | null) {
  return [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb src={activeTask?.styleCover || null} styleId={activeTask?.styleId} styleNo={record.styleNo || activeTask?.styleNo} size={24} borderRadius={4} />
      )
    },
    {
      title: '订单号',
      dataIndex: 'productionOrderNo',
      key: 'productionOrderNo',
      width: 140,
      render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120 },
    {
      title: '款名',
      key: 'styleName',
      width: 160,
      ellipsis: true,
      render: () => activeTask?.styleName || '-',
    },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 120 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
    { title: '扎号', dataIndex: 'bundleNo', key: 'bundleNo', width: 80 },
    {
      title: '床号',
      dataIndex: 'bedNo',
      key: 'bedNo',
      width: 80,
      render: (value: number | null | undefined, record: CuttingBundleRow) => {
        const display = value
          ? (record.bedSubNo != null ? `${value}-${record.bedSubNo}` : String(value))
          : '-';
        return (
          <span style={{ fontWeight: 600, color: value ? 'var(--color-primary)' : 'var(--neutral-text-secondary)' }}>
            {display}
          </span>
        );
      }
    },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' as const },
    { title: '二维码内容', dataIndex: 'qrCode', key: 'qrCode', width: 220, ellipsis: true },
    {
      title: '二维码',
      dataIndex: 'qrCode',
      key: 'qrCodeImage',
      width: 92,
      render: (value: string) => (value ? <QRCodeCanvas value={value} size={42} /> : null),
    },
  ];
}
