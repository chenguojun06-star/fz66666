import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Card, Row, Col, DatePicker, Tooltip, Spin, Space, Select } from 'antd';
import { InfoCircleOutlined, CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';

const ReactECharts = lazy(() => import('echarts-for-react'));
import api from '@/utils/api';
import dayjs from 'dayjs';
import styles from './index.module.css';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { HealthIndexResponse } from '@/services/intelligence/intelligenceApi';

const { RangePicker } = DatePicker;

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

interface EChartData {
  dates: string[];
  amounts: number[];
  warehoused: number[];
  orders: number[];
  defects: number[];
}

const DashboardContent: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRangeType>('month');
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  // ─────── 系统健康指数 ───────
  const [healthData, setHealthData] = useState<HealthIndexResponse | null>(null);
  const [healthCollapsed, setHealthCollapsed] = useState(false);
  const healthFetched = useRef(false);

  useEffect(() => {
    if (healthFetched.current) return;
    healthFetched.current = true;
    intelligenceApi.getHealthIndex()
      .then(res => { setHealthData((res as any)?.data ?? (res as any) ?? null); })
      .catch(() => {});
  }, []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

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

  const [chartData, setChartData] = useState<EChartData>({
    dates: [],
    amounts: [],
    warehoused: [],
    orders: [],
    defects: [],
  });
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

  // 加载工厂列表 (调用组织架构接口以获取内部和外部工厂)
  const loadFactories = async () => {
    try {
      const response = await api.get<{ code: number; data: any[] }>('/system/organization/tree');
      // 注意：有些后端的封装返回可能没有 code=200 这一层，直接是数组或者 data
      const resData = (response as any).data || response;
      const treeNodes = Array.isArray(resData) ? resData : (resData?.data || []);
      
      if (treeNodes && treeNodes.length > 0) {
        // 递归展平树结构，筛选所有的生产相关组和工厂
        const flattenTree = (nodes: any[]): Factory[] => {
          let result: Factory[] = [];
          nodes.forEach(node => {
            // 将工厂和生产相关的部门都纳入筛选范围
            // 后端返回的可能是 nodeName 或 unitName，注意不能取 id 当名字
            const name = node.unitName || node.nodeName || node.name || '';
            
            // 只有当名字有效且不是一段纯哈希/ID（通常长度大于20）时，才加入列表
            if (name && name.length < 30) {
              if (node.nodeType === 'FACTORY' || node.ownerType === 'EXTERNAL' || name.includes('生产') || name.includes('车间')) {
                result.push({
                  id: node.id,
                  factoryName: name
                } as Factory);
              }
            }
            if (node.children && node.children.length > 0) {
              result = result.concat(flattenTree(node.children));
            }
          });
          return result;
        };
        const formattedFactories = flattenTree(treeNodes);
        
        // 去重（避免有同名的或重复推入）
        const uniqueFactories = Array.from(new Map(formattedFactories.map(item => [item.id, item])).values());
        setFactories(uniqueFactories);
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


      // 获取上一周期数据
      const prevQueryParams: any = { page: 1, pageSize: 1000, startDate: prevStartDate, endDate: prevEndDate };
      if (selectedFactory) {
        prevQueryParams.factoryId = selectedFactory;
      }

      const prevResponse = await api.get('/finance/finished-settlement/list', {
        params: prevQueryParams
      });
      let prevRecords: SettlementRow[] = prevResponse.data?.records || [];

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
      
      const dates: string[] = [];
      const amounts: number[] = [];
      const warehoused: number[] = [];
      const orders: number[] = [];
      const defects: number[] = [];

      // 根据时间范围生成趋势点
      if (timeRange === 'day') {
        // 按小时聚合
        for (let i = 0; i < 24; i++) {
          const hour = `${i}时`;
          const hourRecords = records.filter(r => r.createTime && dayjs(r.createTime).hour() === i);
          const amountVal = hourRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
          const countVal = hourRecords.reduce((sum, r) => sum + (r.warehousedQuantity || 0), 0);
          const orderVal = hourRecords.length;
          const defectVal = hourRecords.reduce((sum, r) => sum + (r.defectQuantity || 0), 0);
          
          dates.push(hour);
          amounts.push(amountVal);
          warehoused.push(countVal);
          orders.push(orderVal);
          defects.push(defectVal);
          warehousedTrend.push(countVal);
          orderTrend.push(orderVal);
        }
      } else if (timeRange === 'week') {
        // 按天聚合
        for (let i = 0; i < 7; i++) {
          const date = today.startOf('week').add(i, 'day');
          const dayLabel = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.day()];
          const dayRecords = records.filter(r => r.createTime && dayjs(r.createTime).format('YYYY-MM-DD') === date.format('YYYY-MM-DD'));
          const amountVal = dayRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
          const countVal = dayRecords.reduce((sum, r) => sum + (r.warehousedQuantity || 0), 0);
          const orderVal = dayRecords.length;
          const defectVal = dayRecords.reduce((sum, r) => sum + (r.defectQuantity || 0), 0);

          dates.push(dayLabel);
          amounts.push(amountVal);
          warehoused.push(countVal);
          orders.push(orderVal);
          defects.push(defectVal);
          warehousedTrend.push(countVal);
          orderTrend.push(orderVal);
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
          const orderVal = dayRecords.length;
          const defectVal = dayRecords.reduce((sum, r) => sum + (r.defectQuantity || 0), 0);

          dates.push(dayLabel);
          amounts.push(amountVal);
          warehoused.push(countVal);
          orders.push(orderVal);
          defects.push(defectVal);
          warehousedTrend.push(countVal);
          orderTrend.push(orderVal);
        }
      } else {
        // 年度按月聚合
        const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        months.forEach((month, idx) => {
          const monthRecords = records.filter(r => r.createTime && dayjs(r.createTime).month() === idx);
          const amountVal = monthRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
          const countVal = monthRecords.reduce((sum, r) => sum + (r.warehousedQuantity || 0), 0);
          const orderVal = monthRecords.length;
          const defectVal = monthRecords.reduce((sum, r) => sum + (r.defectQuantity || 0), 0);

          dates.push(month);
          amounts.push(amountVal);
          warehoused.push(countVal);
          orders.push(orderVal);
          defects.push(defectVal);
          warehousedTrend.push(countVal);
          orderTrend.push(orderVal);
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

      setChartData({ dates, amounts, warehoused, orders, defects });

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
      if (showSmartErrorNotice) setSmartError(null);

    } catch (error) {
      console.error('加载数据失败:', error);
      reportSmartError('财务中心看板加载失败', '网络异常或服务不可用，请稍后重试', 'FIN_CENTER_DASHBOARD_LOAD_FAILED');
      setStatData({
        totalAmount: 0, totalAmountChange: 0, prevTotalAmount: 0,
        warehousedCount: 0, warehousedChange: 0, warehousedTrend: [0,0,0,0,0,0,0], prevWarehousedCount: 0,
        orderCount: 0, orderChange: 0, prevOrderCount: 0,
        defectCount: 0, defectChange: 0, defectRate: 0, orderTrend: [0,0,0,0,0,0,0], prevDefectCount: 0,
        profitRate: 0, profitRateChange: 0,
        materialCost: 0, productionCost: 0, totalProfit: 0,
      });
      setChartData({ dates: [], amounts: [], warehoused: [], orders: [], defects: [] });
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

  // ECharts 图表配置
  const chartOption = {
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: '#fff',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#1a1a1a' },
    },
    legend: {
      data: ['总金额', '入库数量', '订单数量', '次品数量'],
      top: 0,
      textStyle: { fontSize: 13, color: '#666' },
    },
    grid: { left: '2%', right: '2%', bottom: '5%', top: 40, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: chartData.dates,
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#999', fontSize: 12 },
    },
    yAxis: [
      {
        type: 'value',
        name: '金额 (¥)',
        position: 'left',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#999', fontSize: 12 },
        splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      },
      {
        type: 'value',
        name: '数量',
        position: 'right',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#999', fontSize: 12 },
        splitLine: { show: false },
      }
    ],
    series: [
      {
        name: '总金额',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        data: chartData.amounts,
        lineStyle: { width: 2, color: '#36cfc9' },
        itemStyle: { color: '#36cfc9' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(54, 207, 201, 0.3)' },
              { offset: 1, color: 'rgba(54, 207, 201, 0.05)' }
            ]
          }
        }
      },
      {
        name: '入库数量',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: chartData.warehoused,
        lineStyle: { width: 2, color: '#975FE4' },
        itemStyle: { color: '#975FE4' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(151, 95, 228, 0.3)' },
              { offset: 1, color: 'rgba(151, 95, 228, 0.05)' }
            ]
          }
        }
      },
      {
        name: '订单数量',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: chartData.orders,
        lineStyle: { width: 2, color: '#597ef7' },
        itemStyle: { color: '#597ef7' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(89, 126, 247, 0.3)' },
              { offset: 1, color: 'rgba(89, 126, 247, 0.05)' }
            ]
          }
        }
      },
      {
        name: '次品数量',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: chartData.defects,
        lineStyle: { width: 2, color: '#ff4d4f' },
        itemStyle: { color: '#ff4d4f' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(255, 77, 79, 0.3)' },
              { offset: 1, color: 'rgba(255, 77, 79, 0.05)' }
            ]
          }
        }
      }
    ]
  };

  return (
    <Spin spinning={loading}>
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

      {/*  系统健康指数 */}
      {healthData && (
        <Card
          size="small"
          style={{ marginBottom: 12 }}
          title={
            <span>
              <span style={{ fontSize: 14, marginRight: 6 }}></span>
              <span style={{ fontWeight: 600 }}>系统健康指数</span>
              <span style={{
                marginLeft: 10, fontSize: 20, fontWeight: 700,
                color: healthData.healthIndex >= 80 ? '#52c41a'
                  : healthData.healthIndex >= 60 ? '#fa8c16' : '#ff4d4f',
              }}>
                {healthData.healthIndex}
              </span>
              <span style={{
                marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 11,
                background: healthData.grade === 'A' ? '#f6ffed' : healthData.grade === 'B' ? '#fffbe6' : '#fff2f0',
                color: healthData.grade === 'A' ? '#52c41a' : healthData.grade === 'B' ? '#fa8c16' : '#ff4d4f',
                border: `1px solid ${healthData.grade === 'A' ? '#b7eb8f' : healthData.grade === 'B' ? '#ffe58f' : '#ffa39e'}`,
              }}>
                {healthData.grade}级
              </span>
            </span>
          }
          extra={
            <Tooltip title={healthCollapsed ? '展开' : '收起'}>
              <span
                style={{ cursor: 'pointer', color: '#999', fontSize: 12 }}
                onClick={() => setHealthCollapsed(!healthCollapsed)}
              >
                {healthCollapsed ? '展开' : '收起'}
              </span>
            </Tooltip>
          }
        >
          {!healthCollapsed && (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
                {([
                  { label: '交期', key: 'deliveryScore' as const },
                  { label: '质量', key: 'qualityScore' as const },
                  { label: '效率', key: 'efficiencyScore' as const },
                  { label: '产能', key: 'capacityScore' as const },
                  { label: '成本', key: 'costScore' as const },
                ] as const).map(({ label, key }) => {
                  const score = healthData[key] as number;
                  const color = score >= 80 ? '#52c41a' : score >= 60 ? '#fa8c16' : '#ff4d4f';
                  return (
                    <span key={key} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#999' }}>{label}</span>
                      <span style={{ color, fontWeight: 600 }}>{score}</span>
                    </span>
                  );
                })}
              </div>
              {healthData.topRisk && (
                <div style={{ color: '#ff4d4f', fontSize: 11, marginBottom: 4 }}>
                   首要风险：{healthData.topRisk}
                </div>
              )}
              {healthData.suggestion && (
                <div style={{ color: '#666', fontSize: 11 }}>
                   {healthData.suggestion}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* 顶部筛选区域：时间范围 + 工厂选择 */}
      <div className={styles.periodSelector} style={{ marginBottom: 16 }}>
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
              <Select.Option key={factory.id} value={factory.id}>
                {factory.factoryName}
              </Select.Option>
            ))}
          </Select>
        </div>
      </div>

      {/* 顶部统计卡片合并展示 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: '8px', boxShadow: '0 1px 2px -2px rgba(0, 0, 0, 0.08), 0 3px 6px 0 rgba(0, 0, 0, 0.06), 0 5px 12px 4px rgba(0, 0, 0, 0.04)' }}>
        <Row gutter={24} style={{ padding: '16px 16px 24px 16px' }}>
          <Col span={18}>
            <div style={{ display: 'flex', gap: '24px', paddingBottom: '24px', marginBottom: '24px' }}>
              <div style={{ flex: 1, padding: '16px', background: 'var(--background-secondary)', borderRadius: '8px' }}>
                <div style={{ color: 'var(--neutral-text-secondary)', marginBottom: 8, fontSize: 14 }}>
                  总金额
                  <Tooltip title="所选时间范围内的订单总金额"><InfoCircleOutlined style={{ marginLeft: 6 }} /></Tooltip>
                </div>
                <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--primary-color)' }}>¥{statData.totalAmount.toLocaleString()}</div>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <span style={{ color: '#8c8c8c', marginRight: 8 }}>{getCompareLabel()}</span>
                  {renderChange(statData.totalAmountChange, statData.totalAmount, statData.prevTotalAmount, true)}
                </div>
              </div>
              <div style={{ flex: 1, padding: '16px', background: 'var(--background-secondary)', borderRadius: '8px' }}>
                <div style={{ color: 'var(--neutral-text-secondary)', marginBottom: 8, fontSize: 14 }}>
                  入库数量
                  <Tooltip title="所选时间范围内的成品入库总数"><InfoCircleOutlined style={{ marginLeft: 6 }} /></Tooltip>
                </div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{statData.warehousedCount.toLocaleString()}</div>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <span style={{ color: '#8c8c8c', marginRight: 8 }}>{getCompareLabel()}</span>
                  {renderChange(statData.warehousedChange, statData.warehousedCount, statData.prevWarehousedCount)}
                </div>
              </div>
              <div style={{ flex: 1, padding: '16px', background: 'var(--background-secondary)', borderRadius: '8px' }}>
                <div style={{ color: 'var(--neutral-text-secondary)', marginBottom: 8, fontSize: 14 }}>
                  订单数量
                  <Tooltip title="所选时间范围内的订单总数"><InfoCircleOutlined style={{ marginLeft: 6 }} /></Tooltip>
                </div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{statData.orderCount.toLocaleString()}</div>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <span style={{ color: '#8c8c8c', marginRight: 8 }}>{getCompareLabel()}</span>
                  {renderChange(statData.orderChange, statData.orderCount, statData.prevOrderCount)}
                </div>
              </div>
              <div style={{ flex: 1, position: 'relative', padding: '16px', background: 'var(--background-secondary)', borderRadius: '8px' }}>
                <div style={{ color: 'var(--neutral-text-secondary)', marginBottom: 8, fontSize: 14 }}>
                  次品数量
                  <Tooltip title="所选时间范围内的次品总数"><InfoCircleOutlined style={{ marginLeft: 6 }} /></Tooltip>
                </div>
                <div style={{ fontSize: 24, fontWeight: 600, color: statData.defectCount > 0 ? 'var(--color-danger)' : 'inherit' }}>{statData.defectCount.toLocaleString()}</div>
                <div style={{ marginTop: 8, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ color: '#8c8c8c', marginRight: 8 }}>{getCompareLabel()}</span>
                    {renderChange(statData.defectChange, statData.defectCount, statData.prevDefectCount)}
                  </div>
                  <div style={{ color: statData.defectRate > 5 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    次品率 {statData.defectRate.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
            
            <Suspense fallback={<div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>}>
              <ReactECharts option={chartOption} style={{ height: 350, width: '100%' }} />
            </Suspense>
          </Col>
          
          <Col span={6}>
            <div className={styles.rankSection} style={{ marginTop: 0, height: '100%', paddingTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4 className={styles.sectionTitle} style={{ margin: 0 }}>工厂总金额排名</h4>
              </div>
              <div className={styles.rankList} style={{ maxHeight: 440, overflowY: 'auto' }}>
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

      {/* 财务明细数据 */}
      <Card className={styles.chartCard} size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '12px', background: 'var(--background-secondary)', padding: '16px', borderRadius: '8px', overflowX: 'auto' }}>
          <div style={{ flex: 1, minWidth: 120, background: '#fff', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 13, marginBottom: 4 }}>总金额</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--primary-color)' }}>¥{statData.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div style={{ flex: 1, minWidth: 100, background: '#fff', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 13, marginBottom: 4 }}>订单数量</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{statData.orderCount.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>单</span></div>
          </div>
          <div style={{ flex: 1, minWidth: 100, background: '#fff', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 13, marginBottom: 4 }}>入库数量</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{statData.warehousedCount.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>件</span></div>
          </div>
          <div style={{ flex: 1, minWidth: 120, background: '#fff', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 13, marginBottom: 4 }}>面辅料总价</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>¥{statData.materialCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div style={{ flex: 1, minWidth: 120, background: '#fff', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 13, marginBottom: 4 }}>生产总价</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>¥{statData.productionCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div style={{ flex: 1, minWidth: 120, background: '#fff', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 13, marginBottom: 4 }}>利润</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: statData.totalProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              ¥{statData.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 100, background: '#fff', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 13, marginBottom: 4 }}>利润率</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: statData.profitRate >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {statData.profitRate.toFixed(1)}%
            </div>
          </div>
        </div>
      </Card>
    </Spin>
  );
};

export default DashboardContent;
