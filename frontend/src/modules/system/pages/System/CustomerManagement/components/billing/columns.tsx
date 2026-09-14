import React from 'react';
import { Tag, Progress } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import type { TenantInfo, BillingRecord } from '@/services/tenantService';
import { PLAN_LABELS, BILL_STATUS, CYCLE_LABELS, INVOICE_STATUS_MAP, formatStorageSize } from './helpers';

export interface TenantColumnActions {
  handleOpenPlanModal: (record: TenantInfo) => void;
  handleOpenOverview: (record: TenantInfo) => void;
  handleGenerateBill: (record: TenantInfo) => void;
}

export const getTenantColumns = (actions: TenantColumnActions): ColumnsType<TenantInfo> => {
  const { handleOpenPlanModal, handleOpenOverview, handleGenerateBill } = actions;
  return [
    { title: '工厂名称', dataIndex: 'tenantName', width: 160 },
    { title: '租户编码', dataIndex: 'tenantCode', width: 100 },
    {
      title: '当前套餐', dataIndex: 'planType', width: 100, align: 'center',
      render: (v: string) => {
        const cfg = PLAN_LABELS[v] || { label: '未知', color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '月费', dataIndex: 'monthlyFee', width: 90, align: 'right',
      render: (v: number) => v > 0 ? `¥${v}` : <span style={{ color: 'var(--color-text-tertiary)' }}>免费</span>,
    },
    {
      title: '计费', dataIndex: 'billingCycle', width: 70, align: 'center',
      render: (v: string) => {
        if (v === 'YEARLY') return <Tag color="blue">年付</Tag>;
        return <Tag>月付</Tag>;
      },
    },
    {
      title: '存储配额', width: 140,
      render: (_: unknown, r: TenantInfo) => {
        const used = r.storageUsedMb || 0;
        const quota = r.storageQuotaMb || 1024;
        const percent = quota > 0 ? Math.round(used * 100 / quota) : 0;
        return (
          <div style={{ minWidth: 100 }}>
            <Progress
              percent={percent}

              status={percent >= 90 ? 'exception' : 'normal'}
              format={() => `${formatStorageSize(used)}/${formatStorageSize(quota)}`}
              style={{ marginBottom: 0 }}
            />
          </div>
        );
      },
    },
    {
      title: '用户数', dataIndex: 'maxUsers', width: 80, align: 'center',
      render: (v: number) => v || '-',
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: TenantInfo) => {
        const actions: RowAction[] = [
          { key: 'plan', label: '设置套餐', primary: true, onClick: () => handleOpenPlanModal(record) },
          { key: 'overview', label: '账单详情', onClick: () => handleOpenOverview(record) },
          { key: 'generate', label: '生成账单', onClick: () => handleGenerateBill(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];
};

export interface BillColumnActions {
  handleMarkBillPaid: (bill: BillingRecord) => void;
  handleWaiveBill: (bill: BillingRecord) => void;
  handleIssueInvoice: (bill: BillingRecord) => void;
}

export const getBillColumns = (actions: BillColumnActions): ColumnsType<BillingRecord> => {
  const { handleMarkBillPaid, handleWaiveBill, handleIssueInvoice } = actions;
  return [
    { title: '账单编号', dataIndex: 'billingNo', width: 150 },
    { title: '租户', dataIndex: 'tenantName', width: 130 },
    { title: '账期', dataIndex: 'billingMonth', width: 100, align: 'center' },
    {
      title: '套餐', dataIndex: 'planType', width: 90, align: 'center',
      render: (v: string) => PLAN_LABELS[v]?.label ?? '未知',
    },
    {
      title: '周期', dataIndex: 'billingCycle', width: 60, align: 'center',
      render: (v: string) => CYCLE_LABELS[v] ?? (v ? '未知' : '月付'),
    },
    { title: '基础费', dataIndex: 'baseFee', width: 90, align: 'right', render: (v: number) => `¥${v}` },
    { title: '合计', dataIndex: 'totalAmount', width: 90, align: 'right',
      render: (v: number) => <strong>¥{v}</strong>,
    },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center',
      render: (v: string) => {
        const cfg = BILL_STATUS[v] || { label: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '支付时间', dataIndex: 'paidTime', width: 150 },
    {
      title: '发票', dataIndex: 'invoiceStatus', width: 80, align: 'center',
      render: (v: string) => {
        const cfg = INVOICE_STATUS_MAP[v] || { label: v || '—', color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: BillingRecord) => {
        const actions: RowAction[] = [];
        if (record.status !== 'PAID' && record.status !== 'WAIVED') {
          actions.push({ key: 'pay', label: '标记已付', primary: true, onClick: () => handleMarkBillPaid(record) });
          actions.push({ key: 'waive', label: '减免', onClick: () => handleWaiveBill(record) });
        }
        if ((record as any).invoiceStatus === 'PENDING') {
          actions.push({ key: 'invoice', label: '确认开票', onClick: () => handleIssueInvoice(record) });
        }
        return actions.length > 0 ? <RowActions actions={actions} /> : '-';
      },
    },
  ];
};
