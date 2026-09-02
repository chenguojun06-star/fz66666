import React, { Suspense, lazy } from 'react';
import { Card, Row, Col, Spin, Space, Table, Empty, DatePicker, Tabs } from 'antd';
import type { Dayjs } from 'dayjs';
import { useFinanceDashboardData } from './hooks/useFinanceDashboardData';
import styles from './index.module.css';
import StatCard from './components/StatCard';
import TrendChart from './components/TrendChart';
import PieChart from './components/PieChart';
import { DailyFlowContent } from '../Finance/DailyFlow';

const ReactECharts = lazy(() => import('echarts-for-react'));

const { RangePicker } = DatePicker;

const FinanceDashboard: React.FC = () => {
  const {
    loading,
    data,
    customRange,
    setCustomRange,
    goToModule,
    selectedDetail,
    setSelectedDetail,
    cashFlowChartOption,
    cashFlowLoading,
    statCards,
    detailConfig,
  } = useFinanceDashboardData();

  const overviewContent = (
    <>
      {/* 顶部筛选 */}
      <Card className={styles.filterCard}>
        <Space size={12} wrap>
          <span className={styles.filterLabel}>统计区间：</span>
          <RangePicker
            value={customRange as [Dayjs, Dayjs] | null}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setCustomRange([dates[0], dates[1]]);
              } else {
                setCustomRange(null);
              }
            }}
            allowClear
            style={{ width: 240 }}
          />
          <span className={styles.filterHint}>未选择时默认当月；现金流趋势同步该区间</span>
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
            title="现金流趋势（业务发生口径，含每日经营流水）"
            className={styles.chartCard}
          >
            <Spin spinning={cashFlowLoading}>
              <Suspense fallback={<div className={styles.emptyChart}>图表加载中...</div>}>
                <ReactECharts option={cashFlowChartOption} style={{ height: 300 }} />
              </Suspense>
            </Spin>
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
              <a onClick={() => goToModule(selectedDetail)} style={{ fontSize: 12 }}>
                查看全部
              </a>
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
    </>
  );

  return (
    <Spin spinning={loading}>
      {/* D-273：每日流水并入财务总览做 tab（数据同源：六类业务流水） */}
      <Tabs
        type="card"
        items={[
          { key: 'overview', label: '总览', children: overviewContent },
          { key: 'dailyFlow', label: '每日流水', children: <DailyFlowContent /> },
        ]}
      />
    </Spin>
  );
};

export default FinanceDashboard;
