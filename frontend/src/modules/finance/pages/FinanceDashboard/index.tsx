import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tabs, DatePicker, Statistic, Tooltip, Spin, Space } from 'antd';
import { InfoCircleOutlined, CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import { Column } from '@ant-design/charts';
import Layout from '@/components/Layout';
import api from '@/utils/api';
import dayjs from 'dayjs';
import styles from './index.module.css';
import { useRequest } from '@/hooks';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

const { RangePicker } = DatePicker;

// 统计卡片数据接口
interface StatCardData {
  totalAmount: number;           // 总金额
  totalAmountChange: number;     // 周同比变化
  totalAmountDayChange: number;  // 日同比变化
  dailyAmount: number;           // 日金额

  warehousedCount: number;       // 入库数量
  warehousedDayCount: number;    // 日入库数量

  orderCount: number;            // 订单数量
  completionRate: number;        // 完成率

  profitRate: number;            // 利润率
  profitRateChange: number;      // 周同比变化
  profitRateDayChange: number;   // 日同比变化
}

// 趋势数据
interface TrendData {
  month: string;
  value: number;
  type: string;
}

// 排名数据
interface RankData {
  rank: number;
  name: string;
  value: number;
}

type TimeRangeType = 'today' | 'week' | 'month' | 'year' | 'custom';

const FinanceDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'amount' | 'count'>('amount');
  const [timeRange, setTimeRange] = useState<TimeRangeType>('year');
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

  const [statData, setStatData] = useState<StatCardData>({
    totalAmount: 0, totalAmountChange: 0, totalAmountDayChange: 0, dailyAmount: 0,
    warehousedCount: 0, warehousedDayCount: 0,
    orderCount: 0, completionRate: 0,
    profitRate: 0, profitRateChange: 0, profitRateDayChange: 0,
  });

  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [rankData, setRankData] = useState<RankData[]>([]);

  // ===== 使用 useRequest 优化数据加载 =====
  const { run: loadData, loading } = useRequest(async () => {
    try {
      // 计算日期范围
      let startDate: string, endDate: string;
      const today = dayjs();

      switch (timeRange) {
        case 'today':
          startDate = endDate = today.format('YYYY-MM-DD');
          break;
        case 'week':
          startDate = today.startOf('week').format('YYYY-MM-DD');
          endDate = today.endOf('week').format('YYYY-MM-DD');
          break;
        case 'month':
          startDate = today.startOf('month').format('YYYY-MM-DD');
          endDate = today.endOf('month').format('YYYY-MM-DD');
          break;
        case 'year':
          startDate = today.startOf('year').format('YYYY-MM-DD');
          endDate = today.endOf('year').format('YYYY-MM-DD');
          break;
        case 'custom':
          if (customRange) {
            startDate = customRange[0].format('YYYY-MM-DD');
            endDate = customRange[1].format('YYYY-MM-DD');
          } else {
            startDate = today.startOf('year').format('YYYY-MM-DD');
            endDate = today.endOf('year').format('YYYY-MM-DD');
          }
          break;
      }

      // 调用汇总API
      const response = await api.get('/finance/finished-settlement/summary', {
        params: { startDate, endDate, dimension: activeTab === 'amount' ? 'amount' : 'count' }
      });

      if (response.code === 200 && response.data) {
        const data = response.data;
        setStatData({
          totalAmount: data.totalAmount ?? 0,
          totalAmountChange: data.totalAmountChange ?? 0,
          totalAmountDayChange: data.totalAmountDayChange ?? 0,
          dailyAmount: data.dailyAmount ?? 0,
          warehousedCount: data.warehousedCount ?? 0,
          warehousedDayCount: data.warehousedDayCount ?? 0,
          orderCount: data.orderCount ?? 0,
          completionRate: data.completionRate ?? 0,
          profitRate: data.profitRate ?? 0,
          profitRateChange: data.profitRateChange ?? 0,
          profitRateDayChange: data.profitRateDayChange ?? 0,
        });

        // 趋势数据
        if (data.trend && Array.isArray(data.trend)) {
          setTrendData(data.trend);
        } else {
          // 生成模拟趋势数据
          setTrendData(generateMockTrendData());
        }

        // 排名数据
        if (data.rank && Array.isArray(data.rank)) {
          setRankData(data.rank);
        } else {
          setRankData(generateMockRankData());
        }
        if (showSmartErrorNotice) setSmartError(null);
      }
    } catch (error) {
      console.error('加载财务汇总数据失败:', error);
      reportSmartError('财务看板数据加载失败', '网络异常或服务不可用，请稍后重试', 'FINANCE_DASHBOARD_LOAD_FAILED');
      // API失败时显示0值，不使用假数据
      setStatData({
        totalAmount: 0,
        totalAmountChange: 0,
        totalAmountDayChange: 0,
        dailyAmount: 0,
        warehousedCount: 0,
        warehousedDayCount: 0,
        orderCount: 0,
        completionRate: 0,
        profitRate: 0,
        profitRateChange: 0,
        profitRateDayChange: 0,
      });
      setTrendData([]);
      setRankData([]);
    }
  }, { manual: true });

  // 生成模拟趋势数据
  const generateMockTrendData = (): TrendData[] => {
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const values = [1200, 1100, 350, 900, 250, 400, 1050, 750, 800, 1100, 380, 780];
    return months.map((month, index) => ({
      month,
      value: values[index],
      type: activeTab === 'amount' ? '金额' : '数量',
    }));
  };

  // 生成模拟排名数据
  const generateMockRankData = (): RankData[] => {
    return [
      { rank: 1, name: '车缝工序', value: 323234 },
      { rank: 2, name: '裁剪工序', value: 286521 },
      { rank: 3, name: '整烫工序', value: 198432 },
      { rank: 4, name: '包装工序', value: 156789 },
      { rank: 5, name: '质检工序', value: 123456 },
      { rank: 6, name: '上领工序', value: 98765 },
      { rank: 7, name: '锁边工序', value: 76543 },
    ];
  };

  useEffect(() => {
    loadData();
  }, [timeRange, customRange, activeTab]);

  // 时间范围选择器
  const TimeRangeSelector = () => (
    <Space size={16} className={styles.timeSelector}>
      {(['today', 'week', 'month', 'year'] as TimeRangeType[]).map((range) => (
        <span
          key={range}
          className={`${styles.timeOption} ${timeRange === range ? styles.active : ''}`}
          onClick={() => setTimeRange(range)}
        >
          {{ today: '今日', week: '本周', month: '本月', year: '全年' }[range]}
        </span>
      ))}
      <RangePicker
        value={customRange}
        onChange={(dates) => {
          if (dates) {
            setCustomRange(dates as [dayjs.Dayjs, dayjs.Dayjs]);
            setTimeRange('custom');
          }
        }}
        format="YYYY-MM-DD"
        style={{ width: 240 }}
      />
    </Space>
  );

  // 变化指标渲染
  const renderChange = (value: number, suffix = '%') => {
    const isUp = value >= 0;
    return (
      <span className={isUp ? styles.changeUp : styles.changeDown}>
        {isUp ? <CaretUpOutlined /> : <CaretDownOutlined />}
        {Math.abs(value)}{suffix}
      </span>
    );
  };

  // 柱状图配置
  const chartConfig = {
    data: trendData,
    xField: 'month',
    yField: 'value',
    color: 'var(--primary-color)',
    columnStyle: {
      radius: [4, 4, 0, 0],
    },
    label: undefined,
    xAxis: {
      label: {
        style: { fill: '#8c8c8c', fontSize: "var(--font-size-xs)" },
      },
    },
    yAxis: {
      label: {
        style: { fill: '#8c8c8c', fontSize: "var(--font-size-xs)" },
        formatter: (v: string) => `${Number(v).toLocaleString()}`,
      },
    },
    tooltip: {
      formatter: (datum: TrendData) => ({
        name: activeTab === 'amount' ? '金额' : '数量',
        value: datum.value.toLocaleString(),
      }),
    },
  };

  return (
    <Layout>
      {showSmartErrorNotice && smartError ? (
        <Card size="small" style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => {
              void loadData();
            }}
          />
        </Card>
      ) : null}

      <Spin spinning={loading}>
        {/* 顶部统计卡片 */}
        <Row gutter={16} className={styles.statCards}>
          {/* 总金额 */}
          <Col span={6}>
            <Card className={styles.statCard}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>总金额</span>
                <Tooltip title="所选时间范围内的订单总金额">
                  <InfoCircleOutlined className={styles.infoIcon} />
                </Tooltip>
              </div>
              <Statistic
                value={statData.totalAmount}
                precision={0}
                prefix="¥"
                valueStyle={{ fontSize: 28, fontWeight: 600, color: 'var(--neutral-text)' }}
              />
              <div className={styles.cardFooter}>
                <span className={styles.subLabel}>周同比</span>
                {renderChange(statData.totalAmountChange)}
                <span className={styles.subLabel} style={{ marginLeft: 16 }}>日同比</span>
                {renderChange(statData.totalAmountDayChange)}
              </div>
              <div className={styles.dailyInfo}>
                <span className={styles.dailyLabel}>日金额</span>
                <span className={styles.dailyValue}>¥{statData.dailyAmount.toLocaleString()}</span>
              </div>
            </Card>
          </Col>

          {/* 入库数量 */}
          <Col span={6}>
            <Card className={styles.statCard}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>入库数量</span>
                <Tooltip title="所选时间范围内的成品入库总数">
                  <InfoCircleOutlined className={styles.infoIcon} />
                </Tooltip>
              </div>
              <Statistic
                value={statData.warehousedCount}
                valueStyle={{ fontSize: 28, fontWeight: 600, color: 'var(--neutral-text)' }}
              />
              <div className={styles.tinyChart}>
                {/* 迷你面积图占位 */}
                <div className={styles.miniAreaChart} />
              </div>
              <div className={styles.dailyInfo}>
                <span className={styles.dailyLabel}>日入库</span>
                <span className={styles.dailyValue}>{statData.warehousedDayCount.toLocaleString()}</span>
              </div>
            </Card>
          </Col>

          {/* 订单数量 */}
          <Col span={6}>
            <Card className={styles.statCard}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>订单数量</span>
                <Tooltip title="所选时间范围内的订单总数">
                  <InfoCircleOutlined className={styles.infoIcon} />
                </Tooltip>
              </div>
              <Statistic
                value={statData.orderCount}
                valueStyle={{ fontSize: 28, fontWeight: 600, color: 'var(--neutral-text)' }}
              />
              <div className={styles.tinyChart}>
                {/* 迷你柱状图占位 */}
                <div className={styles.miniBarChart} />
              </div>
              <div className={styles.dailyInfo}>
                <span className={styles.dailyLabel}>完成率</span>
                <span className={styles.dailyValue}>{statData.completionRate}%</span>
              </div>
            </Card>
          </Col>

          {/* 利润率 */}
          <Col span={6}>
            <Card className={styles.statCard}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>平均利润率</span>
                <Tooltip title="所选时间范围内的平均利润率">
                  <InfoCircleOutlined className={styles.infoIcon} />
                </Tooltip>
              </div>
              <Statistic
                value={statData.profitRate}
                suffix="%"
                valueStyle={{ fontSize: 28, fontWeight: 600, color: 'var(--neutral-text)' }}
              />
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${statData.profitRate}%` }} />
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.subLabel}>周同比</span>
                {renderChange(statData.profitRateChange)}
                <span className={styles.subLabel} style={{ marginLeft: 16 }}>日同比</span>
                {renderChange(statData.profitRateDayChange)}
              </div>
            </Card>
          </Col>
        </Row>

        {/* 图表区域 */}
        <Card className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <Tabs
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as 'amount' | 'count')}
              items={[
                { key: 'amount', label: '金额' },
                { key: 'count', label: '数量' },
              ]}
              className={styles.tabs}
            />
            <TimeRangeSelector />
          </div>

          <Row gutter={32}>
            {/* 趋势图 */}
            <Col span={16}>
              <div className={styles.trendSection}>
                <h4 className={styles.sectionTitle}>
                  {activeTab === 'amount' ? '金额趋势' : '数量趋势'}
                </h4>
                <div style={{ height: 300 }}>
                  <Column {...chartConfig} />
                </div>
              </div>
            </Col>

            {/* 排名列表 */}
            <Col span={8}>
              <div className={styles.rankSection}>
                <h4 className={styles.sectionTitle}>
                  {activeTab === 'amount' ? '工序成本排名' : '工序数量排名'}
                </h4>
                <div className={styles.rankList}>
                  {rankData.map((item) => (
                    <div key={item.rank} className={styles.rankItem}>
                      <span className={`${styles.rankNum} ${item.rank <= 3 ? styles.topRank : ''}`}>
                        {item.rank}
                      </span>
                      <span className={styles.rankName}>{item.name}</span>
                      <span className={styles.rankValue}>
                        {activeTab === 'amount' ? `¥${item.value.toLocaleString()}` : item.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Col>
          </Row>
        </Card>
      </Spin>
    </Layout>
  );
};

export default FinanceDashboard;
