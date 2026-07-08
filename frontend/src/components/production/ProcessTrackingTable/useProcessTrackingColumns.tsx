import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { ScanRecord } from '@/types/shared';
import { formatProcessDisplayName } from '@/utils/processHelper';

export interface ProcessTrackingColumnOptions {
  orderNo?: string;
  orderId?: string;
  orderStatus?: string;
  isAdmin?: boolean;
  actioningRecordId?: string | null;
  onManualComplete?: (record: ScanRecord) => void;
  onUndo?: (record: ScanRecord) => void;
}

export function useProcessTrackingColumns(options: ProcessTrackingColumnOptions = {}): ColumnsType<ScanRecord> {
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
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{displayText || bundleNo}</span>
        );
      },
    },
    {
      title: '工序',
      dataIndex: 'processName',
      key: 'processName',
      width: 100,
      render: (v: string, record: any) => (
        <span style={{ fontSize: 14, fontWeight: 500 }}>{formatProcessDisplayName(record.processCode, v)}</span>
      ),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (v: string) => <span style={{ fontSize: 14 }}>{v || '-'}</span>,
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 70,
      render: (v: string) => <span style={{ fontSize: 14 }}>{v || '-'}</span>,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right' as const,
      render: (v: number) => <span style={{ fontSize: 14, fontWeight: 600 }}>{v || 0}</span>,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 80,
      align: 'right' as const,
      render: (price: number) => (
        <span style={{ fontSize: 14, color: '#dc2626', fontWeight: 600 }}>
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
          scanned: { color: '#16a34a', label: '已扫码' },
          pending: { color: '#f97316', label: '待扫码' },
          partial: { color: '#eab308', label: '部分扫码' },
        };
        const s = sm[status] || { color: '#64748b', label: status || '-' };
        return (
          <span style={{ fontSize: 13, color: s.color, fontWeight: 600 }}>
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
      render: (v: string) => <span style={{ fontSize: 13, color: '#475569' }}>{v || '-'}</span>,
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 100,
      render: (v: string) => <span style={{ fontSize: 13 }}>{v || '-'}</span>,
    },
    {
      title: '结算金额',
      dataIndex: 'settlementAmount',
      key: 'settlementAmount',
      width: 90,
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
          {v ? `¥${Number(v).toFixed(2)}` : '-'}
        </span>
      ),
    },
  ];
}
