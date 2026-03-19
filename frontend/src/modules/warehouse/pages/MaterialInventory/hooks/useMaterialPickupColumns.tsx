import React from 'react';
import { Button, Tag, Space, Popconfirm } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MaterialPickupRecord } from './useMaterialPickupData';

interface UsedActions {
  onAudit:   (record: MaterialPickupRecord) => void;
  onFinance: (record: MaterialPickupRecord) => void;
  onCancel:  (id: string) => void;
}

const PICKUP_TYPE_MAP: Record<string, { color: string; text: string }> = {
  INTERNAL: { color: 'green',  text: '内部' },
  EXTERNAL: { color: 'blue',   text: '外部' },
};

const AUDIT_STATUS_MAP: Record<string, { color: string; text: string }> = {
  PENDING:  { color: 'orange', text: '待审核' },
  APPROVED: { color: 'green',  text: '已通过' },
  REJECTED: { color: 'red',    text: '已拒绝' },
};

const FINANCE_STATUS_MAP: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'default', text: '待核算' },
  SETTLED: { color: 'blue',    text: '已核算' },
};

function fmtTime(t?: string) {
  if (!t) return '-';
  return String(t).replace('T', ' ').substring(0, 16);
}

export function useMaterialPickupColumns(actions: UsedActions): ColumnsType<MaterialPickupRecord> {
  return [
    {
      title: '领取单号',
      dataIndex: 'pickupNo',
      width: 145,
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'pickupType',
      width: 80,
      render: (v: string) => {
        const cfg = PICKUP_TYPE_MAP[v] ?? { color: 'default', text: v };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      width: 145,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      width: 120,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '物料编号',
      dataIndex: 'materialCode',
      width: 120,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      width: 160,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '物料类型',
      dataIndex: 'materialType',
      width: 90,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '颜色',
      dataIndex: 'color',
      width: 90,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '规格',
      dataIndex: 'specification',
      width: 120,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '幅宽',
      dataIndex: 'fabricWidth',
      width: 90,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '克重',
      dataIndex: 'fabricWeight',
      width: 90,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '成分',
      dataIndex: 'fabricComposition',
      width: 120,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 100,
      align: 'right' as const,
      render: (v?: number, record?: MaterialPickupRecord) =>
        v != null ? `${v} ${record?.unit ?? ''}` : '-',
    },
    {
      title: '单价(元)',
      dataIndex: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-',
    },
    {
      title: '金额(元)',
      dataIndex: 'amount',
      width: 110,
      align: 'right' as const,
      render: (v?: number) => (
        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
          {v != null ? `¥${v.toFixed(2)}` : '-'}
        </span>
      ),
    },
    {
      title: '领取人',
      dataIndex: 'pickerName',
      width: 90,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '领取时间',
      dataIndex: 'pickupTime',
      width: 150,
      render: fmtTime,
    },
    {
      title: '审核状态',
      dataIndex: 'auditStatus',
      width: 100,
      render: (v: string) => {
        const cfg = AUDIT_STATUS_MAP[v] ?? { color: 'default', text: v };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '财务状态',
      dataIndex: 'financeStatus',
      width: 100,
      render: (v: string) => {
        const cfg = FINANCE_STATUS_MAP[v] ?? { color: 'default', text: v };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right' as const,
      render: (_: unknown, record: MaterialPickupRecord) => (
        <Space size={4}>
          {record.auditStatus === 'PENDING' && (
            <Button
              size="small"
              type="primary"
              onClick={() => actions.onAudit(record)}
            >
              审核
            </Button>
          )}
          {record.auditStatus === 'APPROVED' && record.financeStatus === 'PENDING' && (
            <Button
              size="small"
              onClick={() => actions.onFinance(record)}
            >
              财务核算
            </Button>
          )}
          {record.auditStatus === 'PENDING' && (
            <Popconfirm
              title="确认作废"
              description="作废后将不可恢复，是否继续？"
              onConfirm={() => actions.onCancel(record.id)}
              okText="作废"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger>作废</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];
}
