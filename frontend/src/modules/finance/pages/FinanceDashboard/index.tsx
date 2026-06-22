import React from 'react';
import { Card, Row, Col, Select, Input, Button, Spin, Space, Table } from 'antd';
import { Line, Pie } from '@ant-design/charts';
import { useFinanceBIData, type TimeRangeType } from './hooks/useFinanceBIData';
import styles from './index.module.css';

const { RangePicker } = require('antd');
const { Option } = Select;

const TIME_OPTIONS: { label: string; value: TimeRangeType }[] = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
];

const StatCard: React.FC<{
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  onClick?: () => void;
  color?: string;
}> = ({ title, value, prefix = '¥', suffix, onClick, color }) => (
  <Card
    className={styles.statCard}
    onClick={onClick}
    hoverable={!!onClick}
  >
    <div className={styles.cardTitle}>{title}</div>
    <div className={styles.cardValue} style={color ? { color } : undefined}>
      {prefix}{value.toLocaleString()}{suffix}
    </div>
  </Card>
);

const FinanceDashboard: React.FC = () => {
  const {
    loading,
    data,
    timeRange,
    setTimeRange,
    customRange,
    setCustomRange,
    factoryId,
    setFactoryId,
    styleNo,
    setStyleNo,
    factories,
    resetFilters,
    goToModule,
  } = useFinanceBIData();

  // 营收趋势折线图配置
  const lineConfig = {
    data: data.revenueTrend,
    xField: 'month',
    yField: 'value',
    smooth: true,
    color: '#1890ff',
    label: undefined,
    xAxis: { label: { style: { fill: '#8c8c8c', fontSize: 10 } } },
    yAxis: { label: { style: { fill: '#8c8c8c', fontSize: 10 }, formatter: (v: string) => `¥${Number(v).toLocaleString()}` } },
    tooltip: { formatter: (datum: any) => ({ name: '营收', value: `¥${datum.value.toLocaleString()}` }) },
  };

  // 成本结构饼图配置
  const pieConfig = {
    data: data.costStructure,
    angleField: 'value',
    colorField: 'type',
    radius: 0.8,
    innerRadius: 0.6,
    label: { text: 'type', style: { fontSize: 10 } },
    legend: { position: 'right' as const },
    statistic: { title: { content: '总成本', style: { fontSize: 12 } }, value: { content: `¥${(data.wageExpense + data.materialCost + data.expenseCost).toLocaleString()}`, style: { fontSize: 14 } } },
    color: ['#ff7875', '#ffa940', '#ffd666'],
  };

  const factoryColumns = [
    { title: '工厂', dataIndex: 'factoryName', key: 'factoryName' },
    { title: '成本', dataIndex: 'cost', key: 'cost', align: 'right' as const, render: (v: number) => `¥${v.toLocaleString()}` },
  ];

  const styleColumns = [
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo' },
    { title: '利润', dataIndex: 'profit', key: 'profit', align: 'right' as const, render: (v: number) => `¥${v.toLocaleString()}` },
  ];

  return (
    <Spin spinning={loading}>
      {/* 顶部筛选区 */}
      <Card className={styles.filterCard}>
        <Space size={12} wrap>
          <span className={styles.filterLabel}>时间：</span>
          {TIME_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              type="primary"
              ghost={timeRange !== opt.value}
              onClick={() => { setTimeRange(opt.value); setCustomRange(null); }}
            >
              {opt.label}
            </Button>
          ))}
          <RangePicker
            value={customRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setCustomRange([dates[0], dates[1]]);
                setTimeRange('custom');
              } else {
                setCustomRange(null);
              }
            }}
            style={{ width: 240 }}
          />
          <span className={styles.filterLabel}>工厂：</span>
          <Select
            value={factoryId || undefined}
            onChange={setFactoryId}
            placeholder="全部工厂"
            allowClear
            style={{ width: 140 }}
          >
            {factories.map(f => <Option key={f.id} value={f.id}>{f.name}</Option>)}
          </Select>
          <Input
            placeholder="款号/订单号"
            value={styleNo}
            onChange={e => setStyleNo(e.target.value)}
            style={{ width: 120 }}
            allowClear
          />
          <Button onClick={resetFilters}>重置</Button>
        </Space>
      </Card>

      {/* 汇总指标卡（6个） */}
      <Row gutter={[12, 12]} className={styles.statRow}>
        <Col span={4}>
          <StatCard title="总营收" value={data.totalRevenue} onClick={() => goToModule('revenue')} />
        </Col>
        <Col span={4}>
          <StatCard title="应付账款" value={data.accountsPayable} color="var(--color-warning)" onClick={() => goToModule('payable')} />
        </Col>
        <Col span={4}>
          <StatCard title="工资支出" value={data.wageExpense} color="var(--color-danger)" onClick={() => goToModule('wage')} />
        </Col>
        <Col span={4}>
          <StatCard title="物料成本" value={data.materialCost} color="var(--color-info)" onClick={() => goToModule('material')} />
        </Col>
        <Col span={4}>
          <StatCard title="费用支出" value={data.expenseCost} color="#ffa940" onClick={() => goToModule('expense')} />
        </Col>
        <Col span={4}>
          <StatCard title="净利润" value={data.netProfit} color={data.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)'} onClick={() => goToModule('profit')} />
        </Col>
      </Row>

      {/* 图表区 */}
      <Row gutter={12} className={styles.chartRow}>
        <Col span={14}>
          <Card title="营收趋势" className={styles.chartCard}>
            {data.revenueTrend.length > 0 ? (
              <Line {...lineConfig} style={{ height: 260 }} />
            ) : (
              <div className={styles.emptyChart}>暂无数据</div>
            )}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="成本结构" className={styles.chartCard}>
            {data.costStructure.length > 0 ? (
              <Pie {...pieConfig} style={{ height: 260 }} />
            ) : (
              <div className={styles.emptyChart}>暂无数据</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 明细表 */}
      <Row gutter={12} className={styles.tableRow}>
        <Col span={12}>
          <Card title="工厂成本排行" className={styles.tableCard}>
            <Table
              columns={factoryColumns}
              dataSource={data.factoryRanking}
              rowKey="factoryName"
              size="small"
              pagination={false}
              scroll={{ y: 200 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="款号利润排行" className={styles.tableCard}>
            <Table
              columns={styleColumns}
              dataSource={data.styleProfitRanking}
              rowKey="styleNo"
              size="small"
              pagination={false}
              scroll={{ y: 200 }}
            />
          </Card>
        </Col>
      </Row>
    </Spin>
  );
};

export default FinanceDashboard;