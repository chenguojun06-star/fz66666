import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import { formatProcessDisplayName } from '@/utils/productionStage';
import type { ProcessTrackingRecord } from './processTrackingFilter';

export interface ProcessTrackingColumnOptions {
  orderNo?: string;
  orderId?: string;
  orderStatus?: string;
  isAdmin?: boolean;
  actioningRecordId?: string | null;
  onManualComplete?: (record: ProcessTrackingRecord) => void;
  onUndo?: (record: ProcessTrackingRecord) => void;
}

export function useProcessTrackingColumns(options: ProcessTrackingColumnOptions = {}): ColumnsType<ProcessTrackingRecord> {
  const { orderNo } = options;
  return [
    {
      title: '菲号',
      dataIndex: 'bundleNo',
      key: 'bundleNo',
      width: 200,
      render: (_: unknown, record: any) => {
        const qrCode = String(record.cuttingBundleQrCode || record.qrCode || '').trim();
        const bundleNo = String(record.bundleNo || '').trim();
        // 优先使用完整二维码信息(含订单号/款号/颜色/尺码/数量/菲号)
        let displayText = qrCode ? qrCode.split('|SIG-')[0].split('|SKU-')[0] : bundleNo;
        // 如果二维码为空，且 bundleNo 是纯数字，则拼接订单号避免只显示简单序号
        if (!qrCode && bundleNo && /^\d+$/.test(bundleNo) && orderNo) {
          displayText = `${orderNo}-${bundleNo}`;
        }
        return (
          <span className="u-fs-13 u-fw-700" style={{ color: 'var(--color-text-primary)' }}>{displayText || bundleNo}</span>
        );
      },
    },
    {
      title: '工序',
      dataIndex: 'processName',
      key: 'processName',
      width: 100,
      render: (v: string, record: any) => (
        <span className="u-fs-14 u-fw-500">{formatProcessDisplayName(record.processCode, v)}</span>
      ),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (v: string) => <span className="u-fs-14">{v || '-'}</span>,
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 70,
      render: (v: string) => <span className="u-fs-14">{v || '-'}</span>,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right' as const,
      render: (v: number) => <span className="u-fs-14 u-fw-600">{v || 0}</span>,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 80,
      align: 'right' as const,
      render: (price: number) => (
        <span className="u-fs-14 u-fw-600" style={{ color: 'var(--color-error)' }}>
          {price ? `¥${Number(price).toFixed(2)}` : '-'}
        </span>
      ),
    },
    {
      title: '扫码状态',
      dataIndex: 'scanStatus',
      key: 'scanStatus',
      width: 90,
      render: (status: string) => {
        const sm: Record<string, { color: string; label: string }> = {
          scanned: { color: 'var(--color-green-600)', label: '已扫码' },
          pending: { color: 'var(--color-orange-500)', label: '待扫码' },
          partial: { color: 'var(--color-amber-500)', label: '部分扫码' },
        };
        const s = sm[status] || { color: 'var(--color-slate-500)', label: status || '-' };
        return (
          <span style={{ fontSize: 14, color: s.color, fontWeight: 600 }}>
            {s.label}
          </span>
        );
      },
    },
    {
      title: '扫码时间',
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 140,
      render: (v: string) => <span className="u-fs-13" style={{ color: 'var(--color-text-secondary)' }}>{v || '-'}</span>,
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 100,
      render: (v: string) => <span className="u-fs-13">{v || '-'}</span>,
    },
    {
      title: '结算金额',
      dataIndex: 'settlementAmount',
      key: 'settlementAmount',
      width: 90,
      align: 'right' as const,
      render: (v: number) => (
        <span className="u-fs-13 u-fw-600" style={{ color: 'var(--color-error)' }}>
          {v ? `¥${Number(v).toFixed(2)}` : '-'}
        </span>
      ),
    },
    {
      title: '结算状态',
      dataIndex: 'isSettled',
      key: 'isSettled',
      width: 90,
      render: (isSettled: boolean, _record: ProcessTrackingRecord) => {
        const settled = Boolean(isSettled);
        const style: React.CSSProperties = settled
          ? {
              fontSize: 14,
              color: 'var(--color-bg-base)',
              backgroundColor: 'var(--color-accent-emerald)',
              padding: '2px 10px',
              borderRadius: 10,
              fontWeight: 600,
              display: 'inline-block',
            }
          : {
              fontSize: 14,
              color: 'var(--color-slate-400)',
              backgroundColor: 'var(--color-slate-100)',
              padding: '2px 10px',
              borderRadius: 10,
              fontWeight: 500,
              display: 'inline-block',
            };
        return <span style={style}>{settled ? '已结算' : '未结算'}</span>;
      },
    },
  ];
}
