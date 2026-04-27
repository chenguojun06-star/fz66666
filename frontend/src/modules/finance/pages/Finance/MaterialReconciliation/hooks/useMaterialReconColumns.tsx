import React from 'react';
import { useMemo } from 'react';
import { Button, Tag } from 'antd';
import type { MaterialReconType } from '@/types/finance';
import { getMaterialReconStatusConfig } from '@/constants/finance';
import { formatDateTime } from '@/utils/datetime';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import RowActions from '@/components/common/RowActions';

type UseMaterialReconColumnsParams = {
  user: any;
  canPerformAction: (action: string) => boolean;
  approvalSubmitting: boolean;
  updateStatusBatch: (pairs: Array<{ id: string; status: string }>, successText: string) => Promise<void>;
  openRejectModal: (ids: string[]) => void;
  openDialog: (recon?: MaterialReconType) => void;
};

const MaterialThumb: React.FC<{ imageUrl?: string }> = ({ imageUrl }) => (
  <div style={{ width: 48, minHeight: 28, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
    {imageUrl ? <img src={getFullAuthedFileUrl(imageUrl)} alt="物料" style={{ width: '100%', height: 'auto', display: 'block' }} /> : <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-sm)', height: '48px', display: 'flex', alignItems: 'center' }}>无图</span>}
  </div>
);

export const useMaterialReconColumns = ({
  user, canPerformAction, approvalSubmitting, updateStatusBatch, openRejectModal, openDialog,
}: UseMaterialReconColumnsParams) => {
  const columns = useMemo(() => [
    { title: '图片', key: 'cover', width: 72, render: (_: any, record: MaterialReconType) => <MaterialThumb imageUrl={record.materialImageUrl} /> },
    { title: '对账单号', dataIndex: 'reconciliationNo', key: 'reconciliationNo', width: 140, render: (_: any, record: MaterialReconType) => <Button type="link" size="small" onClick={() => openDialog(record)} style={{ padding: 0 }}>{String(record.reconciliationNo || '').trim() || '-'}</Button> },
    { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 120, render: (_: unknown, record: MaterialReconType) => <SupplierNameTooltip name={record.supplierName} contactPerson={(record as any).supplierContactPerson} contactPhone={(record as any).supplierContactPhone} /> },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 100 },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', ellipsis: true },
    { title: '采购单号', dataIndex: 'purchaseNo', key: 'purchaseNo', width: 120 },
    { title: '采购类型', dataIndex: 'sourceType', key: 'sourceType', width: 100, render: (value: string) => { if (value === 'sample') return <Tag color="purple">样衣采购</Tag>; if (value === 'order') return <Tag color="blue">大货采购</Tag>; return <Tag color="green">批量采购</Tag>; } },
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 140 },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 110 },
    { title: '实到数量', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' as const, render: (value: number, record: any) => `${value || 0}${record?.unit ? ' ' + record.unit : ''}` },
    { title: '采购单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 110, align: 'right' as const, render: (value: number, record: any) => { if (!canViewPrice(user)) return '***'; return `¥${value?.toFixed(2) || '0.00'}${record?.unit ? '/' + record.unit : ''}`; } },
    { title: '采购汇总', key: 'purchaseTotal', width: 120, align: 'right' as const, render: (_: any, record: any) => { if (!canViewPrice(user)) return '***'; const total = Number(record?.quantity || 0) * Number(record?.unitPrice || 0); return <span style={{ color: total > 0 ? 'var(--primary-color)' : undefined }}>¥{total.toFixed(2)}</span>; } },
    { title: '采购完成', dataIndex: 'reconciliationDate', key: 'reconciliationDate', width: 120, render: (value: unknown) => formatDateTime(value) },
    { title: '采购员', dataIndex: 'purchaserName', key: 'purchaserName', width: 100, render: (value: string) => value || '-' },
    { title: '入库日期', dataIndex: 'inboundDate', key: 'inboundDate', width: 110, render: (value: unknown) => formatDateTime(value) || '-' },
    { title: '库区', dataIndex: 'warehouseLocation', key: 'warehouseLocation', width: 100, render: (value: string) => value || '-' },
    { title: '对账周期', key: 'reconciliationPeriod', width: 200, render: (_: any, record: any) => { const start = formatDateTime(record?.periodStartDate); const end = formatDateTime(record?.periodEndDate); if (!start && !end) return '-'; return `${start || '?'} ~ ${end || '?'}`; } },
    { title: '对账人', dataIndex: 'reconciliationOperatorName', key: 'reconciliationOperatorName', width: 100, render: (v: unknown) => v || '-' },
    { title: '审核人', dataIndex: 'auditOperatorName', key: 'auditOperatorName', width: 100, render: (v: unknown) => v || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (status: MaterialReconType['status']) => { const { text, color } = getMaterialReconStatusConfig(status); return <Tag color={color}>{text}</Tag>; } },
    {
      title: '操作', key: 'action', width: 150, fixed: 'right' as const,
      render: (_: any, record: MaterialReconType) => {
        const id = String(record.id || '').trim();
        const status = String(record.status || '').trim();
        const canApprove = Boolean(id) && status === 'pending' && canPerformAction('approve');
        const canPay = Boolean(id) && status === 'approved';
        const canReject = Boolean(id) && (status === 'approved' || status === 'paid') && canPerformAction('reject');
        const canResubmit = Boolean(id) && status === 'rejected';
        return (
          <RowActions className="table-actions" maxInline={1} actions={[
            { key: 'approve', label: '审批', disabled: !canApprove || approvalSubmitting, onClick: () => updateStatusBatch([{ id, status: 'approved' }], '审批成功'), primary: true },
            { key: 'pay', label: '付款', disabled: !canPay || approvalSubmitting, onClick: () => updateStatusBatch([{ id, status: 'paid' }], '付款成功'), primary: true },
            { key: 'resubmit', label: '重新提交', disabled: !canResubmit || approvalSubmitting, onClick: () => updateStatusBatch([{ id, status: 'pending' }], '已重新提交') },
            { key: 'reject', label: '驳回', disabled: !canReject || approvalSubmitting, onClick: () => openRejectModal([id]), danger: true },
          ]} />
        );
      },
    },
  ], [user, canPerformAction, approvalSubmitting, updateStatusBatch, openRejectModal, openDialog]);

  return { columns };
};
