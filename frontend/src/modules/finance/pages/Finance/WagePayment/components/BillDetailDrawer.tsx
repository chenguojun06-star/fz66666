import { useEffect, useState } from 'react';
import { Descriptions, Drawer, Image, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  BILL_CATEGORY_MAP,
  BILL_STATUS_MAP,
  type BillAggregation,
} from '@/services/finance/billAggregationApi';
import { wagePaymentApi, type WagePayment } from '@/services/finance/wagePaymentApi';
import { toMoneyLocale } from '@/utils/format';
import { COUNTERPARTY_TYPE_MAP, PAY_STATUS_TEXT, SOURCE_TYPE_TEXT } from './counterpartyConstants';

const { Text } = Typography;

const fmtMoney = (v?: number) => `¥${toMoneyLocale(v)}`;
const fmtTime = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-');

// D-474：常量统一从 counterpartyConstants 引入（原来定义在本文件会造成组件循环依赖）

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
  // D-474：按款号带出款式封面与名称，方便核对"这笔钱是做哪个款产生的"
  const [styleInfo, setStyleInfo] = useState<any>(null);

  useEffect(() => {
    if (!open || !bill?.styleNo) {
      setStyleInfo(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const info = await getStyleInfoByRef(bill.styleNo, bill.styleNo);
        if (alive) setStyleInfo(info ?? null);
      } catch {
        if (alive) setStyleInfo(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, bill?.styleNo]);

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
          {/* D-474：带上款式的封面图与名称，核对这笔费用时一眼知道是哪个款 */}
          {styleInfo && (
            <Space
              align="start"
              style={{
                marginBottom: 16,
                padding: 12,
                border: '1px solid var(--color-border-secondary)',
                borderRadius: 6,
                background: 'var(--color-fill-tertiary)',
                width: '100%',
              }}
            >
              {styleInfo.cover ? (
                <Image
                  src={String(styleInfo.cover)}
                  width={96}
                  height={96}
                  style={{ objectFit: 'cover', borderRadius: 4 }}
                  fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
                />
              ) : (
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 4,
                    background: 'var(--color-fill-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-tertiary)',
                    fontSize: 12,
                  }}
                >
                  无图
                </div>
              )}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{styleInfo.styleName || bill.styleNo}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  款号：{bill.styleNo || '-'}
                </div>
                {styleInfo.category && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    品类：{styleInfo.category}
                  </div>
                )}
              </div>
            </Space>
          )}
          <Descriptions
            column={2}
            bordered
            style={{ marginBottom: 16 }}
            labelStyle={{ fontSize: 13, fontWeight: 500, width: 110 }}
            contentStyle={{ fontSize: 13 }}
          >
            <Descriptions.Item label="来源模块">
              {SOURCE_TYPE_TEXT[bill.sourceType] ?? bill.sourceType ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <span>
                  来源单号
                  <Tooltip title="这张账单是上游哪个单据推送来的原始单号，例如 SD-146 表示第 146 号样衣开发单；点开来源模块里同名单据可看到明细。">
                    <QuestionCircleOutlined style={{ marginLeft: 4, color: 'var(--color-text-tertiary)' }} />
                  </Tooltip>
                </span>
              }
            >
              {bill.sourceNo || '-'}
            </Descriptions.Item>
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
            {/* D-474：付款进度——钱付了多少、还剩多少，一眼看全（扣款项不显示） */}
            {Number(bill.amount ?? 0) > 0 && (
              <Descriptions.Item label="付款进度" span={3}>
                <Progress
                  percent={Math.min(
                    100,
                    Math.round(((bill.settledAmount ?? 0) / (bill.amount || 1)) * 100),
                  )}
                  size="small"
                  status={
                    (bill.settledAmount ?? 0) >= (bill.amount ?? 0)
                      ? 'success'
                      : (bill.settledAmount ?? 0) > 0
                        ? 'active'
                        : 'normal'
                  }
                  format={() =>
                    `已付 ${fmtMoney(bill.settledAmount)} / 共 ${fmtMoney(bill.amount)}，还剩 ${fmtMoney(
                      (bill.amount ?? 0) - (bill.settledAmount ?? 0),
                    )}`
                  }
                />
              </Descriptions.Item>
            )}
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
