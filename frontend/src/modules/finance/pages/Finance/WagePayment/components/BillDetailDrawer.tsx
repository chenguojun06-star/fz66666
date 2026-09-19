import { useEffect, useState } from 'react';
import { Descriptions, Drawer, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  BILL_CATEGORY_MAP,
  BILL_STATUS_MAP,
  type BillAggregation,
} from '@/services/finance/billAggregationApi';
import { wagePaymentApi, type WagePayment } from '@/services/finance/wagePaymentApi';
import { toMoneyLocale } from '@/utils/format';
import { COUNTERPARTY_TYPE_MAP } from './CounterpartyLedgerTab';

const { Text } = Typography;

const fmtMoney = (v?: number) => `¥${toMoneyLocale(v)}`;
const fmtTime = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-');

/** 上游来源类型 → 中文（账单来自哪个模块推送；各列表共用，保持口径一致） */
export const SOURCE_TYPE_TEXT: Record<string, string> = {
  MATERIAL_RECONCILIATION: '面料对账',
  QUALITY_DEDUCTION: '品质扣款',
  SHIPMENT_RECONCILIATION: '出货对账',
  SHIPMENT_RECONCILIATION_DEDUCTION: '出货对账扣款',
  PAYROLL_SETTLEMENT: '工资结算',
  SECONDARY_PROCESS: '外发二次工艺',
  MATERIAL_PICKUP: '面料领用',
  MATERIAL_OUTBOUND: '物料出库',
  PRODUCT_OUTSTOCK: '成品出库',
  EXPENSE_REIMBURSEMENT: '费用报销',
  EMPLOYEE_ADVANCE: '员工借支',
  PURCHASE_RETURN: '采购退货',
  SALES_RETURN: '销售退货',
  INVENTORY_CHECK: '库存盘点',
  EC_SALES_REVENUE: '电商收入',
  STYLE_DEVELOPMENT: '样衣开发',
};

const PAY_STATUS_TEXT: Record<string, string> = {
  pending: '待支付',
  processing: '处理中',
  success: '已支付',
  paid: '已支付',
  failed: '失败',
  rejected: '已驳回',
  cancelled: '已取消',
};

interface BillDetailDrawerProps {
  open: boolean;
  bill: BillAggregation | null;
  onClose: () => void;
}

/**
 * D-473 账单详情 — 一条流水点开看全部记录。
 * 账单本身就是一条流水（上游一次推送 = 一条），这里把它从哪来、多少钱、
 * 谁确认、谁结清、对应哪笔付款记录全部摊开。
 */
export default function BillDetailDrawer({ open, bill, onClose }: BillDetailDrawerProps) {
  const [payments, setPayments] = useState<WagePayment[]>([]);
  const [loading, setLoading] = useState(false);

  // 关联付款记录：结清时以 bill.id 作为 bizId 补记，这里按它过滤
  useEffect(() => {
    if (!open || !bill?.counterpartyId) {
      setPayments([]);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res: any = await wagePaymentApi.listPayableByCounterparty({
          counterpartyId: bill.counterpartyId,
        });
        const d = res?.data ?? res ?? {};
        const list: WagePayment[] = d.payments ?? [];
        if (alive) setPayments(list.filter((p) => p.bizId === bill.id));
      } catch {
        if (alive) setPayments([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, bill]);

  const paymentColumns: ColumnsType<WagePayment> = [
    { title: '付款单号', dataIndex: 'paymentNo', width: 170, render: (v: string) => v || '-' },
    { title: '金额', dataIndex: 'amount', width: 120, align: 'right', render: (v: number) => fmtMoney(v) },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => <Tag>{PAY_STATUS_TEXT[v] ?? v ?? '-'}</Tag>,
    },
    { title: '付款时间', dataIndex: 'paymentTime', width: 160, render: (v: string) => fmtTime(v) },
    { title: '操作人', dataIndex: 'operatorName', width: 120, render: (v: string) => v || '-' },
    {
      title: '备注（分次付款会记录每次追加）',
      dataIndex: 'paymentRemark',
      width: 260,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
  ];

  const statusCfg = bill ? BILL_STATUS_MAP[bill.status] ?? null : null;
  const typeCfg = bill ? COUNTERPARTY_TYPE_MAP[(bill.counterpartyType || '').toUpperCase()] ?? null : null;

  return (
    <Drawer
      title={
        <Space>
          <span>账单详情</span>
          {bill?.billNo && <Text type="secondary" style={{ fontFamily: 'monospace' }}>{bill.billNo}</Text>}
          {statusCfg && <Tag color={statusCfg.color}>{statusCfg.text}</Tag>}
        </Space>
      }
      width={720}
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      {bill && (
        <>
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="来源模块">
              {SOURCE_TYPE_TEXT[bill.sourceType] ?? bill.sourceType ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="来源单号">{bill.sourceNo || '-'}</Descriptions.Item>
            <Descriptions.Item label="往来对象">
              <Space size={6}>
                <Text strong>{bill.counterpartyName || '-'}</Text>
                {typeCfg && <Tag color={typeCfg.color}>{typeCfg.text}</Tag>}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="账单类别">
              {BILL_CATEGORY_MAP[bill.billCategory || '']?.text ?? bill.billCategory ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label="订单号">{bill.orderNo || '-'}</Descriptions.Item>
            <Descriptions.Item label="款号">{bill.styleNo || '-'}</Descriptions.Item>
            <Descriptions.Item label="账单金额">
              <Text strong style={Number(bill.amount ?? 0) < 0 ? { color: 'var(--color-error)' } : undefined}>
                {fmtMoney(bill.amount)}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="已结清">
              <Text style={{ color: 'var(--color-success)' }}>{fmtMoney(bill.settledAmount)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="未结清">
              {Number(bill.amount ?? 0) < 0 ? (
                <Text type="secondary">扣款项，无需付款</Text>
              ) : (
                <Text strong style={{ color: 'var(--color-error)' }}>
                  {fmtMoney((bill.amount ?? 0) - (bill.settledAmount ?? 0))}
                </Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="结算月份">{bill.settlementMonth || '-'}</Descriptions.Item>
            <Descriptions.Item label="推送人">{bill.creatorName || '-'}</Descriptions.Item>
            <Descriptions.Item label="推送时间">{fmtTime(bill.createTime)}</Descriptions.Item>
            <Descriptions.Item label="确认人">{bill.confirmedByName || '-'}</Descriptions.Item>
            <Descriptions.Item label="确认时间">{fmtTime(bill.confirmedAt)}</Descriptions.Item>
            <Descriptions.Item label="结清人">{bill.settledByName || '-'}</Descriptions.Item>
            <Descriptions.Item label="结清时间">{fmtTime(bill.settledAt)}</Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>{bill.remark || '-'}</Descriptions.Item>
          </Descriptions>

          <Text strong>关联付款记录</Text>
          <div style={{ marginTop: 8 }}>
            <Table<WagePayment>
              rowKey="id"
              size="small"
              loading={loading}
              pagination={false}
              scroll={{ x: 920 }}
              locale={{ emptyText: '暂无付款记录（付款后会自动补记）' }}
              columns={paymentColumns}
              dataSource={payments}
            />
          </div>
        </>
      )}
    </Drawer>
  );
}
