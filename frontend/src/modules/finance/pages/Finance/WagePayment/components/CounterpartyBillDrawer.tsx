import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Drawer,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  billAggregationApi,
  BILL_CATEGORY_MAP,
  BILL_STATUS_MAP,
  type BillAggregation,
} from '@/services/finance/billAggregationApi';
import { toMoneyLocale } from '@/utils/format';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { COUNTERPARTY_TYPE_MAP } from './CounterpartyLedgerTab';

const { Text, Title } = Typography;

const fmtMoney = (v?: number) => `¥${toMoneyLocale(v)}`;
const fmtTime = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-');

/** 可结清 / 可驳回 / 可确认 的状态集合（与后端 BillConstants 口径一致） */
const SETTLEABLE = ['CONFIRMED', 'SETTLING'];
const REJECTABLE = ['PENDING', 'CONFIRMED', 'SETTLING'];
const CONFIRMABLE = ['PENDING'];

/** 详情抽屉入参：主列表聚合行整行带入（头部汇总不再二次请求） */
export interface CounterpartyDrawerTarget {
  counterpartyId: string;
  counterpartyName: string;
  counterpartyType: string;
  billCount?: number;
  totalAmount?: number;
  settledAmount?: number;
  unsettledAmount?: number;
}

interface CounterpartyBillDrawerProps {
  open: boolean;
  target: CounterpartyDrawerTarget | null;
  /** 从主列表继承的月份筛选 */
  initialMonth?: dayjs.Dayjs | null;
  onClose: () => void;
  /** 任一动作成功后回调（主列表刷新汇总） */
  onChanged?: () => void;
}

/**
 * D-472 往来对象详情 — 点击往来总账里的对象名进入。
 * 展示该对象名下全部上游推送流水，支持单笔/批量付款（结清）、单笔/批量驳回、整月合并付款。
 */
export default function CounterpartyBillDrawer({
  open,
  target,
  initialMonth,
  onClose,
  onChanged,
}: CounterpartyBillDrawerProps) {
  const { message } = App.useApp();
  const { modal } = App.useApp();

  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState<BillAggregation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [month, setMonth] = useState<dayjs.Dayjs | null>(null);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  // 单笔付款弹窗（金额默认全额可改——对齐"终审金额可编辑"口径）
  const [settleTarget, setSettleTarget] = useState<BillAggregation | null>(null);
  const [settleAmount, setSettleAmount] = useState<number | null>(null);
  const [settleSubmitting, setSettleSubmitting] = useState(false);

  // 驳回（单笔与批量共用，bills 长度区分）
  const [rejectTargets, setRejectTargets] = useState<BillAggregation[]>([]);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const [actionSubmitting, setActionSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setSelectedKeys([]);
    setMonth(initialMonth ?? null);
    setStatus(undefined);
  }, [open, target?.counterpartyId, initialMonth]);

  const fetchBills = useCallback(async () => {
    if (!open || !target) return;
    setLoading(true);
    try {
      const res: any = await billAggregationApi.listBills({
        pageNum: page,
        pageSize,
        counterpartyId: target.counterpartyId,
        counterpartyName: target.counterpartyId ? undefined : target.counterpartyName,
        settlementMonth: month ? month.format('YYYY-MM') : undefined,
        status,
      });
      const pageData = res?.data ?? res ?? {};
      setBills(pageData?.records ?? []);
      setTotal(pageData?.total ?? 0);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载往来明细失败');
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [open, target, page, pageSize, month, status, message]);

  useEffect(() => {
    void fetchBills();
  }, [fetchBills]);

  const afterChange = useCallback(() => {
    setSelectedKeys([]);
    void fetchBills();
    onChanged?.();
  }, [fetchBills, onChanged]);

  // 勾选行按状态分组（批量动作只对合法状态的行生效）
  const selectedBills = useMemo(
    () => bills.filter((b) => selectedKeys.includes(b.id)),
    [bills, selectedKeys],
  );

  /** 单笔付款（结清） */
  const handleSettleOne = async () => {
    if (!settleTarget) return;
    const amt = Number(settleAmount ?? settleTarget.amount ?? 0);
    if (!(amt > 0)) {
      message.error('结清金额必须大于0');
      return;
    }
    setSettleSubmitting(true);
    try {
      await billAggregationApi.settleBill(settleTarget.id, amt);
      message.success(`已结清 ${settleTarget.billNo || ''}`);
      setSettleTarget(null);
      afterChange();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '结清失败');
    } finally {
      setSettleSubmitting(false);
    }
  };

  /** 批量付款（对勾选的可结清账单按全额结清） */
  const handleBatchSettle = () => {
    const rows = selectedBills.filter((b) => SETTLEABLE.includes(b.status));
    if (rows.length === 0) {
      message.warning('勾选中没有可付款（已确认未结清）的账单');
      return;
    }
    const sum = rows.reduce(
      (s, b) => s + (Number(b.amount ?? 0) - Number(b.settledAmount ?? 0)),
      0,
    );
    modal.confirm({
      title: '批量付款',
      content: `将把 ${rows.length} 笔账单按未结金额合计 ${fmtMoney(sum)} 一次性结清，确认付款？`,
      okText: '确认付款',
      onOk: async () => {
        await billAggregationApi.batchSettle(rows.map((b) => b.id));
        message.success(`已批量结清 ${rows.length} 笔`);
        afterChange();
      },
    });
  };

  /** 整月合并付款：当前月份筛选下该对象全部已确认未结清一键结清 */
  const handleMergeSettle = async () => {
    if (!target) return;
    setActionSubmitting(true);
    try {
      const res: any = await billAggregationApi.listBills({
        pageNum: 1,
        pageSize: 500,
        counterpartyId: target.counterpartyId,
        counterpartyName: target.counterpartyId ? undefined : target.counterpartyName,
        settlementMonth: month ? month.format('YYYY-MM') : undefined,
        status: 'CONFIRMED',
      });
      const records: BillAggregation[] = (res?.data ?? res)?.records ?? [];
      const rows = records.filter((b) => SETTLEABLE.includes(b.status));
      if (rows.length === 0) {
        message.warning(
          month ? `${month.format('YYYY-MM')} 没有 待付款（已确认） 的账单` : '该对象没有 待付款（已确认） 的账单',
        );
        return;
      }
      const sum = rows.reduce(
        (s, b) => s + (Number(b.amount ?? 0) - Number(b.settledAmount ?? 0)),
        0,
      );
      modal.confirm({
        title: '合并付款',
        content: `将把该对象${month ? ` ${month.format('YYYY-MM')}` : '（全部月份）'}共 ${rows.length} 笔未结账单一次性结清，合计 ${fmtMoney(sum)}，确认付款？`,
        okText: '确认付款',
        onOk: async () => {
          await billAggregationApi.batchSettle(rows.map((b) => b.id));
          message.success(`已合并结清 ${rows.length} 笔`);
          afterChange();
        },
      });
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载待付账单失败');
    } finally {
      setActionSubmitting(false);
    }
  };

  /** 批量确认 */
  const handleBatchConfirm = async () => {
    const rows = selectedBills.filter((b) => CONFIRMABLE.includes(b.status));
    if (rows.length === 0) {
      message.warning('勾选中没有待确认的账单');
      return;
    }
    setActionSubmitting(true);
    try {
      const count: number = ((await billAggregationApi.batchConfirm(rows.map((b) => b.id))) as any)?.data ?? rows.length;
      message.success(`已确认 ${count} 笔`);
      afterChange();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '批量确认失败');
    } finally {
      setActionSubmitting(false);
    }
  };

  /** 驳回确认（单笔/批量共用） */
  const handleRejectOk = async (reason: string) => {
    if (rejectTargets.length === 0) return;
    setRejectSubmitting(true);
    try {
      if (rejectTargets.length === 1) {
        await billAggregationApi.cancelBill(rejectTargets[0].id, reason || '驳回');
        message.success('已驳回');
      } else {
        const count: number = ((await billAggregationApi.batchCancel(
          rejectTargets.map((b) => b.id),
          reason || '批量驳回',
        )) as any)?.data ?? rejectTargets.length;
        message.success(`已驳回 ${count} 笔`);
      }
      setRejectTargets([]);
      afterChange();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '驳回失败');
      throw e instanceof Error ? e : new Error('驳回失败');
    } finally {
      setRejectSubmitting(false);
    }
  };

  const columns: ColumnsType<BillAggregation> = [
    {
      title: '账单编号',
      dataIndex: 'billNo',
      width: 160,
      render: (v: string) => <Text style={{ fontFamily: 'monospace' }}>{v || '-'}</Text>,
    },
    {
      title: '类目',
      dataIndex: 'billCategory',
      width: 90,
      render: (v: string) => {
        const t = BILL_CATEGORY_MAP[v || ''] ?? null;
        return t ? <Tag color={t.color}>{t.text}</Tag> : <Text type="secondary">{v || '-'}</Text>;
      },
    },
    {
      title: '来源单号',
      dataIndex: 'sourceNo',
      width: 150,
      render: (v: string) => <Text style={{ fontFamily: 'monospace' }}>{v || '-'}</Text>,
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 120,
      align: 'right',
      render: (v: number) => <Text strong>{fmtMoney(v)}</Text>,
    },
    {
      title: '已结清',
      dataIndex: 'settledAmount',
      width: 120,
      align: 'right',
      render: (v: number) => fmtMoney(v),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => {
        const s = BILL_STATUS_MAP[v || ''] ?? { text: v || '-', color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '结算月',
      dataIndex: 'settlementMonth',
      width: 90,
      render: (v: string) => v || '-',
    },
    {
      title: '推送时间',
      dataIndex: 'createTime',
      width: 140,
      render: (v: string) => fmtTime(v),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, r) => (
        <Space size={4}>
          {CONFIRMABLE.includes(r.status) && (
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              disabled={actionSubmitting}
              onClick={async () => {
                try {
                  await billAggregationApi.confirmBill(r.id);
                  message.success('已确认');
                  afterChange();
                } catch (e: unknown) {
                  message.error(e instanceof Error ? e.message : '确认失败');
                }
              }}
            >
              确认
            </Button>
          )}
          {SETTLEABLE.includes(r.status) && (
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              onClick={() => {
                setSettleTarget(r);
                setSettleAmount(Number(r.amount ?? 0));
              }}
            >
              付款
            </Button>
          )}
          {REJECTABLE.includes(r.status) && (
            <Button
              type="link"
              size="small"
              danger
              style={{ padding: 0 }}
              onClick={() => setRejectTargets([r])}
            >
              驳回
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const typeTag = target ? COUNTERPARTY_TYPE_MAP[target.counterpartyType] ?? null : null;

  return (
    <Drawer
      title={
        <Space>
          <span>往来明细</span>
          <Text strong>{target?.counterpartyName || '-'}</Text>
          {typeTag && <Tag color={typeTag.color}>{typeTag.text}</Tag>}
        </Space>
      }
      width="80vw"
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      {/* 汇总：对象整体口径（来自主列表聚合行） */}
      <Space size={32} style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>账单笔数</Text>
          <div><Title level={4} style={{ margin: 0 }}>{target?.billCount ?? '-'}</Title></div>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>累计金额</Text>
          <div><Title level={4} style={{ margin: 0 }}>{fmtMoney(target?.totalAmount)}</Title></div>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>已结清</Text>
          <div>
            <Title level={4} style={{ margin: 0, color: 'var(--color-success)' }}>
              {fmtMoney(target?.settledAmount)}
            </Title>
          </div>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>未结清</Text>
          <div>
            <Title level={4} style={{ margin: 0, color: 'var(--color-error)' }}>
              {fmtMoney(target?.unsettledAmount)}
            </Title>
          </div>
        </div>
      </Space>

      {/* 筛选 + 操作区 */}
      <Space style={{ marginBottom: 12 }} wrap>
        <DatePicker
          picker="month"
          value={month}
          onChange={(v) => {
            setMonth(v);
            setPage(1);
          }}
          allowClear
          placeholder="按月筛选"
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
          options={Object.entries(BILL_STATUS_MAP).map(([value, cfg]) => ({ value, label: cfg.text }))}
        />
        <Button onClick={() => { setMonth(null); setStatus(undefined); setPage(1); }}>重置</Button>
      </Space>
      <Space style={{ marginBottom: 12, marginLeft: 12 }} wrap>
        <Button
          disabled={selectedKeys.length === 0 || actionSubmitting}
          onClick={handleBatchConfirm}
        >
          批量确认
        </Button>
        <Button
          type="primary"
          disabled={selectedKeys.length === 0 || actionSubmitting}
          onClick={handleBatchSettle}
        >
          批量付款
        </Button>
        <Button
          danger
          disabled={selectedKeys.length === 0 || actionSubmitting}
          onClick={() => setRejectTargets(selectedBills.filter((b) => REJECTABLE.includes(b.status)))}
        >
          批量驳回
        </Button>
        <Button
          type="primary"
          ghost
          loading={actionSubmitting}
          onClick={() => void handleMergeSettle()}
        >
          合并付款{month ? `（${month.format('YYYY-MM')}）` : '（全部月份）'}
        </Button>
      </Space>

      <Spin spinning={loading}>
        <Table<BillAggregation>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={bills}
          scroll={{ x: 1200 }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys,
            getCheckboxProps: (r) => ({ disabled: r.status === 'SETTLED' || r.status === 'CANCELLED' }),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Spin>

      {/* 单笔付款弹窗 */}
      <Modal
        title="付款结清"
        open={!!settleTarget}
        onOk={() => void handleSettleOne()}
        confirmLoading={settleSubmitting}
        onCancel={() => setSettleTarget(null)}
        destroyOnHidden
      >
        {settleTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Text type="secondary">
              {settleTarget.billNo || '-'} · {BILL_CATEGORY_MAP[settleTarget.billCategory || '']?.text || '-'}
              {' '}· 账单金额 {fmtMoney(settleTarget.amount)}
            </Text>
            <Space>
              <Text>本次结清金额</Text>
              <InputNumber
                value={settleAmount}
                onChange={(v) => setSettleAmount(v)}
                min={0.01}
                precision={2}
                style={{ width: 160 }}
                addonBefore="¥"
              />
            </Space>
          </Space>
        )}
      </Modal>

      {/* 驳回（单笔/批量共用） */}
      <RejectReasonModal
        open={rejectTargets.length > 0}
        title={rejectTargets.length > 1 ? `批量驳回 ${rejectTargets.length} 笔账单` : '驳回账单'}
        description={
          rejectTargets.length === 1
            ? `确定驳回 ${rejectTargets[0]?.billNo || ''}（${fmtMoney(rejectTargets[0]?.amount)}）？驳回后上游模块可重新推送。`
            : '确定驳回勾选的账单？驳回后上游模块可重新推送。'
        }
        onOk={handleRejectOk}
        onCancel={() => setRejectTargets([])}
        loading={rejectSubmitting}
      />
    </Drawer>
  );
}
