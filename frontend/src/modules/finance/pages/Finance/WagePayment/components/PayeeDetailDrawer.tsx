import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Drawer, Select, Space, Table, Tag, Typography, App, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  wagePaymentApi,
  BIZ_TYPE_MAP,
  type CounterpartyDetailResult,
} from '@/services/finance/wagePaymentApi';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

/** D-468：后端 Payable 实体（与前端 PayableItem 字段不同，这里单独定义） */
interface PayableRow {
  id: string;
  payableNo?: string;
  counterpartyName?: string;
  supplierName?: string;
  orderNo?: string;
  styleNo?: string;
  billType?: string;
  billCategory?: string;
  sourceType?: string;
  sourceNo?: string;
  amount?: number;
  paidAmount?: number;
  status?: string;
  description?: string;
  settlementMonth?: string;
  creatorName?: string;
  createTime?: string;
  dueDate?: string;
}

interface PayeeDetailDrawerProps {
  open: boolean;
  /** 收款方 ID（员工/工厂/客户） */
  payeeId?: string;
  payeeName?: string;
  onClose: () => void;
}

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待付款', color: 'orange' },
  partial: { text: '部分付款', color: 'blue' },
  paid: { text: '已付清', color: 'green' },
  cancelled: { text: '已取消', color: 'default' },
  overdue: { text: '已逾期', color: 'red' },
};

/** D-471：付款/支付记录状态（t_wage_payment.status） */
const PAY_STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待支付', color: 'orange' },
  processing: { text: '处理中', color: 'blue' },
  success: { text: '已支付', color: 'green' },
  paid: { text: '已支付', color: 'green' },
  failed: { text: '失败', color: 'red' },
  rejected: { text: '已驳回', color: 'red' },
  cancelled: { text: '已取消', color: 'default' },
};

const fmtMoney = (v?: number) =>
  v == null ? '-' : `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtTime = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-');

/**
 * D-468：收款方往来明细抽屉
 * 财务付款页点击收款方 → 查看该单位/员工的全部款项记录（来源、金额、状态、时间、确认人）。
 * 权限沿用财务菜单权限，此处不额外限制人员。
 */
export default function PayeeDetailDrawer({ open, payeeId, payeeName, onClose }: PayeeDetailDrawerProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CounterpartyDetailResult | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [status, setStatus] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open || !payeeId) return;
    setPage(1);
  }, [open, payeeId]);

  useEffect(() => {
    if (!open || !payeeId) return;
    let cancelled = false;
    setLoading(true);
    wagePaymentApi
      .listPayableByCounterparty({
        counterpartyId: payeeId,
        page,
        pageSize,
        startDate: range?.[0] ? range[0].format('YYYY-MM-DD') : undefined,
        endDate: range?.[1] ? range[1].format('YYYY-MM-DD') : undefined,
        status,
      })
      .then((res: unknown) => {
        if (cancelled) return;
        const payload = (res as { data?: CounterpartyDetailResult })?.data;
        setData(payload ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        message.error(e instanceof Error ? e.message : '加载明细失败');
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, payeeId, page, pageSize, range, status, message]);

  // D-471：以「付款/支付记录」为主表数据（t_wage_payment 才是业务数据所在；
  // t_payable 本租户为 0 条，早期版本只查它导致点开显示"暂无数据"）
  const rows = useMemo(
    () => (data?.payments ?? []) as unknown as PayableRow[],
    [data],
  );
  // 应付款（应付未付视角），有则追加展示
  const payableRows = useMemo(
    () => (data?.payables ?? []) as unknown as PayableRow[],
    [data],
  );

  // D-471：列对应「付款/支付记录」（paymentNo/bizType/amount/status/bizNo/operatorName/createTime）
  const columns: ColumnsType<PayableRow> = [
    {
      title: '支付单号',
      dataIndex: 'paymentNo',
      width: 170,
      render: (v?: string) => <Text style={{ fontFamily: 'monospace' }}>{v || '-'}</Text>,
    },
    {
      title: '业务类型',
      dataIndex: 'bizType',
      width: 110,
      render: (v?: string) => {
        const t = BIZ_TYPE_MAP[v || ''] ?? null;
        return t ? <Tag color={t.color}>{t.text}</Tag> : <Text type="secondary">{v || '-'}</Text>;
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 120,
      align: 'right',
      render: (v?: number) => <Text strong>{fmtMoney(v)}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v?: string) => {
        const s = PAY_STATUS_MAP[v || ''] ?? { text: v || '-', color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '业务单号',
      dataIndex: 'bizNo',
      width: 170,
      render: (v?: string) => <Text style={{ fontFamily: 'monospace' }}>{v || '-'}</Text>,
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      width: 100,
      render: (v?: string) => v || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 150,
      render: (v?: string) => fmtTime(v),
    },
  ];

  const summary = data?.summary;

  return (
    <Drawer
      title={
        <Space>
          <span>往来明细</span>
          <Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>{payeeName || '-'}</Text>
        </Space>
      }
      width="80vw"
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      {/* 汇总：一眼看清这家账清没清 */}
      <Space size={32} style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>单据数</Text>
          <div><Title level={4} style={{ margin: 0 }}>{summary?.billCount ?? '-'}</Title></div>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>应付总额</Text>
          <div><Title level={4} style={{ margin: 0 }}>{fmtMoney(summary?.totalAmount)}</Title></div>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>已付</Text>
          <div><Title level={4} style={{ margin: 0, color: 'var(--color-success)' }}>{fmtMoney(summary?.paidAmount)}</Title></div>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>未付</Text>
          <div>
            <Title level={4} style={{ margin: 0, color: 'var(--color-error)' }}>
              {fmtMoney(summary?.unpaidAmount)}
            </Title>
          </div>
        </div>
      </Space>

      <Space style={{ marginBottom: 12 }} wrap>
        <RangePicker
          value={range as never}
          onChange={(v) => {
            setRange(v as never);
            setPage(1);
          }}
          placeholder={['开始日期', '结束日期']}
        />
        <Select
          allowClear
          placeholder="状态筛选"
          style={{ width: 130 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={Object.entries(STATUS_MAP).map(([value, cfg]) => ({ value, label: cfg.text }))}
        />
        <Button
          onClick={() => {
            setRange(null);
            setStatus(undefined);
            setPage(1);
          }}
        >
          重置
        </Button>
      </Space>

      <Spin spinning={loading}>
        <Table<PayableRow>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1400 }}
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />

        {/* 应付款（应付未付视角）：本租户 t_payable 通常为空，有数据时才展示 */}
        {payableRows.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Text strong style={{ fontSize: 13 }}>应付未付单据（{payableRows.length}）</Text>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {payableRows.map((r: PayableRow) => (
                <li key={r.id}>
                  {r.payableNo || '-'} · 应付 {fmtMoney(r.amount)} · 已付 {fmtMoney(r.paidAmount)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Spin>
    </Drawer>
  );
}
