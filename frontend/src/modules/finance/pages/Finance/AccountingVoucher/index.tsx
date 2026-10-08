import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { RangePickerProps } from 'antd/es/date-picker';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { unwrapApiData } from '@/utils/api';
import {
  accountingVoucherApi,
  AccountingEntry,
  AccountingVoucher,
  AccountSubject,
  ACCOUNTING_STANDARD_MAP,
  BALANCE_DIRECTION_MAP,
  SUBJECT_TYPE_MAP,
  VOUCHER_TYPE_MAP,
  VoucherDetail,
} from '@/services/finance/accountingVoucherApi';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const fmtMoney = (v?: number | null) =>
  `¥${Number(v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtTime = (v?: string) => (v ? String(v).replace('T', ' ').substring(0, 19) : '-');

/**
 * D-513 会计凭证 — 把后端已实现但一直没对外开放的会计模块补上前端入口。
 *
 * 数据来源（后端 AccountingVoucherController，只读为主）：
 *   GET  /api/finance/accounting/voucher/list?startDate&endDate
 *   GET  /api/finance/accounting/voucher/detail/{id}
 *   POST /api/finance/accounting/voucher/reverse/{id}
 *   GET  /api/finance/accounting/subjects
 *
 * 凭证怎么来的（业务侧无需手工建）：
 *   · 账单确认（CONFIRMED）→ 记账凭证 JOURNAL：借 成本/费用、贷 应付账款（应收则借 应收账款、贷 收入）
 *   · 付款完成 → 收付款凭证 PAYMENT：借 应付账款、贷 银行存款
 *   · 收款完成 → 收付款凭证 PAYMENT：借 银行存款、贷 应收账款
 *   · 账单冲销 → 对应凭证自动冲销（红字）
 */
const AccountingVoucherPage: React.FC = () => {
  const { message, modal } = App.useApp();

  const [activeTab, setActiveTab] = useState('vouchers');
  const [loading, setLoading] = useState(false);
  const [vouchers, setVouchers] = useState<AccountingVoucher[]>([]);
  const [subjects, setSubjects] = useState<AccountSubject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  // 筛选
  const [dateRange, setDateRange] = useState<RangePickerProps['value']>(null);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState('');

  // 详情抽屉
  const [detailOpen, setDetailOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailVoucher, setDetailVoucher] = useState<AccountingVoucher | null>(null);
  const [detailEntries, setDetailEntries] = useState<AccountingEntry[]>([]);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await accountingVoucherApi.listVouchers(
        dateRange?.[0]?.format('YYYY-MM-DD'),
        dateRange?.[1]?.format('YYYY-MM-DD'),
      );
      setVouchers(unwrapApiData<AccountingVoucher[]>(res, '加载凭证失败'));
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载凭证失败');
    } finally {
      setLoading(false);
    }
  }, [dateRange, message]);

  const fetchSubjects = useCallback(async () => {
    setSubjectsLoading(true);
    try {
      const res = await accountingVoucherApi.listSubjects();
      setSubjects(unwrapApiData<AccountSubject[]>(res, '加载会计科目失败'));
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载会计科目失败');
    } finally {
      setSubjectsLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchVouchers();
  }, [fetchVouchers]);

  useEffect(() => {
    if (activeTab === 'subjects' && subjects.length === 0) {
      void fetchSubjects();
    }
  }, [activeTab, subjects.length, fetchSubjects]);

  /** 前端二次筛选（后端只按日期过滤，最多 500 条） */
  const filteredVouchers = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (typeFilter && v.voucherType !== typeFilter) return false;
      if (!kw) return true;
      return [v.voucherNo, v.summary, v.createBy]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(kw));
    });
  }, [vouchers, typeFilter, keyword]);

  /** 借贷合计（用于顶部对账提示） */
  const totals = useMemo(() => {
    const amount = filteredVouchers.reduce((s, v) => s + Number(v.totalAmount ?? 0), 0);
    return { count: filteredVouchers.length, amount };
  }, [filteredVouchers]);

  const openDetail = useCallback(
    async (voucher: AccountingVoucher) => {
      setDetailOpen(true);
      setDetailLoading(true);
      setDetailVoucher(voucher);
      setDetailEntries([]);
      try {
        const res = await accountingVoucherApi.getVoucherDetail(voucher.id);
        const data = unwrapApiData<VoucherDetail>(res, '加载凭证详情失败');
        setDetailVoucher(data?.voucher ?? voucher);
        setDetailEntries(data?.entries ?? []);
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : '加载凭证详情失败');
      } finally {
        setDetailLoading(false);
      }
    },
    [message],
  );

  const handleReverse = useCallback(
    (voucher: AccountingVoucher) => {
      modal.confirm({
        title: '冲销凭证',
        content: `确定冲销凭证 ${voucher.voucherNo}（${fmtMoney(voucher.totalAmount)}）吗？冲销会生成一张红字凭证，借贷互换，原凭证保留可追溯。`,
        okText: '确认冲销',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await accountingVoucherApi.reverseVoucher(voucher.id);
            message.success('已生成冲销凭证');
            void fetchVouchers();
            if (detailVoucher?.id === voucher.id) setDetailOpen(false);
          } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : '冲销失败');
          }
        },
      });
    },
    [modal, message, fetchVouchers, detailVoucher],
  );

  /**
   * D-513：补生成缺失的记账凭证。
   * 会计科目映射补齐之前已确认的历史账单不会自动生成凭证，这里一次性补上；
   * 后端幂等（已存在凭证的账单跳过），可重复点击。
   */
  const handleBackfill = useCallback(() => {
    modal.confirm({
      title: '补生成缺失凭证',
      content:
        '将为「已确认但还没有记账凭证」的账单补生成凭证（历史补账）。'
        + '已生成过的会自动跳过，可重复执行。确定继续？',
      okText: '开始补生成',
      onOk: async () => {
        setBackfilling(true);
        try {
          const res = await accountingVoucherApi.backfillVouchers();
          const created = unwrapApiData<number>(res, '补生成凭证失败');
          message.success(`已补生成 ${created ?? 0} 张凭证`);
          void fetchVouchers();
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '补生成凭证失败');
        } finally {
          setBackfilling(false);
        }
      },
    });
  }, [modal, message, fetchVouchers]);

  const voucherColumns: ColumnsType<AccountingVoucher> = [
    {
      title: '凭证号',
      dataIndex: 'voucherNo',
      width: 180,
      render: (v: string) => <Text style={{ fontFamily: 'monospace' }}>{v || '-'}</Text>,
    },
    {
      title: '凭证日期',
      dataIndex: 'voucherDate',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '类型',
      dataIndex: 'voucherType',
      width: 110,
      render: (v: string) => {
        const cfg = VOUCHER_TYPE_MAP[v];
        return cfg ? <Tag color={cfg.color}>{cfg.text}</Tag> : <Tag>{v || '-'}</Tag>;
      },
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '金额',
      dataIndex: 'totalAmount',
      width: 130,
      align: 'right',
      render: (v: number) => <Text strong>{fmtMoney(v)}</Text>,
    },
    {
      title: '制单人',
      dataIndex: 'createBy',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '生成时间',
      dataIndex: 'createTime',
      width: 160,
      render: (v: string) => fmtTime(v),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_: unknown, r: AccountingVoucher) => (
        <Space size={4}>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => void openDetail(r)}>
            详情
          </Button>
          <Button
            type="link"
            size="small"
            danger
            style={{ padding: 0 }}
            onClick={() => handleReverse(r)}
          >
            冲销
          </Button>
        </Space>
      ),
    },
  ];

  const subjectColumns: ColumnsType<AccountSubject> = [
    {
      title: '科目编码',
      dataIndex: 'subjectCode',
      width: 140,
      render: (v: string) => <Text style={{ fontFamily: 'monospace' }}>{v}</Text>,
    },
    { title: '科目名称', dataIndex: 'subjectName', width: 200 },
    {
      title: '科目类别',
      dataIndex: 'subjectType',
      width: 130,
      render: (v: string) => SUBJECT_TYPE_MAP[v] ?? v ?? '-',
    },
    {
      title: '余额方向',
      dataIndex: 'balanceDirection',
      width: 110,
      render: (v: string) => BALANCE_DIRECTION_MAP[v] ?? v ?? '-',
    },
  ];

  const entryColumns: ColumnsType<AccountingEntry> = [
    { title: '行号', dataIndex: 'lineNo', width: 60 },
    {
      title: '科目',
      key: 'subject',
      width: 220,
      render: (_: unknown, r: AccountingEntry) => (
        <span>
          <Text style={{ fontFamily: 'monospace' }}>{r.subjectCode}</Text>
          <Text type="secondary"> {r.subjectName}</Text>
        </span>
      ),
    },
    { title: '摘要', dataIndex: 'summary', ellipsis: true },
    {
      title: '借方',
      dataIndex: 'debitAmount',
      width: 130,
      align: 'right',
      render: (v: number) => (Number(v ?? 0) > 0 ? fmtMoney(v) : '-'),
    },
    {
      title: '贷方',
      dataIndex: 'creditAmount',
      width: 130,
      align: 'right',
      render: (v: number) => (Number(v ?? 0) > 0 ? fmtMoney(v) : '-'),
    },
  ];

  const detailDebit = detailEntries.reduce((s, e) => s + Number(e.debitAmount ?? 0), 0);
  const detailCredit = detailEntries.reduce((s, e) => s + Number(e.creditAmount ?? 0), 0);
  const balanced = Math.abs(detailDebit - detailCredit) < 0.005;

  return (
    <div className="u-p-24">
      <Card
        size="small"
        style={{ marginBottom: 12, border: '1px solid var(--color-border-secondary)' }}
        styles={{ body: { padding: '10px 16px' } }}
      >
        <div className="u-d-flex u-jc-between u-ai-center">
          <Space>
            <Text strong style={{ fontSize: 15 }}>会计凭证</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              系统自动记账的台账，无需手工录入
            </Text>
          </Space>
          <Space>
            <Button onClick={handleBackfill} loading={backfilling}>
              补生成缺失凭证
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchVouchers()} loading={loading}>
              刷新
            </Button>
          </Space>
        </div>
      </Card>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="怎么用这个页面"
        description={
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            <div>
              <b>凭证是自动生成的，不用你手工录：</b>
            </div>
            <div>· 账单点「确认」 → 记一张<b>记账凭证</b>（借 成本/费用、贷 应付账款；应收则借 应收账款、贷 收入）</div>
            <div>· 点「付款」 → 记一张<b>收付款凭证</b>（借 应付账款、贷 银行存款）</div>
            <div>· 客户回款点「收款」 → 记一张<b>收付款凭证</b>（借 银行存款、贷 应收账款）</div>
            <div>· 账单被冲销 → 对应凭证自动<b>冲销</b>（生成红字凭证，原凭证保留可追溯）</div>
            <div style={{ marginTop: 4 }}>
              <b>你能做的：</b>「详情」看借贷明细（借方合计 = 贷方合计才算平衡）；
              「冲销」用于记错时红冲；「补生成缺失凭证」用于把历史上漏生成的补上（可重复点）。
            </div>
          </div>
        }
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'vouchers',
            label: '凭证列表',
            children: (
              <>
                <Card
                  style={{ marginBottom: 12 }}
                  styles={{ body: { padding: '12px 16px' } }}
                >
                  <Space wrap size={12}>
                    <RangePicker
                      value={dateRange}
                      onChange={(v) => setDateRange(v ?? null)}
                      allowClear
                    />
                    <Select
                      placeholder="凭证类型"
                      allowClear
                      style={{ width: 150 }}
                      value={typeFilter}
                      onChange={setTypeFilter}
                      options={Object.entries(VOUCHER_TYPE_MAP).map(([value, cfg]) => ({
                        value,
                        label: cfg.text,
                      }))}
                    />
                    <Input
                      placeholder="凭证号 / 摘要 / 制单人"
                      allowClear
                      prefix={<SearchOutlined />}
                      style={{ width: 220 }}
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                    />
                    <Button type="primary" onClick={() => void fetchVouchers()} loading={loading}>
                      查询
                    </Button>
                    <Button
                      onClick={() => {
                        setDateRange(null);
                        setTypeFilter(undefined);
                        setKeyword('');
                      }}
                    >
                      重置
                    </Button>
                  </Space>
                  <div style={{ marginTop: 10 }}>
                    <Space size={20}>
                      <Text type="secondary">
                        凭证张数 <Text strong>{totals.count}</Text>
                      </Text>
                      <Text type="secondary">
                        金额合计 <Text strong>{fmtMoney(totals.amount)}</Text>
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        （列表最多显示 500 条，可用日期范围缩小）
                      </Text>
                    </Space>
                  </div>
                </Card>

                <Card styles={{ body: { padding: 0 } }}>
                  <Table<AccountingVoucher>
                    rowKey="id"
                    size="small"
                    loading={loading}
                    columns={voucherColumns}
                    dataSource={filteredVouchers}
                    scroll={{ x: 1080 }}
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
                    locale={{
                      emptyText: (
                        <Empty
                          description={
                            <span>
                              暂无凭证。
                              <br />
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                凭证由账单确认/付款/收款自动生成；若一直为空，请确认会计科目与科目映射已配置。
                              </Text>
                            </span>
                          }
                        />
                      ),
                    }}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'subjects',
            label: '会计科目',
            children: (
              <Card styles={{ body: { padding: 0 } }}>
                <Table<AccountSubject>
                  rowKey="id"
                  size="small"
                  loading={subjectsLoading}
                  columns={subjectColumns}
                  dataSource={subjects}
                  pagination={false}
                  locale={{
                    emptyText: (
                      <Empty description="暂无会计科目。请先在系统设置中为本租户初始化会计科目。" />
                    ),
                  }}
                />
              </Card>
            ),
          },
        ]}
      />

      <Drawer
        title={
          <Space>
            <span>凭证详情</span>
            {detailVoucher?.voucherNo && (
              <Text type="secondary" style={{ fontFamily: 'monospace' }}>
                {detailVoucher.voucherNo}
              </Text>
            )}
            {detailVoucher?.voucherType && VOUCHER_TYPE_MAP[detailVoucher.voucherType] && (
              <Tag color={VOUCHER_TYPE_MAP[detailVoucher.voucherType].color}>
                {VOUCHER_TYPE_MAP[detailVoucher.voucherType].text}
              </Tag>
            )}
          </Space>
        }
        width="min(960px, 92vw)"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        destroyOnHidden
      >
        {detailVoucher && (
          <>
            <Descriptions
              column={2}
              bordered
              size="small"
              style={{ marginBottom: 16 }}
              items={[
                { key: 'date', label: '凭证日期', children: detailVoucher.voucherDate || '-' },
                {
                  key: 'std',
                  label: '会计准则',
                  children: ACCOUNTING_STANDARD_MAP[detailVoucher.accountingStandard ?? '']
                    ?? detailVoucher.accountingStandard
                    ?? '-',
                },
                { key: 'summary', label: '摘要', children: detailVoucher.summary || '-' },
                { key: 'by', label: '制单人', children: detailVoucher.createBy || '-' },
                {
                  key: 'amount',
                  label: '凭证金额',
                  children: <Text strong>{fmtMoney(detailVoucher.totalAmount)}</Text>,
                },
                { key: 'time', label: '生成时间', children: fmtTime(detailVoucher.createTime) },
              ]}
            />

            <div style={{ marginBottom: 8 }}>
              <Space size={20}>
                <Text strong>分录</Text>
                <Text type="secondary">
                  借方合计 <Text strong>{fmtMoney(detailDebit)}</Text>
                </Text>
                <Text type="secondary">
                  贷方合计 <Text strong>{fmtMoney(detailCredit)}</Text>
                </Text>
                {balanced ? (
                  <Tag color="success">借贷平衡</Tag>
                ) : (
                  <Tag color="error">借贷不平衡（请核对）</Tag>
                )}
              </Space>
            </div>

            <Table<AccountingEntry>
              rowKey="id"
              size="small"
              loading={detailLoading}
              columns={entryColumns}
              dataSource={detailEntries}
              pagination={false}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}>
                    <Text strong>合计</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong>{fmtMoney(detailDebit)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong>{fmtMoney(detailCredit)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </>
        )}
      </Drawer>
    </div>
  );
};

export default AccountingVoucherPage;
