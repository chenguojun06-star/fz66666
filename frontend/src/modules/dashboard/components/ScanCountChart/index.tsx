import React, { useEffect, useState } from 'react';
import { Card, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import api from '@/utils/api';
import './styles.css';

interface ChartData {
  dates: string[];
  scanCounts: number[];
}

const ScanCountChart: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChartData>({
    dates: [],
    scanCounts: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await api.get<ChartData>('/api/dashboard/scan-count-chart');
      if (result.success && result.data) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to load scan count chart:', error);
    } finally {
      setLoading(false);
    }
  };

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#ddd',
      borderWidth: 1,
      textStyle: {
        color: '#333',
        fontSize: 13,
      },
      formatter: (params: any) => {
        const date = params[0].axisValue;
        const value = params[0].value;
        return `
          <div style="padding: 4px 0;">
            <div style="font-weight: 600; margin-bottom: 4px;">${date}</div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${params[0].color};"></span>
              <span>扫菲次数：<strong>${value.toLocaleString()}</strong> 次</span>
            </div>
          </div>
        `;
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: 40,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.dates,
      axisLine: {
        lineStyle: {
          color: '#e0e0e0',
        },
      },
      axisLabel: {
        color: '#666',
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
        color: '#666',
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
          width: 3,
          color: '#8b5cf6',
        },
        itemStyle: {
          color: '#8b5cf6',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(139, 92, 246, 0.2)' },
              { offset: 1, color: 'rgba(139, 92, 246, 0.02)' },
            ],
          },
        },
      },
    ],
  };

  return (
    <Card 
      title="扫菲次数统计" 
      className="scan-count-chart-card"
      bordered={false}
    >
      <Spin spinning={loading}>
        <div className="chart-container">
          {data.dates.length > 0 ? (
            <ReactECharts option={option} style={{ height: '350px' }} />
          ) : (
            <div className="empty-chart">暂无数据</div>
          )}
        </div>
      </Spin>
    </Card>
  );
};

export default ScanCountChart;
