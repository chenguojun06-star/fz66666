import { Tag } from 'antd';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { formatDateTime } from '@/utils/datetime';
import { formatProcessDisplayName } from '@/utils/productionStage';
import type { ProcessTrackingRecord } from './processTrackingFilter';
import { canUndoTracking, canManualCompleteTracking } from './processTrackingFilter';

interface ColumnContext {
  actioningRecordId: string;
  isAdmin: boolean;
  orderStatus?: string;
  orderNo?: string;
  orderId?: string;
  onManualComplete: (record: ProcessTrackingRecord) => void;
  onUndo: (record: ProcessTrackingRecord) => void;
}

export function useProcessTrackingColumns(ctx: ColumnContext) {
  return [
    {
      title: '菲号',
      dataIndex: 'bundleNo',
      key: 'bundleNo',
      width: 70,
      fixed: 'left' as const,
      render: (v: number) => (
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{v}</span>
      ),
    },
    {
      title: '工序',
      dataIndex: 'processName',
      key: 'processName',
      width: 100,
      render: (v: string, record: any) => (
        <span style={{ fontSize: 12, fontWeight: 500 }}>{formatProcessDisplayName(record.processCode, v)}</span>
      ),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v || '-'}</span>,
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 70,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v || '-'}</span>,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'right' as const,
      render: (v: number) => <span style={{ fontSize: 12, fontWeight: 600 }}>{v || 0}</span>,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 80,
      align: 'right' as const,
      render: (price: number) => (
        <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
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
          scanned: { color: 'var(--color-success)', label: '已扫码' },
          pending: { color: 'var(--color-warning)', label: '待扫码' },
          reset: { color: 'var(--color-danger)', label: '已重置' },
        };
        const cfg = sm[status] || { color: '#d9d9d9', label: status || '-' };
        return <Tag color={cfg.color} style={{ fontSize: 11, margin: 0 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '扫码时间',
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 140,
      render: (time: string) => (
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{time ? formatDateTime(time) : '-'}</span>
      ),
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 90,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v || '-'}</span>,
    },
    {
      title: '结算金额',
      dataIndex: 'settlementAmount',
      key: 'settlementAmount',
      width: 100,
      align: 'right' as const,
      render: (amount: number) => (
        <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>
          {amount ? `¥${Number(amount).toFixed(2)}` : '-'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 138,
      render: (_: any, record: ProcessTrackingRecord) => {
        const actions: RowAction[] = [];
        if (canManualCompleteTracking(record, ctx.orderStatus, ctx.orderNo, ctx.orderId)) {
          const acting = ctx.actioningRecordId === record.id;
          actions.push({
            key: 'complete',
            label: acting ? '完成中...' : '手动完成',
            primary: true,
            disabled: acting,
            onClick: () => ctx.onManualComplete(record),
          });
        }
        if (canUndoTracking(record, ctx.orderStatus, ctx.isAdmin)) {
          actions.push({
            key: 'undo',
            label: '撤回',
            danger: true,
            primary: actions.length === 0,
            onClick: () => ctx.onUndo(record),
          });
        }
        if (!actions.length) return null;
        return <RowActions actions={actions} />;
      },
    },
  ];
}
