import React, { useMemo, useState, Suspense, lazy } from 'react';
import { Card, Row, Col, Button, Spin, Space, Table, Empty, Segmented } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useFinanceBIData, type TimeRangeType } from './hooks/useFinanceBIData';
import styles from './index.module.css';

const ReactECharts = lazy(() => import('echarts-for-react'));

type CashFlowDays = 7 | 30 | 90;

const generateCashFlowMockData = (days: number) => {
  const data: { date: string; income: number; expense: number }[] = [];
  const today = dayjs();
  for (let i = days - 1; i >= 0; i--) {
    const date = today.subtract(i, 'day');
    const baseIncome = 50000 + Math.sin(i / 5) * 20000 + Math.random() * 15000;
    const baseExpense = 35000 + Math.cos(i / 7) * 15000 + Math.random() * 10000;
    data.push({
      date: date.format('MM-DD'),
      income: Math.round(baseIncome),
      expense: Math.round(baseExpense),
    });
  }
  return data;
};

const TIME_OPTIONS: { label: string; value: TimeRangeType }[] = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
];

// 指标卡定义：key 用于切换明细、valueSource 用于取值
type StatKey =
  | 'revenue'
  | 'payable'
  | 'wage'
  | 'material'
  | 'expense'
  | 'advance'
  | 'profit'
  | 'approval';

const StatCard: React.FC<{
  title: string;
  value: number;
  prefix?: string;
  color?: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ title, value, prefix = '¥', color, active, onClick }) => (
  <Card
    className={styles.statCard}
    onClick={onClick}
    hoverable={!!onClick}
    style={active ? { borderColor: 'var(--color-primary)', borderWidth: 2 } : undefined}
  >
    <div className={styles.cardTitle}>{title}</div>
    <div className={styles.cardValue} style={color ? { color } : undefined}>
      {prefix}
      {value.toLocaleString()}
    </div>
  </Card>
);

// 趋势柱图：叠加显示营收（蓝）与成本（橙）
const TrendChart: React.FC<{ data: { label: string; revenue: number; cost: number; profit: number }[] }> = ({ data }) => {
  if (!data.length) return <div className={styles.emptyChart}>暂无数据</div>;
  const max = Math.max(...data.flatMap(d => [d.revenue, d.cost]), 1);
  return (
    <div className={styles.barChart} style={{ height: 'auto', padding: '12px 0' }}>
      {data.map((item, idx) => (
        <div key={idx} className={styles.barItem} style={{ height: 28, marginBottom: 4 }}>
          <div className={styles.barLabel}>{item.label}</div>
          <div className={styles.barContainer} style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${(item.revenue / max) * 100}%`,
                background: 'linear-gradient(90deg, #1890ff, #40a9ff)',
                borderRadius: 4,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                height: '40%',
                width: `${(item.cost / max) * 100}%`,
                background: '#ffa940',
                borderRadius: 4,
                opacity: 0.85,
              }}
            />
          </div>
          <div className={styles.barValue} style={{ width: 110 }}>
            ¥{item.revenue.toLocaleString()} / -¥{item.cost.toLocaleString()}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1890ff', marginRight: 4, borderRadius: 2 }} />营收
        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#ffa940', margin: '0 4px 0 12px', borderRadius: 2 }} />成本
      </div>
    </div>
  );
};

const PieChart: React.FC<{ data: { type: string; value: number }[] }> = ({ data }) => {
  const total = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  if (total === 0) return <div className={styles.emptyChart}>暂无成本数据</div>;
  const colors = ['var(--color-primary)', '#ffa940', '#ff7875', 'var(--color-success)'];
  let currentAngle = 0;
  return (
    <div className={styles.pieChart}>
      <svg viewBox="0 0 100 100" className={styles.pieSvg}>
        {data.map((item, idx) => {
          const value = Number(item.value) || 0;
          if (value <= 0) return null;
          const angle = (value / total) * 360;
          const startAngle = currentAngle;
          currentAngle += angle;
          const startRad = (startAngle - 90) * (Math.PI / 180);
          const endRad = (currentAngle - 90) * (Math.PI / 180);
          const x1 = 50 + 40 * Math.cos(startRad);
          const y1 = 50 + 40 * Math.sin(startRad);
          const x2 = 50 + 40 * Math.cos(endRad);
          const y2 = 50 + 40 * Math.sin(endRad);
          const largeArcFlag = angle > 180 ? 1 : 0;
          const path = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
          return <path key={idx} d={path} fill={colors[idx % colors.length]} />;
        })}
        <circle cx="50" cy="50" r="25" fill="var(--color-bg-base)" />
      </svg>
      <div className={styles.pieLegend}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          总成本 ¥{total.toLocaleString()}
        </div>
        {data.map((item, idx) => {
          const value = Number(item.value) || 0;
          const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
          return (
            <div key={idx} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ backgroundColor: colors[idx % colors.length] }} />
              <span className={styles.legendText}>{item.type}</span>
              <span className={styles.legendValue}>¥{value.toLocaleString()} ({percent}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FinanceDashboard: React.FC = () => {
  const { loading, data, timeRange, setTimeRange, goToModule } = useFinanceBIData();
  const [selectedDetail, setSelectedDetail] = useState<StatKey>('revenue');
  const [cashFlowDays, setCashFlowDays] = useState<CashFlowDays>(30);

  const cashFlowData = useMemo(() => generateCashFlowMockData(cashFlowDays), [cashFlowDays]);

  const cashFlowChartOption = useMemo(() => {
    const dates = cashFlowData.map(d => d.date);
    const incomes = cashFlowData.map(d => d.income);
    const expenses = cashFlowData.map(d => d.expense);
    return {
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: 'var(--color-bg-base)',
        borderColor: 'var(--color-border)',
        borderWidth: 1,
        textStyle: {
          color: 'var(--color-text-primary)',
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const date = params[0].axisValue;
          let html = `<div style="padding: 4px 0; font-weight: 600; color: var(--color-text-primary);">${date}</div>`;
          params.forEach((item: any) => {
            const value = item.value !== undefined && item.value !== null ? item.value : 0;
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 2px 0;">
                <span style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${item.color};"></span>
                  <span style="color: var(--color-text-primary);">${item.seriesName}</span>
                </span>
                <span style="font-weight: 600; color: var(--color-text-primary);">¥${Number(value).toLocaleString()}</span>
              </div>
            `;
          });
          return html;
        },
      },
      legend: {
        data: ['收入', '支出'],
        top: 5,
        textStyle: {
          fontSize: 14,
          color: 'var(--color-text-secondary)',
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '5px',
        top: 35,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: {
          lineStyle: {
            color: 'var(--color-border)',
          },
        },
        axisLabel: {
          color: 'var(--color-text-tertiary)',
          fontSize: 12,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: 'var(--color-text-tertiary)',
          fontSize: 12,
          formatter: (value: number) => {
            if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
            return value.toLocaleString();
          },
        },
        splitLine: {
          lineStyle: {
            color: 'var(--color-border-light)',
          },
        },
      },
      series: [
        {
          name: '收入',
          type: 'line',
          smooth: true,
          data: incomes,
          lineStyle: {
            width: 2,
            color: 'var(--color-success)',
          },
          itemStyle: {
            color: 'var(--color-success)',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(82, 196, 26, 0.25)' },
                { offset: 1, color: 'rgba(82, 196, 26, 0.02)' },
              ],
            },
          },
        },
        {
          name: '支出',
          type: 'line',
          smooth: true,
          data: expenses,
          lineStyle: {
            width: 2,
            color: 'var(--color-error)',
          },
          itemStyle: {
            color: 'var(--color-error)',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255, 77, 79, 0.25)' },
                { offset: 1, color: 'rgba(255, 77, 79, 0.02)' },
              ],
            },
          },
        },
      ],
    };
  }, [cashFlowData]);

  const statCards = useMemo(
    () => [
      { key: 'revenue' as StatKey, title: '总营收', value: data.summary.totalRevenue, color: undefined },
      { key: 'payable' as StatKey, title: '应付账款', value: data.summary.accountsPayable, color: 'var(--color-warning)' },
      { key: 'profit' as StatKey, title: '净利润', value: data.summary.netProfit, color: data.summary.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)' },
      { key: 'approval' as StatKey, title: `待审批 / 逾期`, value: data.summary.pendingApprovals, color: 'var(--color-info)' },
      { key: 'wage' as StatKey, title: '工资支出', value: data.summary.wageExpense, color: 'var(--color-danger)' },
      { key: 'material' as StatKey, title: '物料成本', value: data.summary.materialCost, color: '#13c2c2' },
      { key: 'expense' as StatKey, title: '费用支出', value: data.summary.expenseCost, color: '#ffa940' },
      { key: 'advance' as StatKey, title: '员工借支', value: data.summary.advanceAmount, color: '#ff7875' },
    ],
    [data.summary],
  );

  // 明细列表：根据选中的指标卡渲染不同列
  const detailConfig = useMemo<{ title: string; columns: ColumnsType<any>; rows: any[] }>(() => {
    switch (selectedDetail) {
      case 'revenue':
        return {
          title: '营收明细（出货对账 + 电商销售）',
          columns: [
            { title: '来源', dataIndex: 'source', width: 140 },
            { title: '单号', dataIndex: 'orderNo' },
            { title: '客户/店铺', dataIndex: 'customerName' },
            { title: '金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
            { title: '时间', dataIndex: 'time', width: 110 },
          ],
          rows: data.details.revenue,
        };
      case 'payable':
        return {
          title: '应付账款明细（待付/部分付/逾期）',
          columns: [
            { title: '应付单号', dataIndex: 'payableNo' },
            { title: '供应商', dataIndex: 'supplierName' },
            { title: '应付金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
            { title: '已付金额', dataIndex: 'paidAmount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
            { title: '未付余额', dataIndex: 'outstanding', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
            { title: '状态', dataIndex: 'status', width: 100 },
            { title: '到期日', dataIndex: 'dueDate', width: 110 },
          ],
          rows: data.details.payable,
        };
      case 'wage':
        return {
          title: '工资支付明细（已支付）',
          columns: [
            { title: '支付单号', dataIndex: 'paymentNo' },
            { title: '收款方', dataIndex: 'payeeName' },
            { title: '业务类型', dataIndex: 'bizType', width: 110 },
            { title: '金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
            { title: '支付方式', dataIndex: 'paymentMethod', width: 100 },
            { title: '时间', dataIndex: 'time', width: 110 },
          ],
          rows: data.details.wage,
        };
      case 'material':
        return {
          title: '物料对账明细（已审批/已支付）',
          columns: [
            { title: '对账单号', dataIndex: 'reconciliationNo' },
            { title: '供应商', dataIndex: 'supplierName' },
            { title: '物料', dataIndex: 'materialName' },
            { title: '对账金额', dataIndex: 'finalAmount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
            { title: '状态', dataIndex: 'status', width: 100 },
            { title: '审批时间', dataIndex: 'time', width: 110 },
          ],
          rows: data.details.material,
        };
      case 'expense':
        return {
          title: '费用报销明细（已审批/已付款）',
          columns: [
            { title: '报销单号', dataIndex: 'reimbursementNo' },
            { title: '申请人', dataIndex: 'applicantName', width: 100 },
            { title: '类型', dataIndex: 'expenseType', width: 110 },
            { title: '事由', dataIndex: 'title' },
            { title: '金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
            { title: '状态', dataIndex: 'status', width: 100 },
            { title: '审批时间', dataIndex: 'time', width: 110 },
          ],
          rows: data.details.expense,
        };
      case 'advance':
        return {
          title: '员工借支明细（未还清）',
          columns: [
            { title: '借支单号', dataIndex: 'advanceNo' },
            { title: '员工', dataIndex: 'employeeName' },
            { title: '借支金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
            { title: '未还余额', dataIndex: 'remainingAmount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
            { title: '还款状态', dataIndex: 'repaymentStatus', width: 110 },
            { title: '创建时间', dataIndex: 'time', width: 110 },
          ],
          rows: data.details.advance,
        };
      case 'profit':
        return {
          title: '净利润构成',
          columns: [
            { title: '项目', dataIndex: 'name' },
            { title: '金额', dataIndex: 'value', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
          ],
          rows: [
            { name: '总营收', value: data.summary.totalRevenue },
            { name: '工资支出', value: -data.summary.wageExpense },
            { name: '物料成本', value: -data.summary.materialCost },
            { name: '费用支出', value: -data.summary.expenseCost },
            { name: '员工借支', value: -data.summary.advanceAmount },
            { name: '净利润', value: data.summary.netProfit },
          ],
        };
      case 'approval':
        return {
          title: '待审批 / 逾期统计',
          columns: [
            { title: '项目', dataIndex: 'name' },
            { title: '数量', dataIndex: 'count', align: 'right' as const },
          ],
          rows: [
            { name: '待审批总数（物料+费用+借支+出货）', count: data.summary.pendingApprovals },
            { name: '逾期应付账款笔数', count: data.summary.overdueCount },
          ],
        };
      default:
        return { title: '', columns: [], rows: [] };
    }
  }, [selectedDetail, data.details, data.summary]);

  return (
    <Spin spinning={loading}>
      {/* 顶部筛选 */}
      <Card className={styles.filterCard}>
        <Space size={12} wrap>
          <span className={styles.filterLabel}>时间：</span>
          {TIME_OPTIONS.map(opt => (
            <Button key={opt.value} type="primary" ghost={timeRange !== opt.value} onClick={() => setTimeRange(opt.value)}>
              {opt.label}
            </Button>
          ))}
        </Space>
      </Card>

      {/* 指标卡 */}
      <Row gutter={[12, 12]} className={styles.statRow}>
        {statCards.map(card => (
          <Col span={6} key={card.key}>
            <StatCard
              title={card.title}
              value={card.value}
              color={card.color}
              active={selectedDetail === card.key}
              onClick={() => setSelectedDetail(card.key)}
            />
          </Col>
        ))}
      </Row>

      {/* 图表区 */}
      <Row gutter={12} className={styles.chartRow}>
        <Col span={14}>
          <Card title="营收/成本趋势（按月）" className={styles.chartCard}>
            <TrendChart data={data.revenueTrend} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="成本结构" className={styles.chartCard}>
            <PieChart data={data.costStructure} />
          </Card>
        </Col>
      </Row>

      {/* 现金流趋势 */}
      <Row gutter={12} className={styles.chartRow}>
        <Col span={24}>
          <Card
            title="现金流趋势"
            className={styles.chartCard}
            extra={
              <Segmented
                size="small"
                value={cashFlowDays}
                onChange={(v) => setCashFlowDays(v as CashFlowDays)}
                options={[
                  { label: '近7天', value: 7 },
                  { label: '近30天', value: 30 },
                  { label: '近90天', value: 90 },
                ]}
              />
            }
          >
            <Suspense fallback={<div className={styles.emptyChart}>图表加载中...</div>}>
              <ReactECharts option={cashFlowChartOption} style={{ height: 300 }} />
            </Suspense>
          </Card>
        </Col>
      </Row>

      {/* 明细列表 */}
      <Row className={styles.tableRow}>
        <Col span={24}>
          <Card
            title={detailConfig.title}
            className={styles.tableCard}
            extra={
              <Button type="link" size="small" onClick={() => goToModule(selectedDetail)}>
                查看全部
              </Button>
            }
          >
            <Table
              size="small"
              rowKey={(record, idx) => String(idx)}
              columns={detailConfig.columns}
              dataSource={detailConfig.rows}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无明细数据" /> }}
            />
          </Card>
        </Col>
      </Row>
    </Spin>
  );
};

export default FinanceDashboard;
