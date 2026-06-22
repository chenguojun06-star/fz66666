import React, { useMemo } from 'react';
import { Tag } from 'antd';
import type { ShipmentReconciliation } from '@/types/finance';
import { formatDateTime } from '@/utils/datetime';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import RowActions from '@/components/common/RowActions';

/** 出货对账状态配置 */
const getShipmentReconStatusConfig = (status: string) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待核实', color: 'blue' },
    verified: { text: '已核实', color: 'orange' },
    approved: { text: '已审批', color: 'green' },
    paid: { text: '已付款', color: 'purple' },
    rejected: { text: '已驳回', color: 'red' },
  };
  const key = String(status || '').trim();
  return statusMap[key] ?? statusMap[key.toLowerCase()] ?? { text: key || '未知', color: 'default' };
};

/** 出货对账状态流转规则 */
export const shipmentReconStatusTransitions: Record<string, string[]> = {
  pending: ['verified', 'approved', 'rejected'],
  verified: ['approved', 'rejected'],
  approved: ['paid', 'rejected'],
  rejected: ['pending'],
  paid: [],
};

type UseShipmentReconColumnsParams = {
  user: any;
  canPerformAction: (action: string) => boolean;
  actionSubmitting: boolean;
  onStatusUpdate: (record: ShipmentReconciliation, newStatus: string) => void;
  onReturn: (record: ShipmentReconciliation) => void;
  onBackfill: () => void;
  onViewDetail: (record: ShipmentReconciliation) => void;
  onEdit: (record: ShipmentReconciliation) => void;
  onDelete: (record: ShipmentReconciliation) => void;
  onViewDeduction: (record: ShipmentReconciliation) => void;
};

export const useShipmentReconColumns = ({
  user, canPerformAction, actionSubmitting,
  onStatusUpdate, onReturn, onViewDetail, onEdit, onDelete, onViewDeduction,
}: UseShipmentReconColumnsParams) => {
  const columns = useMemo(() => [
    {
      title: '对账单号', dataIndex: 'reconciliationNo', key: 'reconciliationNo', width: 150,
      render: (_: any, record: ShipmentReconciliation) => (
        <a onClick={() => onViewDetail(record)} style={{ padding: 0 }}>
          {String(record.reconciliationNo || '').trim() || '-'}
        </a>
      ),
    },
    { title: '客户名称', dataIndex: 'customerName', key: 'customerName', width: 120, ellipsis: true },
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 140 },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 110 },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
    {
      title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const,
      render: (v: number, r: ShipmentReconciliation) => `${v ?? 0}${r.productionCompletedQuantity != null ? `/${r.productionCompletedQuantity}` : ''}`,
    },
    {
      title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 100, align: 'right' as const,
      render: (v: number) => canViewPrice(user) ? `¥${(v ?? 0).toFixed(2)}` : '***',
    },
    {
      title: '总金额', dataIndex: 'totalAmount', key: 'totalAmount', width: 110, align: 'right' as const,
      render: (v: number) => canViewPrice(user) ? <span style={{ color: 'var(--color-primary)' }}>¥{(v ?? 0).toFixed(2)}</span> : '***',
    },
    {
      title: '扣款金额', dataIndex: 'deductionAmount', key: 'deductionAmount', width: 110, align: 'right' as const,
      render: (v: number) => canViewPrice(user) ? <span style={{ color: v > 0 ? 'var(--color-error)' : undefined }}>¥{(v ?? 0).toFixed(2)}</span> : '***',
    },
    {
      title: '最终金额', dataIndex: 'finalAmount', key: 'finalAmount', width: 110, align: 'right' as const,
      render: (v: number) => canViewPrice(user) ? <span style={{ fontWeight: 600 }}>¥{(v ?? 0).toFixed(2)}</span> : '***',
    },
    {
      title: '总成本', dataIndex: 'totalCost', key: 'totalCost', width: 100, align: 'right' as const,
      render: (v: number) => canViewPrice(user) && v != null ? `¥${v.toFixed(2)}` : '-',
    },
    {
      title: '利润', dataIndex: 'profit', key: 'profit', width: 100, align: 'right' as const,
      render: (v: number) => canViewPrice(user) && v != null
        ? <span style={{ color: v >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>¥{v.toFixed(2)}</span>
        : '-',
    },
    {
      title: '利润率', dataIndex: 'profitMargin', key: 'profitMargin', width: 80, align: 'right' as const,
      render: (v: number) => v != null ? `${v.toFixed(1)}%` : '-',
    },
    {
      title: '对账日期', dataIndex: 'reconciliationDate', key: 'reconciliationDate', width: 110,
      render: (v: unknown) => formatDateTime(v) || '-',
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (status: ShipmentReconciliation['status']) => {
        const { text, color } = getShipmentReconStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '操作', key: 'action', width: 200, fixed: 'right' as const,
      render: (_: any, record: ShipmentReconciliation) => {
        const id = String(record.id || '').trim();
        const status = String(record.status || '').trim();
        const canApprove = id && (status === 'pending' || status === 'verified') && canPerformAction('approve');
        const canReject = id && (status !== 'paid' && status !== 'rejected') && canPerformAction('reject');
        const canReturn = id && (status === 'verified' || status === 'approved') && canPerformAction('return');
        const canEdit = id && status === 'pending';
        const canDelete = id && status === 'pending';

        return (
          <RowActions className="table-actions" maxInline={2} actions={[
            { key: 'detail', label: '详情', onClick: () => onViewDetail(record) },
            { key: 'edit', label: '编辑', disabled: !canEdit, onClick: () => onEdit(record) },
            { key: 'approve', label: '审批', disabled: !canApprove || actionSubmitting, onClick: () => onStatusUpdate(record, 'approved'), primary: true },
            { key: 'reject', label: '驳回', disabled: !canReject || actionSubmitting, onClick: () => onStatusUpdate(record, 'rejected'), danger: true },
            { key: 'return', label: '退回', disabled: !canReturn || actionSubmitting, onClick: () => onReturn(record) },
            { key: 'deduction', label: '扣款', onClick: () => onViewDeduction(record) },
            { key: 'delete', label: '删除', disabled: !canDelete, onClick: () => onDelete(record), danger: true },
          ]} />
        );
      },
    },
  ], [user, canPerformAction, actionSubmitting, onStatusUpdate, onReturn, onViewDetail, onEdit, onDelete, onViewDeduction]);

  return { columns };
};
