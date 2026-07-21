import React, { Suspense, lazy } from 'react';
import { Card, Row, Col, Button, Spin, Space, Table, Empty, Segmented } from 'antd';
import { useFinanceDashboardData } from './hooks/useFinanceDashboardData';
import styles from './index.module.css';
import { TIME_OPTIONS, CASH_FLOW_DAYS_OPTIONS } from './helpers';
import StatCard from './components/StatCard';
import TrendChart from './components/TrendChart';
import PieChart from './components/PieChart';

const ReactECharts = lazy(() => import('echarts-for-react'));

const FinanceDashboard: React.FC = () => {
  const {
    loading,
    data,
    timeRange,
    setTimeRange,
    goToModule,
    selectedDetail,
    setSelectedDetail,
    cashFlowDays,
    setCashFlowDays,
    cashFlowChartOption,
    statCards,
    detailConfig,
  } = useFinanceDashboardData();

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
                onChange={(v) => setCashFlowDays(v as 7 | 30 | 90)}
                options={CASH_FLOW_DAYS_OPTIONS}
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
