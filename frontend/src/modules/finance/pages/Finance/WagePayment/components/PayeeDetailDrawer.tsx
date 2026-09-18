import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Drawer, Select, Space, Table, Tag, Typography, App, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  wagePaymentApi,
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

  const rows = useMemo(() => (data?.records ?? []) as unknown as PayableRow[], [data]);

  const columns: ColumnsType<PayableRow> = [
    {
      title: '单据编号',
      dataIndex: 'payableNo',
      width: 170,
      render: (v?: string) => <Text style={{ fontFamily: 'monospace' }}>{v || '-'}</Text>,
    },
    {
      title: '来源',
      key: 'source',
      width: 200,
      render: (_: unknown, r: PayableRow) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>
            {r.orderNo ? `订单 ${r.orderNo}` : r.sourceNo ? `来源 ${r.sourceNo}` : r.billType || r.sourceType || '-'}
          </Text>
          {r.styleNo ? <Text type="secondary" style={{ fontSize: 12 }}>款号 {r.styleNo}</Text> : null}
        </Space>
      ),
    },
    {
      title: '摘要',
      dataIndex: 'description',
      ellipsis: true,
      render: (v?: string) => v || '-',
    },
    {
      title: '应付金额',
      dataIndex: 'amount',
      width: 120,
      align: 'right',
      render: (v?: number) => <Text strong>{fmtMoney(v)}</Text>,
    },
    {
      title: '已付金额',
      dataIndex: 'paidAmount',
      width: 120,
      align: 'right',
      render: (v?: number) => fmtMoney(v),
    },
    {
      title: '未付',
      key: 'unpaid',
      width: 120,
      align: 'right',
      render: (_: unknown, r: PayableRow) => {
        const unpaid = Number(r.amount || 0) - Number(r.paidAmount || 0);
        return <Text type={unpaid > 0 ? 'danger' : 'secondary'}>{fmtMoney(unpaid > 0 ? unpaid : 0)}</Text>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v?: string) => {
        const s = STATUS_MAP[v || ''] ?? { text: v || '-', color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '提交人',
      dataIndex: 'creatorName',
      width: 100,
      render: (v?: string) => v || '-',
    },
    {
      title: '审核/确认人',
      key: 'confirmBy',
      width: 120,
      render: (_: unknown, r: PayableRow) => {
        const info = r.payableNo ? data?.confirmInfo?.[r.payableNo] : undefined;
        const name = info?.confirmBy || info?.operatorName;
        return name ? <Text>{name}</Text> : <Text type="secondary">-</Text>;
      },
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
      </Spin>
    </Drawer>
  );
}
