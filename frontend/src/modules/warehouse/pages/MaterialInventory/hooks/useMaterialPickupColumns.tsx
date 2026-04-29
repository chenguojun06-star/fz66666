import { Button, Tag, Space, Popconfirm } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { formatMaterialSpecWidth } from '@/utils/materialType';

type LegacyPickupRecord = Record<string, any>;

interface UsedActions {
  onAudit:   (record: LegacyPickupRecord) => void;
  onFinance: (record: LegacyPickupRecord) => void;
  onCancel:  (id: string) => void;
  onOpenReceivable: (record: LegacyPickupRecord) => void;
}

const PICKUP_TYPE_MAP: Record<string, { color: string; text: string }> = {
  INTERNAL: { color: 'green',  text: '内部' },
  EXTERNAL: { color: 'blue',   text: '外部' },
};

const MOVEMENT_TYPE_MAP: Record<string, { color: string; text: string }> = {
  INBOUND: { color: 'cyan', text: '入库' },
  OUTBOUND: { color: 'orange', text: '出库' },
};

const AUDIT_STATUS_MAP: Record<string, { color: string; text: string }> = {
  PENDING:  { color: 'orange', text: '待审核' },
  APPROVED: { color: 'green',  text: '已通过' },
  REJECTED: { color: 'red',    text: '已拒绝' },
};

const FINANCE_STATUS_MAP: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'default', text: '待入账' },
  SETTLED: { color: 'blue',    text: '已入账' },
};

const RECEIVABLE_STATUS_MAP: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'orange', text: '待收款' },
  PARTIAL: { color: 'gold', text: '部分收款' },
  PAID: { color: 'green', text: '已收款' },
  OVERDUE: { color: 'red', text: '逾期未收' },
};

function fmtTime(t?: string) {
  if (!t) return '-';
  return String(t).replace('T', ' ').substring(0, 16);
}

export function useMaterialPickupColumns(actions: UsedActions): ColumnsType<LegacyPickupRecord> {
  return [
    {
      title: '领取单号',
      dataIndex: 'pickupNo',
      width: 145,
      ellipsis: true,
    },
    {
      title: '流转方向',
      dataIndex: 'movementType',
      width: 90,
      render: (v?: string) => {
        const cfg = MOVEMENT_TYPE_MAP[v || 'OUTBOUND'] ?? { color: 'default', text: v || '-' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
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
      title: '用料场景',
      dataIndex: 'usageType',
      width: 110,
      render: (v?: string) => {
        const map: Record<string, string> = {
          BULK: '大货用料',
          SAMPLE: '样衣用料',
          STOCK: '备库/补库',
          OTHER: '其他',
        };
        return map[v || ''] || v || '-';
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
      title: '生产方',
      key: 'factoryName',
      width: 150,
      ellipsis: true,
      render: (_: unknown, record: LegacyPickupRecord) => {
        const { factoryName, factoryType, orderBizType } = record;
        if (!factoryName) return '-';
        const bizColorMap: Record<string, string> = { FOB: 'cyan', ODM: 'purple', OEM: 'blue', CMT: 'orange' };
        return (
          <Space size={4}>
            {factoryType === 'INTERNAL' && <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>内</Tag>}
            {factoryType === 'EXTERNAL' && <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>外</Tag>}
            <span style={{ fontSize: 12 }}>{factoryName}</span>
            {orderBizType && <Tag color={bizColorMap[orderBizType] ?? 'default'} style={{ fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>{orderBizType}</Tag>}
          </Space>
        );
      },
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
      title: '规格/幅宽',
      key: 'specWidth',
      width: 150,
      ellipsis: true,
      render: (_: unknown, record) => formatMaterialSpecWidth(record.specification, record.fabricWidth),
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
      render: (v?: number, record?: LegacyPickupRecord) =>
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
      dataIndex: 'receiverName',
      width: 100,
      ellipsis: true,
      render: (v?: string, record?: LegacyPickupRecord) => v || record?.pickerName || '-',
    },
    {
      title: '出库/入库人',
      dataIndex: 'issuerName',
      width: 110,
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '库位',
      dataIndex: 'warehouseLocation',
      width: 120,
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
      title: '应收单',
      dataIndex: 'receivableNo',
      width: 150,
      ellipsis: true,
      render: (v: string | undefined, record: LegacyPickupRecord) => (
        v ? (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => actions.onOpenReceivable(record)}>
            {v}
          </Button>
        ) : '-'
      ),
    },
    {
      title: '收款状态',
      dataIndex: 'receivableStatus',
      width: 110,
      render: (v?: string) => {
        const cfg = RECEIVABLE_STATUS_MAP[v || ''] ?? { color: 'default', text: v || '-' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '已收金额',
      dataIndex: 'receivedAmount',
      width: 110,
      align: 'right' as const,
      render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-',
    },
    {
      title: '收款时间',
      dataIndex: 'receivedTime',
      width: 150,
      render: fmtTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_: unknown, record: LegacyPickupRecord) => (
        <Space size={4}>
          {record.receivableId && (
            <Button
              size="small"
              onClick={() => actions.onOpenReceivable(record)}
            >
              应收详情
            </Button>
          )}
          {record.auditStatus === 'PENDING' && (
            <Button
              size="small"
              type="primary"
              onClick={() => actions.onAudit(record)}
            >
              审核
            </Button>
          )}
          {record.movementType !== 'INBOUND' && record.auditStatus === 'APPROVED' && record.receivableNo == null && (
            <Button
              size="small"
              onClick={() => actions.onFinance(record)}
            >
              补录账单
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
