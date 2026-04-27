import React, { useMemo } from 'react';
import { Card, Row, Col, DatePicker, Tooltip, Spin, Space, Select } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, InfoCircleOutlined, WarningOutlined, CheckCircleOutlined, DashboardOutlined } from '@ant-design/icons';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import dayjs, { Dayjs } from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import type { TimeRangeType, EChartData, RankData } from './dashboardTypes';
import { getCompareLabel } from './dashboardUtils';
import { useDashboardData } from './hooks/useDashboardData';
import './FinanceCenter.css';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer]);

const { RangePicker } = DatePicker;

const renderChange = (change: number, prefix = '') => {
  if (change === 0) return <span style={{ color: '#999', fontSize: 12 }}>{prefix}持平</span>;
  const isUp = change > 0;
  return <span style={{ color: isUp ? '#52c41a' : '#ff4d4f', fontSize: 12 }}>{prefix}{isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(change).toFixed(1)}%</span>;
};

const DashboardContent: React.FC = () => {
  const { loading, timeRange, setTimeRange, customRange, setCustomRange, selectedFactory, setSelectedFactory, factories, statData, chartData, rankData, smartError, healthData, healthCollapsed, setHealthCollapsed, loadData } = useDashboardData();

  const chartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['总金额', '入库数量', '订单数量', '次品数量'], bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { type: 'category', data: chartData.dates, boundaryGap: false },
    yAxis: [
      { type: 'value', name: '金额(元)', position: 'left', axisLabel: { formatter: (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v) } },
      { type: 'value', name: '数量', position: 'right' },
    ],
    series: [
      { name: '总金额', type: 'line', smooth: true, data: chartData.amounts, yAxisIndex: 0, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(24,144,255,0.3)' }, { offset: 1, color: 'rgba(24,144,255,0.02)' }]) }, itemStyle: { color: '#1890ff' } },
      { name: '入库数量', type: 'line', smooth: true, data: chartData.inboundQuantities, yAxisIndex: 1, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(82,196,26,0.3)' }, { offset: 1, color: 'rgba(82,196,26,0.02)' }]) }, itemStyle: { color: '#52c41a' } },
      { name: '订单数量', type: 'line', smooth: true, data: chartData.orderCounts, yAxisIndex: 1, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(250,173,20,0.3)' }, { offset: 1, color: 'rgba(250,173,20,0.02)' }]) }, itemStyle: { color: '#faad14' } },
      { name: '次品数量', type: 'line', smooth: true, data: chartData.defectQuantities, yAxisIndex: 1, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(255,77,79,0.3)' }, { offset: 1, color: 'rgba(255,77,79,0.02)' }]) }, itemStyle: { color: '#ff4d4f' } },
    ],
  }), [chartData]);

  const compareLabel = getCompareLabel(timeRange);

  return (
    <Spin spinning={loading}>
      {smartError && <Card size="small" style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={loadData} /></Card>}
      {healthData && !healthCollapsed && (
        <Card size="small" style={{ marginBottom: 12, background: 'linear-gradient(135deg, #f0f5ff 0%, #e6f7ff 100%)', border: '1px solid #bae7ff' }}
          title={<span><DashboardOutlined /> 系统健康指数 <b style={{ fontSize: 20, color: healthData.score >= 80 ? '#52c41a' : healthData.score >= 60 ? '#faad14' : '#ff4d4f' }}>{healthData.score}</b> 分</span>}
          extra={<a onClick={() => setHealthCollapsed(true)}>收起</a>}>
          <Row gutter={16}>
            <Col span={4}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: healthData.score >= 80 ? '#52c41a' : healthData.score >= 60 ? '#faad14' : '#ff4d4f' }}>{healthData.score >= 80 ? 'A' : healthData.score >= 60 ? 'B' : 'C'}</div><div style={{ fontSize: 12, color: '#999' }}>等级</div></div></Col>
            {healthData.subScores?.map((sub: any, i: number) => <Col key={i} span={4}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 16, fontWeight: 600, color: sub.score >= 80 ? '#52c41a' : sub.score >= 60 ? '#faad14' : '#ff4d4f' }}>{sub.score}</div><div style={{ fontSize: 12, color: '#999' }}>{sub.name}</div></div></Col>)}
            <Col span={4}>{healthData.topRisk && <div><Tooltip title={healthData.topRisk.detail}><span style={{ color: '#ff4d4f' }}><WarningOutlined /> {healthData.topRisk.name}</span></Tooltip></div>}{healthData.suggestion && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}><CheckCircleOutlined /> {healthData.suggestion}</div>}</Col>
          </Row>
        </Card>
      )}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              {(['day', 'week', 'month', 'year'] as TimeRangeType[]).map(r => (
                <span key={r} onClick={() => setTimeRange(r)} style={{ cursor: 'pointer', padding: '4px 12px', borderRadius: 4, background: timeRange === r ? '#1890ff' : '#f0f0f0', color: timeRange === r ? '#fff' : '#333', fontWeight: timeRange === r ? 600 : 400 }}>{r === 'day' ? '日' : r === 'week' ? '周' : r === 'month' ? '月' : '年'}</span>
              ))}
              <RangePicker value={customRange as any} onChange={(dates) => { if (dates && dates[0] && dates[1]) { setCustomRange([dates[0] as Dayjs, dates[1] as Dayjs]); setTimeRange('custom'); } }} style={{ width: 240 }} />
            </Space>
          </Col>
          <Col><Select style={{ width: 180 }} placeholder="全部工厂" allowClear value={selectedFactory || undefined} onChange={setSelectedFactory} options={factories.map(f => ({ value: f.id, label: f.factoryName }))} /></Col>
        </Row>
      </Card>
      <Row gutter={16}>
        <Col span={18}>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>总金额</div><div style={{ fontSize: 20, fontWeight: 700 }}>¥{(statData.totalAmount || 0).toLocaleString()}</div>{renderChange(statData.totalAmountChange, compareLabel)}</Card></Col>
            <Col span={6}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>入库数量</div><div style={{ fontSize: 20, fontWeight: 700 }}>{(statData.inboundQuantity || 0).toLocaleString()}</div>{renderChange(statData.inboundQuantityChange, compareLabel)}</Card></Col>
            <Col span={6}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>订单数量</div><div style={{ fontSize: 20, fontWeight: 700 }}>{statData.orderCount || 0}</div>{renderChange(statData.orderCountChange, compareLabel)}</Card></Col>
            <Col span={6}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>次品数量</div><div style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>{statData.defectQuantity || 0}</div>{renderChange(statData.defectQuantityChange, compareLabel)}</Card></Col>
          </Row>
          <Card size="small" title="趋势分析"><ReactEChartsCore echarts={echarts} option={chartOption} style={{ height: 320 }} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small" title="工厂金额排名 Top 10" style={{ height: '100%' }}>
            {rankData.length > 0 ? rankData.map(r => (
              <div key={r.rank} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span><b style={{ color: r.rank <= 3 ? '#1890ff' : '#999', marginRight: 8 }}>{r.rank}</b>{r.name}</span>
                <span style={{ fontWeight: 600 }}>¥{r.value.toLocaleString()}</span>
              </div>
            )) : <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无数据</div>}
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={4}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>总金额</div><div style={{ fontSize: 16, fontWeight: 700 }}>¥{(statData.totalAmount || 0).toLocaleString()}</div></Card></Col>
        <Col span={4}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>订单数量</div><div style={{ fontSize: 16, fontWeight: 700 }}>{statData.orderCount || 0}</div></Card></Col>
        <Col span={4}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>入库数量</div><div style={{ fontSize: 16, fontWeight: 700 }}>{(statData.inboundQuantity || 0).toLocaleString()}</div></Card></Col>
        <Col span={4}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>面辅料总价</div><div style={{ fontSize: 16, fontWeight: 700 }}>¥{(statData.materialCost || 0).toLocaleString()}</div></Card></Col>
        <Col span={4}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>生产总价</div><div style={{ fontSize: 16, fontWeight: 700 }}>¥{(statData.productionCost || 0).toLocaleString()}</div></Card></Col>
        <Col span={2}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>利润</div><div style={{ fontSize: 16, fontWeight: 700, color: (statData.profit || 0) >= 0 ? '#52c41a' : '#ff4d4f' }}>¥{(statData.profit || 0).toLocaleString()}</div></Card></Col>
        <Col span={2}><Card size="small"><div style={{ fontSize: 12, color: '#999' }}>利润率</div><div style={{ fontSize: 16, fontWeight: 700, color: (statData.profitRate || 0) >= 0 ? '#52c41a' : '#ff4d4f' }}>{statData.profitRate || 0}%</div></Card></Col>
      </Row>
    </Spin>
  );
};

export default DashboardContent;
