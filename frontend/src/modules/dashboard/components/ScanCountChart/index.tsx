import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Card, Spin } from 'antd';
import api from '@/utils/api';
import './styles.css';

const ReactECharts = lazy(() => import('echarts-for-react'));

interface ChartData {
  dates: string[];
  scanCounts: number[];
  scanQuantities: number[];
}

const ScanCountChart: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChartData>({
    dates: [],
    scanCounts: [],
    scanQuantities: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 调用真实API（从t_scan_record表聚合统计）
      const result = await api.get('/dashboard/scan-count-chart');
      // axios拦截器返回的是完整的Result对象：{ code: 200, data: {...} }
      if (result && result.code === 200 && result.data) {
        setData({
          dates: result.data.dates || [],
          scanCounts: result.data.scanCounts || [],
          scanQuantities: result.data.scanQuantities || [],
        });
      } else {
        // API失败时使用空数据
        // API returned no data structure, using empty data
        const mockDates = Array.from({ length: 30 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - 29 + i);
          return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        });
        setData({
          dates: mockDates,
          scanCounts: Array(30).fill(0),
          scanQuantities: Array(30).fill(0),
        });
      }
    } catch (error) {
      console.error('Failed to load scan count chart:', error);
      // API调用失败时使用空数据
      const mockDates = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - 29 + i);
        return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      });
      setData({
        dates: mockDates,
        scanCounts: Array(30).fill(0),
        scanQuantities: Array(30).fill(0),
      });
    } finally {
      setLoading(false);
    }
  };

  const option = {
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: '#fff',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: {
        color: '#1a1a1a',
      },
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        const date = params[0].axisValue;
        let html = `<div style="padding: 4px 0; font-weight: 600; color: #1a1a1a;">${date}</div>`;
        params.forEach((item: any) => {
          const value = item.value !== undefined && item.value !== null ? item.value : 0;
          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 2px 0;">
              <span style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${item.color};"></span>
                <span style="color: #1a1a1a;">${item.seriesName}</span>
              </span>
              <span style="font-weight: 600; color: #1a1a1a;">${value.toLocaleString()}</span>
            </div>
          `;
        });
        return html;
      },
    },
    legend: {
      data: ['扫菲次数', '扫菲数量'],
      top: 5,
      textStyle: {
        fontSize: 13,
        color: '#666',
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
      data: data.dates,
      axisLine: {
        lineStyle: {
          color: '#e5e7eb',
        },
      },
      axisLabel: {
        color: '#999',
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
        color: '#999',
        fontSize: 12,
        formatter: (value: number) => value.toLocaleString(),
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0',
        },
      },
    },
    series: [
      {
        name: '扫菲次数',
        type: 'line',
        smooth: true,
        data: data.scanCounts,
        lineStyle: {
          width: 2,
          color: '#3b82f6', // 蓝色
        },
        itemStyle: {
          color: '#3b82f6',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.05)' },
            ],
          },
        },
      },
      {
        name: '扫菲数量',
        type: 'line',
        smooth: true,
        data: data.scanQuantities,
        lineStyle: {
          width: 2,
          color: '#f97316', // 橙色
        },
        itemStyle: {
          color: '#f97316',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(249, 115, 22, 0.3)' },
              { offset: 1, color: 'rgba(249, 115, 22, 0.05)' },
            ],
          },
        },
      },
    ],
  };

  return (
    <Card
      title="扫菲次数 vs 扫菲数量"
      className="scan-count-chart-card"
      variant="borderless"
    >
      <Spin spinning={loading}>
        <div className="chart-container">
          {data.dates.length > 0 ? (
            <Suspense fallback={<div className="empty-chart">图表加载中...</div>}>
              <ReactECharts option={option} style={{ height: '250px' }} />
            </Suspense>
          ) : (
            <div className="empty-chart">暂无数据</div>
          )}
        </div>
      </Spin>
    </Card>
  );
};

export default ScanCountChart;
