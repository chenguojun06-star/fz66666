import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
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
import { ReloadOutlined } from '@ant-design/icons';
import {
  billAggregationApi,
  type CounterpartyGroup,
} from '@/services/finance/billAggregationApi';
import { toMoneyLocale } from '@/utils/format';
import CounterpartyBillDrawer from './CounterpartyBillDrawer';

const { Text } = Typography;

/** D-472 往来对象类型标签（员工/工厂/供应商/客户） */
export const COUNTERPARTY_TYPE_MAP: Record<string, { text: string; color: string }> = {
  WORKER: { text: '员工', color: 'blue' },
  FACTORY: { text: '工厂', color: 'purple' },
  SUPPLIER: { text: '供应商', color: 'cyan' },
  CUSTOMER: { text: '客户', color: 'orange' },
};

const fmtMoney = (v?: number) => `¥${toMoneyLocale(v)}`;

/**
 * D-472 往来总账 — 付款中心"银行账户"视图
 * 主列表一行 = 一个往来对象（员工/外发厂/供应商布行，应收侧为客户）；
 * 上游任何模块推送的账单都按对象累计叠加，点击对象进详情看全部推送流水。
 */
export default function CounterpartyLedgerTab() {
  const { message } = App.useApp();

  const [billType, setBillType] = useState<'PAYABLE' | 'RECEIVABLE'>('PAYABLE');
  const [month, setMonth] = useState<dayjs.Dayjs | null>(null);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<CounterpartyGroup[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTarget, setDrawerTarget] = useState<CounterpartyGroup | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await billAggregationApi.listCounterpartyGroups({
        billType,
        settlementMonth: month ? month.format('YYYY-MM') : undefined,
        keyword: keyword.trim() || undefined,
      });
      setGroups(res?.data ?? res ?? []);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载往来总账失败');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [billType, month, keyword, message]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  // 当前筛选下的汇总（前端对聚合行求和）
  const summary = useMemo(() => {
    return groups.reduce(
      (acc, g) => ({
        total: acc.total + Number(g.totalAmount ?? 0),
        settled: acc.settled + Number(g.settledAmount ?? 0),
        unsettled: acc.unsettled + Number(g.unsettledAmount ?? 0),
      }),
      { total: 0, settled: 0, unsettled: 0 },
    );
  }, [groups]);

  const openDrawer = (g: CounterpartyGroup) => {
    if (!g.counterpartyId && !g.counterpartyName) {
      message.error('该记录缺少往来对象信息');
      return;
    }
    setDrawerTarget(g);
    setDrawerOpen(true);
  };

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
        const t = COUNTERPARTY_TYPE_MAP[v] ?? { text: v || '-', color: 'default' };
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
      width: 100,
      render: (_: unknown, r) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openDrawer(r)}>
          查看明细
        </Button>
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
          placeholder="按月筛选"
        />
        <Input.Search
          allowClear
          placeholder="搜索对象名称"
          style={{ width: 200 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={() => void fetchGroups()}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void fetchGroups()}>
          刷新
        </Button>
      </Space>

      {/* 汇总条 */}
      <Space size={40} style={{ marginBottom: 12 }} wrap>
        <Text type="secondary">
          共 <Text strong>{groups.length}</Text> 个对象
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
          rowKey={(r) => `${r.counterpartyType}|${r.counterpartyId || r.counterpartyName}`}
          size="small"
          columns={columns}
          dataSource={groups}
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
