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
      // 暂时使用虚拟数据
      const mockDates = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - 29 + i);
        return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      });

      const mockOrderQuantities = Array.from({ length: 30 }, () => Math.floor(Math.random() * 2000) + 3000);
      const mockCuttingQuantities = Array.from({ length: 30 }, () => Math.floor(Math.random() * 1800) + 2500);

      setData({
        dates: mockDates,
        orderQuantities: mockOrderQuantities,
        cuttingQuantities: mockCuttingQuantities,
      });

      // 演示数据：用于展示图表效果
      // 生产环境可替换为真实API：
      // const result = await api.get<ChartData>('/api/dashboard/order-cutting-chart');
      // if (result.success && result.data) {
      //   setData(result.data);
      // }
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
        color: 'var(--neutral-text)',
        fontSize: 13,
      },
      formatter: (params: any) => {
        const date = params[0].axisValue;
        let html = `<div style="padding: 4px 0; font-weight: 600;">${date}</div>`;
        params.forEach((item: any) => {
          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 2px 0;">
              <span style="display: flex; align-items: center; gap: 8px;">
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
      top: 5,
      textStyle: {
        fontSize: 13,
        color: 'var(--neutral-text-secondary)',
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
          color: 'var(--neutral-border)',
        },
      },
      axisLabel: {
        color: 'var(--neutral-text-secondary)',
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
        color: 'var(--neutral-text-secondary)',
        fontSize: 12,
        formatter: (value: number) => value.toLocaleString(),
      },
      splitLine: {
        lineStyle: {
          color: 'var(--neutral-border)',
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
          color: '#6366f1', // 紫色
        },
        itemStyle: {
          color: '#6366f1',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(99, 102, 241, 0.3)' },
              { offset: 1, color: 'rgba(99, 102, 241, 0.05)' },
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
          color: '#f59e0b', // 橙色
        },
        itemStyle: {
          color: '#f59e0b',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 158, 11, 0.3)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0.05)' },
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
      variant="borderless"
    >
      <Spin spinning={loading}>
        <div className="chart-container">
          {data.dates.length > 0 ? (
            <ReactECharts option={option} style={{ height: '250px' }} />
          ) : (
            <div className="empty-chart">暂无数据</div>
          )}
        </div>
      </Spin>
    </Card>
  );
};

export default OrderCuttingChart;
