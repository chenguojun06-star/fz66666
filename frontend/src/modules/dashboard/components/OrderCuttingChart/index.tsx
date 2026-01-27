import React, { useEffect, useState } from 'react';
import { Card, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import api from '@/utils/api';
import './styles.css';

interface ChartData {
  dates: string[];
  orderQuantities: number[];
  cuttingQuantities: number[];
}

const OrderCuttingChart: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChartData>({
    dates: [],
    orderQuantities: [],
    cuttingQuantities: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await api.get<ChartData>('/api/dashboard/order-cutting-chart');
      if (result.success && result.data) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to load order cutting chart:', error);
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
        let html = `<div style="padding: 4px 0; font-weight: 600;">${date}</div>`;
        params.forEach((item: any) => {
          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 2px 0;">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${item.color};"></span>
                <span>${item.seriesName}</span>
              </span>
              <span style="font-weight: 600;">${item.value.toLocaleString()}</span>
            </div>
          `;
        });
        return html;
      },
    },
    legend: {
      data: ['下单数量', '裁剪数量'],
      top: 10,
      textStyle: {
        fontSize: 13,
        color: '#666',
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: 60,
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
        name: '下单数量',
        type: 'line',
        smooth: true,
        data: data.orderQuantities,
        lineStyle: {
          width: 3,
          color: '#3b82f6',
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
              { offset: 0, color: 'rgba(59, 130, 246, 0.2)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.02)' },
            ],
          },
        },
      },
      {
        name: '裁剪数量',
        type: 'line',
        smooth: true,
        data: data.cuttingQuantities,
        lineStyle: {
          width: 3,
          color: '#10b981',
        },
        itemStyle: {
          color: '#10b981',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.2)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.02)' },
            ],
          },
        },
      },
    ],
  };

  return (
    <Card 
      title="下单数量 vs 裁剪数量" 
      className="order-cutting-chart-card"
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

export default OrderCuttingChart;
