import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Checkbox,
  DatePicker,
  Input,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { safePrint } from '@/utils/safePrint';
import {
  buildCounterpartyStatementHtml,
  buildMultiCounterpartyStatementHtml,
} from '../utils/buildCounterpartyStatementHtml';
import { isRealCounterpartyId } from './counterpartyConstants';
import { useUser } from '@/utils/AuthContext';
import {
  billAggregationApi,
  type CounterpartyGroup,
} from '@/services/finance/billAggregationApi';
import { toMoneyLocale } from '@/utils/format';
import CounterpartyBillDrawer from './CounterpartyBillDrawer';

const { Text } = Typography;

// D-474：常量抽到 counterpartyConstants，避免与详情抽屉互相 import 形成循环依赖
import { COUNTERPARTY_TYPE_MAP } from './counterpartyConstants';

export { COUNTERPARTY_TYPE_MAP };

const fmtMoney = (v?: number) => `¥${toMoneyLocale(v)}`;

/**
 * D-472 往来总账 — 付款中心"银行账户"视图
 * 主列表一行 = 一个往来对象（员工/外发厂/供应商布行，应收侧为客户）；
 * 上游任何模块推送的账单都按对象累计叠加，点击对象进详情看全部推送流水。
 */
export default function CounterpartyLedgerTab() {
  const { message } = App.useApp();
  const { user } = useUser();

  const [billType, setBillType] = useState<'PAYABLE' | 'RECEIVABLE'>('PAYABLE');
  const [month, setMonth] = useState<dayjs.Dayjs | null>(null);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<CounterpartyGroup[]>([]);
  // D-474：只看还没付完的（含部分付款后挂账的），财务不用在已两清的对象里翻找
  const [onlyUnsettled, setOnlyUnsettled] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTarget, setDrawerTarget] = useState<CounterpartyGroup | null>(null);
  // D-474：勾选多个对象 → 批量出对账单（月底一次性给所有工厂/员工打单）
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [batchPrinting, setBatchPrinting] = useState(false);

  /** 行唯一键：类型 +（ID 或名称），表格 rowKey 与勾选/批量打印共用 */
  const rowKeyOf = useCallback(
    (r: CounterpartyGroup) => `${r.counterpartyType}|${r.counterpartyId || r.counterpartyName}`,
    [],
  );

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await billAggregationApi.listCounterpartyGroups({
        billType,
        // D-474：只看未结清时不限月份——上月挂账的余额属于上月账单，
        // 若按本月筛选就看不到它，跨月补扣会被挡住
        settlementMonth: onlyUnsettled ? undefined : month ? month.format('YYYY-MM') : undefined,
        keyword: keyword.trim() || undefined,
      });
      setGroups(res?.data ?? res ?? []);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载往来总账失败');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [billType, month, keyword, onlyUnsettled, message]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  // 当前筛选下的展示行（只看未结清 时过滤掉已两清与扣款项净额为 0 的对象）
  const shownGroups = useMemo(
    () => (onlyUnsettled ? groups.filter((g) => Number(g.unsettledAmount ?? 0) > 0.005) : groups),
    [groups, onlyUnsettled],
  );

  // 当前筛选下的汇总（前端对展示行求和）
  const summary = useMemo(() => {
    return shownGroups.reduce(
      (acc, g) => ({
        total: acc.total + Number(g.totalAmount ?? 0),
        settled: acc.settled + Number(g.settledAmount ?? 0),
        unsettled: acc.unsettled + Number(g.unsettledAmount ?? 0),
      }),
        { total: 0, settled: 0, unsettled: 0 },
    );
  }, [shownGroups]);

  const openDrawer = (g: CounterpartyGroup) => {
    if (!g.counterpartyId && !g.counterpartyName) {
      message.error('该记录缺少往来对象信息');
      return;
    }
    setDrawerTarget(g);
    setDrawerOpen(true);
  };

  /** D-474：总账行直接打印该对象的对账单（拉该对象当前筛选下全部账单） */
  const handlePrintRow = useCallback(
    async (g: CounterpartyGroup) => {
      if (!g.counterpartyId && !g.counterpartyName) {
        message.error('该记录缺少往来对象信息');
        return;
      }
      try {
        const useId = isRealCounterpartyId(g.counterpartyId);
        const res: any = await billAggregationApi.listBills({
          pageNum: 1,
          pageSize: 500,
          counterpartyId: useId ? g.counterpartyId : undefined,
          counterpartyName: useId ? undefined : g.counterpartyName,
          settlementMonth: month && !onlyUnsettled ? month.format('YYYY-MM') : undefined,
          billType,
        });
        const rows: any[] = (res?.data ?? res)?.records ?? [];
        const totalAmount = rows.reduce((s, b) => s + Number(b.amount ?? 0), 0);
        const settledAmount = rows.reduce((s, b) => s + Number(b.settledAmount ?? 0), 0);
        safePrint(
          buildCounterpartyStatementHtml({
            counterpartyName: g.counterpartyName,
            counterpartyTypeText: COUNTERPARTY_TYPE_MAP[(g.counterpartyType || '').toUpperCase()]?.text,
            monthLabel: month && !onlyUnsettled ? month.format('YYYY-MM') : undefined,
            rows,
            totalAmount,
            settledAmount,
            unpaidAmount: totalAmount - settledAmount,
            printedBy: user?.name || user?.username,
          }),
          `往来对账单-${g.counterpartyName || ''}`,
        );
      } catch (e: unknown) {
        message.error(`打印失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [month, onlyUnsettled, billType, message, user],
  );

  /** D-474：批量打印——选中的每个对象各出一页对账单，一次打印完按对象分开 */
  const handleBatchPrint = useCallback(async () => {
    const picked = groups.filter((g) => selectedKeys.includes(rowKeyOf(g)));
    if (picked.length === 0) {
      message.warning('请先勾选要打印的对象');
      return;
    }
    setBatchPrinting(true);
    try {
      const monthLabel = month && !onlyUnsettled ? month.format('YYYY-MM') : undefined;
      const list = await Promise.all(
        picked.map(async (g) => {
          const useId = isRealCounterpartyId(g.counterpartyId);
          const res: any = await billAggregationApi.listBills({
            pageNum: 1,
            pageSize: 500,
            counterpartyId: useId ? g.counterpartyId : undefined,
            counterpartyName: useId ? undefined : g.counterpartyName,
            settlementMonth: monthLabel,
            billType,
          });
          const rows: any[] = (res?.data ?? res)?.records ?? [];
          const totalAmount = rows.reduce((s, b) => s + Number(b.amount ?? 0), 0);
          const settledAmount = rows.reduce((s, b) => s + Number(b.settledAmount ?? 0), 0);
          return {
            counterpartyName: g.counterpartyName,
            counterpartyTypeText: COUNTERPARTY_TYPE_MAP[(g.counterpartyType || '').toUpperCase()]?.text,
            monthLabel,
            rows,
            totalAmount,
            settledAmount,
            unpaidAmount: totalAmount - settledAmount,
            printedBy: user?.name || user?.username,
          };
        }),
      );
      safePrint(
        buildMultiCounterpartyStatementHtml(list, `往来对账单（${list.length} 个对象）`),
        `往来对账单-${list.length}个对象`,
      );
      message.success(`已生成 ${list.length} 个对象的对账单`);
    } catch (e: unknown) {
      message.error(`批量打印失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBatchPrinting(false);
    }
  }, [groups, selectedKeys, month, onlyUnsettled, billType, message, user, rowKeyOf]);

  const columns: ColumnsType<CounterpartyGroup> = [
    {
      title: '往来对象',
      dataIndex: 'counterpartyName',
      width: 220,
      render: (v: string, r) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openDrawer(r)}>
          {v || '-'}
        </Button>
      ),
    },
    {
      title: '类型',
      dataIndex: 'counterpartyType',
      width: 90,
      render: (v: string) => {
        const t = COUNTERPARTY_TYPE_MAP[(v || '').toUpperCase()] ?? { text: v || '-', color: 'default' };
        return <Tag color={t.color}>{t.text}</Tag>;
      },
    },
    {
      title: '笔数',
      dataIndex: 'billCount',
      width: 80,
      align: 'right',
      render: (v: number) => <Text type="secondary">{v ?? 0} 笔</Text>,
    },
    {
      title: '挂账 / 待确认',
      key: 'progress',
      width: 150,
      render: (_: unknown, r) => {
        const settling = Number(r.settlingCount ?? 0);
        const pending = Number(r.pendingCount ?? 0);
        if (settling === 0 && pending === 0) {
          return <Text type="secondary">-</Text>;
        }
        return (
          <Space size={4}>
            {settling > 0 && <Tag color="orange">{settling} 笔挂账</Tag>}
            {pending > 0 && <Tag>{pending} 笔待确认</Tag>}
          </Space>
        );
      },
    },
    {
      title: billType === 'PAYABLE' ? '累计应付' : '累计应收',
      dataIndex: 'totalAmount',
      width: 140,
      align: 'right',
      render: (v: number) => <Text strong>{fmtMoney(v)}</Text>,
    },
    {
      title: '已结清',
      dataIndex: 'settledAmount',
      width: 140,
      align: 'right',
      render: (v: number) => (
        <Text style={{ color: 'var(--color-success)' }}>{fmtMoney(v)}</Text>
      ),
    },
    {
      title: billType === 'PAYABLE' ? '未付' : '未收',
      dataIndex: 'unsettledAmount',
      width: 140,
      align: 'right',
      render: (v: number, r) =>
        Number(r.settledAmount ?? 0) >= Number(r.totalAmount ?? 0) ? (
          <Text type="secondary">已清</Text>
        ) : (
          <Text strong style={{ color: 'var(--color-error)' }}>{fmtMoney(v)}</Text>
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, r) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              openDrawer(r);
            }}
          >
            查看明细
          </Button>
          {/* D-474：一行一个对象，直接打印该对象的对账单发给对方。
              注意阻止冒泡——整行 onClick 是"打开详情抽屉"，不拦会连抽屉一起弹出 */}
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            icon={<PrinterOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              void handlePrintRow(r);
            }}
          >
            打印
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      {/* 筛选工具条 */}
      <Space style={{ marginBottom: 12 }} wrap>
        <Segmented
          value={billType}
          onChange={(v) => setBillType(v as 'PAYABLE' | 'RECEIVABLE')}
          options={[
            { label: '应付（员工 / 加工厂 / 布行）', value: 'PAYABLE' },
            { label: '应收（客户）', value: 'RECEIVABLE' },
          ]}
        />
        <DatePicker
          picker="month"
          value={month}
          onChange={(v) => setMonth(v)}
          allowClear
          disabled={onlyUnsettled}
          placeholder={onlyUnsettled ? '未结清不限月份' : '按月筛选'}
        />
        <Input.Search
          allowClear
          placeholder="搜索对象名称"
          style={{ width: 200 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={() => void fetchGroups()}
        />
        <Checkbox
          checked={onlyUnsettled}
          onChange={(e) => setOnlyUnsettled(e.target.checked)}
        >
          只看未结清（不限月份）
        </Checkbox>
        <Button icon={<ReloadOutlined />} onClick={() => void fetchGroups()}>
          刷新
        </Button>
        {/* D-474：勾选对象后批量出对账单（月底一次性给所有工厂/员工打单） */}
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          loading={batchPrinting}
          disabled={selectedKeys.length === 0}
          onClick={handleBatchPrint}
        >
          批量打印{selectedKeys.length > 0 ? `(${selectedKeys.length})` : ''}
        </Button>
      </Space>

      {/* 汇总条 */}
      <Space size={40} style={{ marginBottom: 12 }} wrap>
        <Text type="secondary">
          共 <Text strong>{shownGroups.length}</Text> 个对象
          {onlyUnsettled ? `（全部 ${groups.length} 个）` : ''}
        </Text>
        <Text type="secondary">
          累计{billType === 'PAYABLE' ? '应付' : '应收'}：<Text strong>{fmtMoney(summary.total)}</Text>
        </Text>
        <Text type="secondary">
          已结清：<Text strong style={{ color: 'var(--color-success)' }}>{fmtMoney(summary.settled)}</Text>
        </Text>
        <Text type="secondary">
          未{billType === 'PAYABLE' ? '付' : '收'}：
          <Text strong style={{ color: 'var(--color-error)' }}>{fmtMoney(summary.unsettled)}</Text>
        </Text>
      </Space>

      <Spin spinning={loading}>
        <Table<CounterpartyGroup>
          rowKey={rowKeyOf}
          size="small"
          columns={columns}
          dataSource={shownGroups}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys,
          }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 个对象` }}
          onRow={(r) => ({
            onClick: () => openDrawer(r),
            style: { cursor: 'pointer' },
          })}
        />
      </Spin>

      <CounterpartyBillDrawer
        open={drawerOpen}
        target={drawerTarget}
        initialMonth={month}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerTarget(null);
        }}
        onChanged={() => void fetchGroups()}
      />
    </>
  );
}
