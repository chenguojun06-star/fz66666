import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  billAggregationApi,
  BILL_CATEGORY_MAP,
  BILL_STATUS_MAP,
  type BillAggregation,
} from '@/services/finance/billAggregationApi';
import { toMoneyLocale } from '@/utils/format';
import { safePrint } from '@/utils/safePrint';
import { exportToExcel } from '@/utils/excelExport';
import { useUser } from '@/utils/AuthContext';
import { buildCounterpartyStatementHtml } from '../utils/buildCounterpartyStatementHtml';
import { wagePaymentApi, type WagePayment } from '@/services/finance/wagePaymentApi';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import BillDetailDrawer from './BillDetailDrawer';
import {
  COUNTERPARTY_TYPE_MAP,
  PAY_STATUS_TEXT,
  SOURCE_TYPE_TEXT,
  isRealCounterpartyId,
} from './counterpartyConstants';

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
  const { user } = useUser();

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

  // D-473 兜底：该对象没有账单流水时（老数据只有付款记录），回退展示历史付款记录
  const [fbPayments, setFbPayments] = useState<WagePayment[]>([]);
  const [fbLoading, setFbLoading] = useState(false);

  // D-473：单条账单详情（一条流水点开看全部记录）
  const [detailBill, setDetailBill] = useState<BillAggregation | null>(null);

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
      // D-474：ID 是占位符（UNKNOWN_SUPPLIER 等）时改用名称过滤，
        // 否则会把同占位符的不同供应商的账单混在一起显示
        const useId = isRealCounterpartyId(target.counterpartyId);
        const res: any = await billAggregationApi.listBills({
          pageNum: page,
          pageSize,
          counterpartyId: useId ? target.counterpartyId : undefined,
          counterpartyName: useId ? undefined : target.counterpartyName,
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

  // D-473：账单为空时补拉该对象的历史付款记录，避免点开一片空白
  useEffect(() => {
    if (!open || !target) {
      setFbPayments([]);
      return;
    }
    if (loading || total !== 0 || !target.counterpartyId) {
      return;
    }
    let alive = true;
    setFbLoading(true);
    (async () => {
      try {
        const res: any = await wagePaymentApi.listPayableByCounterparty({
          counterpartyId: target.counterpartyId,
        });
        const d = res?.data ?? res ?? {};
        if (alive) setFbPayments(d.payments ?? []);
      } catch {
        if (alive) setFbPayments([]);
      } finally {
        if (alive) setFbLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, target, loading, total]);

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
      // D-474：同样列出明细，付款前看清每一笔
      content: (
        <div>
          <div>
            将把 {rows.length} 笔账单按未结金额合计{' '}
            <Text strong style={{ color: 'var(--color-error)' }}>{fmtMoney(sum)}</Text> 一次性结清。
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
            {rows.slice(0, 10).map((b) => (
              <li key={b.id}>
                {b.billNo || '-'} · {SOURCE_TYPE_TEXT[b.sourceType] ?? b.sourceType ?? '-'} · 剩余{' '}
                {fmtMoney(Number(b.amount ?? 0) - Number(b.settledAmount ?? 0))}
              </li>
            ))}
          </ul>
          {rows.length > 10 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>…等共 {rows.length} 笔</div>
          )}
          <div style={{ marginTop: 8 }}>确认付款？</div>
        </div>
      ),
      okText: '确认付款',
      onOk: async () => {
        await billAggregationApi.batchSettle(rows.map((b) => b.id));
        message.success(`已批量结清 ${rows.length} 笔`);
        afterChange();
      },
    });
  };

  /** 整月合并付款：当前月份筛选下该对象全部已确认未结清一键结清 */
  /** D-474：打印/导出要拿该对象当前筛选下的全部账单，不能只用当前页 */
  const fetchAllBillsForStatement = useCallback(async () => {
    const useId = isRealCounterpartyId(target?.counterpartyId);
    const res: any = await billAggregationApi.listBills({
      pageNum: 1,
      pageSize: 500,
      counterpartyId: useId ? target?.counterpartyId : undefined,
      counterpartyName: useId ? undefined : target?.counterpartyName,
      settlementMonth: month ? month.format('YYYY-MM') : undefined,
    });
    return ((res?.data ?? res)?.records ?? []) as BillAggregation[];
  }, [target, month]);

  /** D-474：打印对账单（一个对象一张，可打印后发给对方确认） */
  const handlePrint = useCallback(async () => {
    if (!target) return;
    setActionSubmitting(true);
    try {
      const rows = await fetchAllBillsForStatement();
      const totalAmount = rows.reduce((s, b) => s + Number(b.amount ?? 0), 0);
      const settledAmount = rows.reduce((s, b) => s + Number(b.settledAmount ?? 0), 0);
      const html = buildCounterpartyStatementHtml({
        counterpartyName: target.counterpartyName,
        counterpartyTypeText: COUNTERPARTY_TYPE_MAP[(target.counterpartyType || '').toUpperCase()]?.text,
        monthLabel: month ? month.format('YYYY-MM') : undefined,
        rows,
        totalAmount,
        settledAmount,
        unpaidAmount: totalAmount - settledAmount,
        printedBy: user?.name || user?.username,
      });
      safePrint(html, `往来对账单-${target.counterpartyName || ''}`);
    } catch (e: unknown) {
      modal.error({ title: '打印失败', content: e instanceof Error ? e.message : String(e) });
    } finally {
      setActionSubmitting(false);
    }
  }, [target, month, fetchAllBillsForStatement, modal, user]);

  /** D-474：导出 Excel（发给对方核对用） */
  const handleExport = useCallback(async () => {
    if (!target) return;
    setActionSubmitting(true);
    try {
      const rows = await fetchAllBillsForStatement();
      if (rows.length === 0) {
        message.warning('该对象当前期间没有可导出的账单');
        return;
      }
      const data = rows.map((b) => ({
        billNo: b.billNo || '-',
        sourceType: SOURCE_TYPE_TEXT[b.sourceType ?? ''] ?? b.sourceType ?? '-',
        sourceNo: b.sourceNo || b.orderNo || '-',
        settlementMonth: b.settlementMonth || '-',
        amount: Number(b.amount ?? 0),
        settledAmount: Number(b.settledAmount ?? 0),
        unpaid: Number(b.amount ?? 0) - Number(b.settledAmount ?? 0),
        status: BILL_STATUS_MAP[b.status ?? '']?.text ?? b.status ?? '-',
        createTime: b.createTime ? dayjs(b.createTime).format('YYYY-MM-DD HH:mm') : '-',
      }));
      await exportToExcel(
        data as unknown as Record<string, unknown>[],
        [
          { header: '账单编号', key: 'billNo', width: 26 },
          { header: '来源模块', key: 'sourceType', width: 14 },
          { header: '来源单号', key: 'sourceNo', width: 22 },
          { header: '结算月', key: 'settlementMonth', width: 10 },
          { header: '金额', key: 'amount', width: 12 },
          { header: '已付', key: 'settledAmount', width: 12 },
          { header: '未付', key: 'unpaid', width: 12 },
          { header: '状态', key: 'status', width: 10 },
          { header: '推送时间', key: 'createTime', width: 18 },
        ],
        `对账单_${target.counterpartyName || '往来对象'}_${month ? month.format('YYYY-MM') : '全部'}.xlsx`,
      );
      message.success(`已导出 ${rows.length} 条账单`);
    } catch (e: unknown) {
      modal.error({ title: '导出失败', content: e instanceof Error ? e.message : String(e) });
    } finally {
      setActionSubmitting(false);
    }
  }, [target, month, fetchAllBillsForStatement, modal, message]);

  const handleMergeSettle = async () => {
    if (!target) return;
    setActionSubmitting(true);
    try {
      // D-474：同上，占位符 ID 改用名称匹配
      const mergeUseId = isRealCounterpartyId(target.counterpartyId);
      const res: any = await billAggregationApi.listBills({
        pageNum: 1,
        pageSize: 500,
        counterpartyId: mergeUseId ? target.counterpartyId : undefined,
        counterpartyName: mergeUseId ? undefined : target.counterpartyName,
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
        // D-474：列出将被结清的每一笔，避免把"打算留尾款"的账单一并付掉
        content: (
          <div>
            <div>
              将把该对象{month ? ` ${month.format('YYYY-MM')}` : '（全部月份）'}共 {rows.length} 笔未结账单一次性结清，
              合计 <Text strong style={{ color: 'var(--color-error)' }}>{fmtMoney(sum)}</Text>。
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>包含以下账单：</div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
              {rows.slice(0, 10).map((b) => (
                <li key={b.id}>
                  {b.billNo || '-'} · {SOURCE_TYPE_TEXT[b.sourceType] ?? b.sourceType ?? '-'} · 剩余{' '}
                  {fmtMoney(Number(b.amount ?? 0) - Number(b.settledAmount ?? 0))}
                </li>
              ))}
            </ul>
            {rows.length > 10 && (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>…等共 {rows.length} 笔</div>
            )}
            <div style={{ marginTop: 8 }}>确认付款？</div>
          </div>
        ),
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
      title: '来源模块',
      dataIndex: 'sourceType',
      width: 120,
      render: (v: string) => SOURCE_TYPE_TEXT[v] ?? v ?? '-',
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
      render: (v: number) => (
        <Text strong style={Number(v ?? 0) < 0 ? { color: 'var(--color-error)' } : undefined}>
          {fmtMoney(v)}
        </Text>
      ),
    },
    {
      title: '已结清',
      dataIndex: 'settledAmount',
      width: 120,
      align: 'right',
      render: (v: number) => fmtMoney(v),
    },
    {
      title: '还剩余',
      key: 'unsettled',
      width: 120,
      align: 'right',
      render: (_: unknown, r: BillAggregation) => {
        const rest = Number(r.amount ?? 0) - Number(r.settledAmount ?? 0);
        if (Number(r.amount ?? 0) < 0) {
          return <Text type="secondary">扣款项</Text>;
        }
        return rest > 0
          ? <Text strong style={{ color: 'var(--color-error)' }}>{fmtMoney(rest)}</Text>
          : <Text type="secondary">已付清</Text>;
      },
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
      width: 200,
      render: (_: unknown, r) => (
        <Space size={4}>
          {/* D-473：一条流水点开看全部记录 */}
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => setDetailBill(r)}
          >
            详情
          </Button>
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
          {/* 扣款项（负数）与已付清的不提供付款入口 */}
          {SETTLEABLE.includes(r.status) && Number(r.amount ?? 0) - Number(r.settledAmount ?? 0) > 0 && (
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              onClick={() => {
                setSettleTarget(r);
                // D-473：默认带出剩余未付（支持部分付款，付不满挂账下月继续扣）
                setSettleAmount(Math.max(0, Number(r.amount ?? 0) - Number(r.settledAmount ?? 0)));
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

  /** D-473 兜底表格：无账单时展示的历史付款记录 */
  const fallbackColumns: ColumnsType<WagePayment> = [
    { title: '付款单号', dataIndex: 'paymentNo', width: 170, render: (v: string) => v || '-' },
    { title: '业务类型', dataIndex: 'bizType', width: 120, render: (v: string) => v || '-' },
    { title: '金额', dataIndex: 'amount', width: 120, align: 'right', render: (v: number) => fmtMoney(v) },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => <Tag>{PAY_STATUS_TEXT[v] ?? v ?? '-'}</Tag>,
    },
    { title: '付款时间', dataIndex: 'paymentTime', width: 160, render: (v: string) => fmtTime(v) },
    { title: '操作人', dataIndex: 'operatorName', width: 120, render: (v: string) => v || '-' },
  ];

  const typeTag = target
    ? COUNTERPARTY_TYPE_MAP[(target.counterpartyType || '').toUpperCase()] ?? null
    : null;

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
        {/* D-474：汇总为 0 时给原因提示，避免财务以为"坏了"——常见于付款记录存在
            但上游单据尚未推送账单、或手工录入的付款记录等场景 */}
        {(target?.billCount ?? 0) === 0 && (
          <Alert
            type="info"
            showIcon
            style={{ flex: 1, minWidth: 320 }}
            message="该对象在账单汇总里没有往来记录"
            description="可能原因：该对象只在付款记录里有手工录入或导入的流水，但上游单据（面料对账/工资结算/外发加工等）还没推送账单；下方如显示「历史付款记录」，说明确实有钱付出去但账单侧缺失。"
          />
        )}
        {/* D-474：账单侧没数据时，把付款记录里的"应付/待付"直接摆到汇总区，
            财务不用翻到底部的兜底表格也能一眼看到这个对象现在欠多少 */}
        {fbPayments.length > 0 && (
          <>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>付款记录合计</Text>
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  {fmtMoney(fbPayments.reduce((s, p) => s + Number(p.amount ?? 0), 0))}
                </Title>
              </div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>当前待付</Text>
              <div>
                <Title level={4} style={{ margin: 0, color: 'var(--color-error)' }}>
                  {fmtMoney(
                    fbPayments
                      .filter((p) => p.status !== 'success' && p.status !== 'cancelled')
                      .reduce((s, p) => s + Number(p.amount ?? 0), 0),
                  )}
                </Title>
              </div>
            </div>
          </>
        )}
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

      {/* D-474：一个对象一张对账单——打印后可直接给对方，或导出 Excel 发过去核对 */}
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<PrinterOutlined />} loading={actionSubmitting} onClick={handlePrint}>
          打印对账单
        </Button>
        <Button icon={<DownloadOutlined />} loading={actionSubmitting} onClick={handleExport}>
          导出 Excel
        </Button>
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

      {/* D-473 兜底：该对象没有账单流水时，回退展示历史付款记录，避免点开一片空白 */}
      {!loading && total === 0 && (
        <div style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Text type="secondary">
              该对象暂无上游推送的账单流水
              {fbPayments.length > 0 ? '，以下为其历史付款记录：' : '，也没有历史付款记录。'}
            </Text>
            {fbPayments.length > 0 && (
              <Table<WagePayment>
                rowKey="id"
                size="small"
                loading={fbLoading}
                pagination={false}
                scroll={{ x: 900 }}
                columns={fallbackColumns}
                dataSource={fbPayments}
              />
            )}
          </Space>
        </div>
      )}

      {/* 单笔付款弹窗 */}
      <Modal
        title="付款（可只付一部分）"
        open={!!settleTarget}
        onOk={() => void handleSettleOne()}
        confirmLoading={settleSubmitting}
        onCancel={() => setSettleTarget(null)}
        destroyOnHidden
      >
        {settleTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Text type="secondary">
              {settleTarget.billNo || '-'} · {SOURCE_TYPE_TEXT[settleTarget.sourceType] ?? settleTarget.sourceType ?? '-'}
              {' · '}{BILL_CATEGORY_MAP[settleTarget.billCategory || '']?.text || '-'}
            </Text>
            <Space size={24} wrap>
              <Text type="secondary">
                账单金额 <Text strong>{fmtMoney(settleTarget.amount)}</Text>
              </Text>
              <Text type="secondary">
                已付 <Text style={{ color: 'var(--color-success)' }}>{fmtMoney(settleTarget.settledAmount)}</Text>
              </Text>
              <Text type="secondary">
                剩余未付{' '}
                <Text strong style={{ color: 'var(--color-error)' }}>
                  {fmtMoney(Math.max(0, Number(settleTarget.amount ?? 0) - Number(settleTarget.settledAmount ?? 0)))}
                </Text>
              </Text>
            </Space>
            <Space>
              <Text>本次付款金额</Text>
              <InputNumber
                value={settleAmount}
                onChange={(v) => setSettleAmount(v)}
                min={0.01}
                max={Math.max(0.01, Number(settleTarget.amount ?? 0) - Number(settleTarget.settledAmount ?? 0))}
                precision={2}
                style={{ width: 160 }}
                addonBefore="¥"
              />
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              可以只付一部分：付不满不会关闭这笔账，剩余金额继续挂在该对象名下，状态转为「结算中」，下个月可继续扣。
            </Text>
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

      {/* D-473：账单详情（一条流水点开看全部记录） */}
      <BillDetailDrawer
        open={!!detailBill}
        bill={detailBill}
        onClose={() => setDetailBill(null)}
      />
    </Drawer>
  );
}
