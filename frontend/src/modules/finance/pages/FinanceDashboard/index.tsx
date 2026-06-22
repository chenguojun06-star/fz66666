import React from 'react';
import { Card, Row, Col, Button, Spin, Space } from 'antd';
import { useFinanceBIData, type TimeRangeType } from './hooks/useFinanceBIData';
import styles from './index.module.css';

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
  onClick?: () => void;
  color?: string;
}> = ({ title, value, prefix = '¥', onClick, color }) => (
  <Card className={styles.statCard} onClick={onClick} hoverable={!!onClick}>
    <div className={styles.cardTitle}>{title}</div>
    <div className={styles.cardValue} style={color ? { color } : undefined}>
      {prefix}{value.toLocaleString()}
    </div>
  </Card>
);

const BarChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className={styles.barChart}>
      {data.map((item, idx) => (
        <div key={idx} className={styles.barItem}>
          <div className={styles.barLabel}>{item.label}</div>
          <div className={styles.barContainer}>
            <div className={styles.barFill} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <div className={styles.barValue}>¥{item.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
};

const PieChart: React.FC<{ data: { type: string; value: number }[] }> = ({ data }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <div className={styles.emptyChart}>暂无数据</div>;
  const colors = ['#1890ff', '#ff7875', '#ffa940', '#52c41a'];
  let currentAngle = 0;
  return (
    <div className={styles.pieChart}>
      <svg viewBox="0 0 100 100" className={styles.pieSvg}>
        {data.map((item, idx) => {
          const angle = (item.value / total) * 360;
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
        <circle cx="50" cy="50" r="25" fill="#fff" />
      </svg>
      <div className={styles.pieLegend}>
        {data.map((item, idx) => (
          <div key={idx} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ backgroundColor: colors[idx % colors.length] }} />
            <span className={styles.legendText}>{item.type}</span>
            <span className={styles.legendValue}>¥{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const FinanceDashboard: React.FC = () => {
  const { loading, data, timeRange, setTimeRange, resetFilters, goToModule } = useFinanceBIData();

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
        <Col span={4}><StatCard title="总营收" value={data.totalRevenue} onClick={() => goToModule('revenue')} /></Col>
        <Col span={4}><StatCard title="应付账款" value={data.accountsPayable} color="var(--color-warning)" onClick={() => goToModule('payable')} /></Col>
        <Col span={4}><StatCard title="工资支出" value={data.wageExpense} color="var(--color-danger)" onClick={() => goToModule('wage')} /></Col>
        <Col span={4}><StatCard title="费用支出" value={data.expenseCost} color="#ffa940" onClick={() => goToModule('expense')} /></Col>
        <Col span={4}><StatCard title="净利润" value={data.netProfit} color={data.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)'} /></Col>
        <Col span={4}><StatCard title="待审批" value={data.pendingApprovals} prefix="" color="var(--color-info)" onClick={() => goToModule('approval')} /></Col>
      </Row>

      {/* 图表区 */}
      <Row gutter={12} className={styles.chartRow}>
        <Col span={14}>
          <Card title="营收趋势" className={styles.chartCard}>
            {data.revenueTrend.length > 0 ? <BarChart data={data.revenueTrend} /> : <div className={styles.emptyChart}>暂无数据</div>}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="成本结构" className={styles.chartCard}>
            {data.costStructure.length > 0 ? <PieChart data={data.costStructure} /> : <div className={styles.emptyChart}>暂无数据</div>}
          </Card>
        </Col>
      </Row>
    </Spin>
  );
};

export default FinanceDashboard;
