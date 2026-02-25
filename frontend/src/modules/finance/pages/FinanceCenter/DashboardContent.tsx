import React, { useState, useEffect } from 'react';
import { Card, Row, Col, DatePicker, Tooltip, Spin, Space, Select } from 'antd';
import { InfoCircleOutlined, CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import { Line } from '@ant-design/charts';
import { StatsGrid } from '@/components/common/StatsGrid';
import api from '@/utils/api';
import dayjs from 'dayjs';
import styles from './index.module.css';

const { RangePicker } = DatePicker;
const { Option } = Select;

// 统计卡片数据接口
interface StatCardData {
  totalAmount: number;
  totalAmountChange: number; // 对比变化
  prevTotalAmount: number;   // 上期总金额

  warehousedCount: number;
  warehousedChange: number;
  warehousedTrend: number[];
  prevWarehousedCount: number; // 上期入库数量

  orderCount: number;
  orderChange: number;
  prevOrderCount: number;      // 上期订单数量

  defectCount: number;
  defectChange: number;
  defectRate: number;
  orderTrend: number[];
  prevDefectCount: number;     // 上期次品数量

  profitRate: number;
  profitRateChange: number;

  materialCost: number;      // 面辅料总价
  productionCost: number;    // 生产总价
  totalProfit: number;       // 利润
}

// 趋势数据
interface TrendData {
  time: string;
  value: number;
  type: string;
}

// 排名数据
interface RankData {
  rank: number;
  name: string;
  value: number;
}

// 成品结算数据
interface SettlementRow {
  orderId: string;
  orderNo: string;
  status: string;
  factoryId: string;
  factoryName: string;
  warehousedQuantity: number;
  defectQuantity: number;
  totalAmount: number;
  profit: number;
  profitMargin: number;
  productionCost: number;
  materialCost: number;
  createTime: string;
}

// 日/周/月/年 时间范围类型
type TimeRangeType = 'day' | 'week' | 'month' | 'year' | 'custom';

// 工厂数据接口
interface Factory {
  id: string;
  factoryName: string;
}

const DashboardContent: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRangeType>('month');
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // 筛选条件
  const [selectedFactory, setSelectedFactory] = useState<string | undefined>(undefined); // 工厂筛选（单选）
  const [factories, setFactories] = useState<Factory[]>([]);

  const [statData, setStatData] = useState<StatCardData>({
    totalAmount: 0,
    totalAmountChange: 0,
    prevTotalAmount: 0,
    warehousedCount: 0,
    warehousedChange: 0,
    warehousedTrend: [],
    prevWarehousedCount: 0,
    orderCount: 0,
    orderChange: 0,
    prevOrderCount: 0,
    defectCount: 0,
    defectChange: 0,
    defectRate: 0,
    orderTrend: [],
    prevDefectCount: 0,
    profitRate: 0,
    profitRateChange: 0,
    materialCost: 0,
    productionCost: 0,
    totalProfit: 0,
  });

  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [rankData, setRankData] = useState<RankData[]>([]);

  // 获取时间范围对比文字
  const getCompareLabel = () => {
    switch (timeRange) {
      case 'day': return '较昨日';
      case 'week': return '较上周';
      case 'month': return '较上月';
      case 'year': return '较去年';
      default: return '对比';
    }
  };

  // 加载工厂列表
  const loadFactories = async () => {
    try {
      const response = await api.get<{ code: number; data: { records: Factory[] } }>('/system/factory/list', {
        params: { page: 1, pageSize: 1000 }
      });
      if (response.code === 200) {
        setFactories(response.data.records || []);
      }
    } catch (error) {
      console.error('加载工厂列表失败:', error);
      setFactories([]);
    }
  };



  // 初始化加载工厂列表
  useEffect(() => {
    loadFactories();
  }, []);

  // 加载真实数据
  const loadData = async () => {
    setLoading(true);
    try {
      const today = dayjs();
      let startDate: string, endDate: string;
      let prevStartDate: string, prevEndDate: string;

      switch (timeRange) {
        case 'day':
          startDate = endDate = today.format('YYYY-MM-DD');
          prevStartDate = prevEndDate = today.subtract(1, 'day').format('YYYY-MM-DD');
          break;
        case 'week':
          startDate = today.startOf('week').format('YYYY-MM-DD');
          endDate = today.endOf('week').format('YYYY-MM-DD');
          prevStartDate = today.subtract(1, 'week').startOf('week').format('YYYY-MM-DD');
          prevEndDate = today.subtract(1, 'week').endOf('week').format('YYYY-MM-DD');
          break;
        case 'month':
          startDate = today.startOf('month').format('YYYY-MM-DD');
          endDate = today.endOf('month').format('YYYY-MM-DD');
          prevStartDate = today.subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
          prevEndDate = today.subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
          break;
        case 'year':
          startDate = today.startOf('year').format('YYYY-MM-DD');
          endDate = today.endOf('year').format('YYYY-MM-DD');
          prevStartDate = today.subtract(1, 'year').startOf('year').format('YYYY-MM-DD');
          prevEndDate = today.subtract(1, 'year').endOf('year').format('YYYY-MM-DD');
          break;
        case 'custom':
          if (customRange) {
            startDate = customRange[0].format('YYYY-MM-DD');
            endDate = customRange[1].format('YYYY-MM-DD');
            const diff = customRange[1].diff(customRange[0], 'day');
            prevStartDate = customRange[0].subtract(diff + 1, 'day').format('YYYY-MM-DD');
            prevEndDate = customRange[0].subtract(1, 'day').format('YYYY-MM-DD');
          } else {
            startDate = today.startOf('month').format('YYYY-MM-DD');
            endDate = today.endOf('month').format('YYYY-MM-DD');
            prevStartDate = today.subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
            prevEndDate = today.subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
          }
          break;
      }

      // 构建查询参数
      const queryParams: any = { page: 1, pageSize: 1000, startDate, endDate };
      // 添加工厂筛选
      if (selectedFactory) {
        queryParams.factoryId = selectedFactory;
      }

      // 获取当前周期数据
      const response = await api.get('/finance/finished-settlement/list', {
        params: queryParams
      });
      let records: SettlementRow[] = response.data?.records || [];

      // 前端按工厂筛选（因为后端Controller暂不支持factoryId参数）
      if (selectedFactory) {
        records = records.filter(r => r.factoryId === selectedFactory);
      }

      // 获取上一周期数据
      const prevQueryParams: any = { page: 1, pageSize: 1000, startDate: prevStartDate, endDate: prevEndDate };
      if (selectedFactory) {
        prevQueryParams.factoryId = selectedFactory;
      }

      const prevResponse = await api.get('/finance/finished-settlement/list', {
        params: prevQueryParams
      });
      let prevRecords: SettlementRow[] = prevResponse.data?.records || [];

      // 前端按工厂筛选
      if (selectedFactory) {
        prevRecords = prevRecords.filter(r => r.factoryId === selectedFactory);
      }

      // 计算当前周期统计
      const totalAmount = records.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
      const warehousedCount = records.reduce((sum, r) => sum + (r.warehousedQuantity || 0), 0);
      const defectCount = records.reduce((sum, r) => sum + (r.defectQuantity || 0), 0);
      const orderCount = records.length;
      const totalProfit = records.reduce((sum, r) => sum + (r.profit || 0), 0);
      const profitRate = totalAmount > 0 ? (totalProfit / totalAmount) * 100 : 0;
      const defectRate = warehousedCount > 0 ? (defectCount / warehousedCount) * 100 : 0;
      const materialCost = records.reduce((sum, r) => sum + (r.materialCost || 0), 0);
      const productionCost = records.reduce((sum, r) => sum + (r.productionCost || 0), 0);

      // 计算上一周期统计
      const prevTotalAmount = prevRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
      const prevWarehousedCount = prevRecords.reduce((sum, r) => sum + (r.warehousedQuantity || 0), 0);
      const prevDefectCount = prevRecords.reduce((sum, r) => sum + (r.defectQuantity || 0), 0);
      const prevOrderCount = prevRecords.length;
      const prevTotalProfit = prevRecords.reduce((sum, r) => sum + (r.profit || 0), 0);
      const prevProfitRate = prevTotalAmount > 0 ? (prevTotalProfit / prevTotalAmount) * 100 : 0;

      // 计算变化率
      const calcChange = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : 0;

      // 生成趋势数据
      const warehousedTrend: number[] = [];
      const orderTrend: number[] = [];
      const trendPoints: TrendData[] = [];

      // 根据时间范围生成趋势点
      if (timeRange === 'day') {
        // 按小时聚合
        for (let i = 0; i < 24; i++) {
          const hour = `${i}时`;
          const hourRecords = records.filter(r => r.createTime && dayjs(r.createTime).hour() === i);
          const amountVal = hourRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
          const countVal = hourRecords.reduce((sum, r) => sum + (r.warehousedQuantity || 0), 0);
          trendPoints.push({ time: hour, value: amountVal, type: '金额' });
          trendPoints.push({ time: hour, value: countVal, type: '入库数量' });
          warehousedTrend.push(countVal);
          orderTrend.push(hourRecords.length);
        }
      } else if (timeRange === 'week') {
        // 按天聚合
        for (let i = 0; i < 7; i++) {
          const date = today.startOf('week').add(i, 'day');
          const dayLabel = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.day()];
          const dayRecords = records.filter(r => r.createTime && dayjs(r.createTime).format('YYYY-MM-DD') === date.format('YYYY-MM-DD'));
          const amountVal = dayRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
          const countVal = dayRecords.reduce((sum, r) => sum + (r.warehousedQuantity || 0), 0);
          trendPoints.push({ time: dayLabel, value: amountVal, type: '金额' });
          trendPoints.push({ time: dayLabel, value: countVal, type: '入库数量' });
          warehousedTrend.push(countVal);
          orderTrend.push(dayRecords.length);
        }
      } else if (timeRange === 'month') {
        // 按天聚合（当月每天）
        const daysInMonth = today.daysInMonth();
        for (let i = 1; i <= daysInMonth; i++) {
          const date = today.startOf('month').add(i - 1, 'day');
          const dayLabel = `${i}日`;
          const dayRecords = records.filter(r => r.createTime && dayjs(r.createTime).format('YYYY-MM-DD') === date.format('YYYY-MM-DD'));
          const amountVal = dayRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
          const countVal = dayRecords.reduce((sum, r) => sum + (r.warehousedQuantity || 0), 0);
          trendPoints.push({ time: dayLabel, value: amountVal, type: '金额' });
          trendPoints.push({ time: dayLabel, value: countVal, type: '入库数量' });
          warehousedTrend.push(countVal);
          orderTrend.push(dayRecords.length);
        }
      } else {
        // 年度按月聚合
        const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        months.forEach((month, idx) => {
          const monthRecords = records.filter(r => r.createTime && dayjs(r.createTime).month() === idx);
          const amountVal = monthRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
          const countVal = monthRecords.reduce((sum, r) => sum + (r.warehousedQuantity || 0), 0);
          trendPoints.push({ time: month, value: amountVal, type: '金额' });
          trendPoints.push({ time: month, value: countVal, type: '入库数量' });
          warehousedTrend.push(countVal);
          orderTrend.push(monthRecords.length);
        });
      }

      setStatData({
        totalAmount,
        totalAmountChange: calcChange(totalAmount, prevTotalAmount),
        prevTotalAmount,
        warehousedCount,
        warehousedChange: calcChange(warehousedCount, prevWarehousedCount),
        warehousedTrend,
        prevWarehousedCount,
        orderCount,
        orderChange: calcChange(orderCount, prevOrderCount),
        prevOrderCount,
        defectCount,
        defectChange: calcChange(defectCount, prevDefectCount),
        defectRate,
        orderTrend,
        prevDefectCount,
        profitRate,
        profitRateChange: calcChange(profitRate, prevProfitRate),
        materialCost,
        productionCost,
        totalProfit,
      });

      setTrendData(trendPoints);

      // 工厂总金额排名
      const factoryMap: Record<string, number> = {};

      records.forEach(r => {
        const factoryName = r.factoryName || '未知工厂';
        const amount = r.totalAmount || 0;
        if (!factoryMap[factoryName]) {
          factoryMap[factoryName] = 0;
        }
        factoryMap[factoryName] += amount;
      });

      const rank = Object.entries(factoryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10) // 只显示前10名
        .map(([name, value], index) => ({
          rank: index + 1,
          name,
          value: Math.round(value),
        }));
      setRankData(rank);

    } catch (error) {
      console.error('加载数据失败:', error);
      setStatData({
        totalAmount: 0, totalAmountChange: 0, prevTotalAmount: 0,
        warehousedCount: 0, warehousedChange: 0, warehousedTrend: [0,0,0,0,0,0,0], prevWarehousedCount: 0,
        orderCount: 0, orderChange: 0, prevOrderCount: 0,
        defectCount: 0, defectChange: 0, defectRate: 0, orderTrend: [0,0,0,0,0,0,0], prevDefectCount: 0,
        profitRate: 0, profitRateChange: 0,
        materialCost: 0, productionCost: 0, totalProfit: 0,
      });
      setTrendData([]);
      setRankData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeRange, customRange, selectedFactory]);

  // 时间范围选择器
  const TimeRangeSelector = () => (
    <Space size={8} className={styles.timeSelector}>
      {(['day', 'week', 'month', 'year'] as TimeRangeType[]).map((range) => (
        <span
          key={range}
          className={`${styles.timeOption} ${timeRange === range ? styles.active : ''}`}
          onClick={() => setTimeRange(range)}
        >
          {{ day: '日', week: '周', month: '月', year: '年' }[range]}
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
        size="small"
        style={{ width: 200 }}
      />
    </Space>
  );

  // 变化百分比渲染（显示具体数值和百分比）
  const renderChange = (value: number, currentValue: number, prevValue: number, isMoney: boolean = false) => {
    const isUp = value >= 0;
    const diff = currentValue - prevValue;
    const diffText = isMoney
      ? `¥${Math.abs(diff).toLocaleString()}`
      : Math.abs(diff).toLocaleString();

    return (
      <span className={isUp ? styles.changeUp : styles.changeDown}>
        {isUp ? <CaretUpOutlined /> : <CaretDownOutlined />}
        {Math.abs(value).toFixed(1)}% ({isUp ? '+' : '-'}{diffText})
      </span>
    );
  };

  // 迷你柱状图数据（用 CSS 渲染）
  const renderMiniBar = (data: number[], color: string = 'var(--primary-color)') => {
    const max = Math.max(...data, 1);
    return (
      <div className={styles.miniBarContainer}>
        {data.map((val, idx) => (
          <div
            key={idx}
            className={styles.miniBarItem}
            style={{
              height: `${(val / max) * 100}%`,
              backgroundColor: color,
            }}
          />
        ))}
      </div>
    );
  };

  // 折线图配置
  const lineChartConfig = {
    data: trendData,
    xField: 'time',
    yField: 'value',
    seriesField: 'type',
    smooth: true,
    animation: { appear: { animation: 'path-in', duration: 1000 } },
    color: ['var(--primary-color)', 'var(--color-success)'],
    lineStyle: { lineWidth: 2 },
    point: { size: 3, shape: 'circle' },
    legend: { position: 'top-right' as const },
    xAxis: { label: { style: { fill: '#8c8c8c', fontSize: "var(--font-size-xs)" } } },
    yAxis: {
      label: {
        style: { fill: '#8c8c8c', fontSize: "var(--font-size-xs)" },
        formatter: (v: string) => {
          const num = Number(v);
          if (num >= 10000) return `${(num / 10000).toFixed(0)}万`;
          return num.toLocaleString();
        },
      },
    },
    tooltip: {
      formatter: (datum: TrendData) => ({
        name: datum.type,
        value: datum.type === '金额' ? `¥${datum.value.toLocaleString()}` : datum.value.toLocaleString(),
      }),
    },
  };

  return (
    <Spin spinning={loading}>
      {/* 顶部筛选区域：时间范围 + 工厂选择 */}
      <div className={styles.periodSelector}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <TimeRangeSelector />
          <Select
            placeholder="选择工厂（全局筛选）"
            allowClear
            style={{ width: 220 }}
            value={selectedFactory}
            onChange={setSelectedFactory}
            showSearch
            optionFilterProp="children"
          >
            {factories.map((factory) => (
              <Option key={factory.id} value={factory.id}>
                {factory.factoryName}
              </Option>
            ))}
          </Select>
        </div>
      </div>

      {/* 顶部统计卡片 - 等高布局 */}
      <Row gutter={12} className={styles.statCards}>
        {/* 总金额 */}
        <Col span={6}>
          <Card className={styles.statCard} size="small">
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>总金额</span>
              <Tooltip title="所选时间范围内的订单总金额">
                <InfoCircleOutlined className={styles.infoIcon} />
              </Tooltip>
            </div>
            <div className={styles.statValue}>¥{statData.totalAmount.toLocaleString()}</div>
            <div className={styles.tinyChart}>
              {renderMiniBar(statData.warehousedTrend, '#36cfc9')}
            </div>
            <div className={styles.compareRow}>
              <span className={styles.subLabel}>{getCompareLabel()}</span>
              {renderChange(statData.totalAmountChange, statData.totalAmount, statData.prevTotalAmount, true)}
            </div>
          </Card>
        </Col>

        {/* 入库数量 */}
        <Col span={6}>
          <Card className={styles.statCard} size="small">
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>入库数量</span>
              <Tooltip title="所选时间范围内的成品入库总数">
                <InfoCircleOutlined className={styles.infoIcon} />
              </Tooltip>
            </div>
            <div className={styles.statValue}>{statData.warehousedCount.toLocaleString()}</div>
            <div className={styles.tinyChart}>
              {renderMiniBar(statData.warehousedTrend, '#975FE4')}
            </div>
            <div className={styles.compareRow}>
              <span className={styles.subLabel}>{getCompareLabel()}</span>
              {renderChange(statData.warehousedChange, statData.warehousedCount, statData.prevWarehousedCount)}
            </div>
          </Card>
        </Col>

        {/* 订单数量 */}
        <Col span={6}>
          <Card className={styles.statCard} size="small">
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>订单数量</span>
              <Tooltip title="所选时间范围内的订单总数">
                <InfoCircleOutlined className={styles.infoIcon} />
              </Tooltip>
            </div>
            <div className={styles.statValue}>{statData.orderCount.toLocaleString()}</div>
            <div className={styles.tinyChart}>
              {renderMiniBar(statData.orderTrend, '#597ef7')}
            </div>
            <div className={styles.compareRow}>
              <span className={styles.subLabel}>{getCompareLabel()}</span>
              {renderChange(statData.orderChange, statData.orderCount, statData.prevOrderCount)}
            </div>
          </Card>
        </Col>

        {/* 次品数量 */}
        <Col span={6}>
          <Card className={styles.statCard} size="small">
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>次品数量</span>
              <Tooltip title="所选时间范围内的次品总数">
                <InfoCircleOutlined className={styles.infoIcon} />
              </Tooltip>
            </div>
            <div className={styles.statValue} style={{ color: statData.defectCount > 0 ? 'var(--color-danger)' : 'var(--neutral-text)' }}>
              {statData.defectCount.toLocaleString()}
            </div>
            <div className={styles.tinyChart}>
              <div className={styles.defectInfo}>
                <span className={styles.defectLabel}>次品率</span>
                <span className={styles.defectValue} style={{ color: statData.defectRate > 5 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {statData.defectRate.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className={styles.compareRow}>
              <span className={styles.subLabel}>{getCompareLabel()}</span>
              {renderChange(statData.defectChange, statData.defectCount, statData.prevDefectCount)}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 图表区域 */}
      <Card className={styles.chartCard} size="small">
        {/* 图表上方汇总统计 - 使用通用StatsGrid组件 */}
        <div className={styles.chartSummary}>
          <StatsGrid
            items={[
              { key: 'totalAmount', title: '总金额', value: statData.totalAmount, prefix: '¥', precision: 2 },
              { key: 'orderCount', title: '订单数量', value: statData.orderCount, suffix: '单' },
              { key: 'warehousedCount', title: '入库数量', value: statData.warehousedCount, suffix: '件' },
              { key: 'materialCost', title: '面辅料总价', value: statData.materialCost, prefix: '¥', precision: 2 },
              { key: 'productionCost', title: '生产总价', value: statData.productionCost, prefix: '¥', precision: 2 },
              {
                key: 'profitRate',
                title: '利润率',
                value: statData.profitRate,
                precision: 1,
                suffix: '%',
                valueStyle: statData.profitRate >= 0 ? { color: 'var(--color-success)' } : { color: 'var(--color-danger)' }
              },
              {
                key: 'totalProfit',
                title: '利润',
                value: statData.totalProfit,
                prefix: '¥',
                precision: 2,
                valueStyle: statData.totalProfit >= 0 ? { color: 'var(--color-success)' } : { color: 'var(--color-danger)' }
              },
            ]}
            columns={7}
            gutter={16}
          />
        </div>

        <div className={styles.chartHeader}>
          <h4 className={styles.sectionTitle}>趋势分析</h4>
        </div>

        <Row gutter={16}>
          <Col span={16}>
            <div className={styles.trendSection}>
              <div style={{ height: 260 }}>
                <Line {...lineChartConfig} />
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div className={styles.rankSection}>
              <h4 className={styles.sectionTitle}>工厂总金额排名</h4>
              <div className={styles.rankList}>
                {rankData.map((item) => (
                  <div key={item.rank} className={styles.rankItem}>
                    <span className={`${styles.rankNum} ${item.rank <= 3 ? styles.topRank : ''}`}>
                      {item.rank}
                    </span>
                    <span className={styles.rankName}>{item.name}</span>
                    <span className={styles.rankValue}>
                      ¥{item.value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Col>
        </Row>
      </Card>
    </Spin>
  );
};

export default DashboardContent;
