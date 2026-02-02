import React, { useEffect, useState } from 'react';
import { Card, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import api from '@/utils/api';
import './styles.css';

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
      // 暂时使用虚拟数据
      const mockDates = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - 29 + i);
        return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      });

      // 演示数据：生成近30天的随机扫码统计（实际应调用真实API）
      const mockCounts = Array.from({ length: 30 }, () => Math.floor(Math.random() * 50) + 80);
      const mockQuantities = Array.from({ length: 30 }, () => Math.floor(Math.random() * 3000) + 5000);

      setData({
        dates: mockDates,
        scanCounts: mockCounts,
        scanQuantities: mockQuantities,
      });

      // TODO: 替换为真实API（从t_scan_record表聚合统计）
      // const result = await api.get<ChartData>('/api/dashboard/scan-count-chart');
      // if (result.success && result.data) {
      //   setData(result.data);
      // }
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
        color: 'var(--neutral-text)',
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
      data: ['扫菲次数', '扫菲数量'],
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
          color: 'var(--neutral-text-disabled)',
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
          color: 'var(--neutral-bg-light)',
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
          color: 'var(--primary-color-light)',
        },
        itemStyle: {
          color: 'var(--primary-color-light)',
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
      {
        name: '扫菲数量',
        type: 'line',
        smooth: true,
        data: data.scanQuantities,
        lineStyle: {
          width: 3,
          color: 'var(--warning-color)',
        },
        itemStyle: {
          color: 'var(--warning-color)',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 158, 11, 0.2)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0.02)' },
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
            <ReactECharts option={option} style={{ height: '250px' }} />
          ) : (
            <div className="empty-chart">暂无数据</div>
          )}
        </div>
      </Spin>
    </Card>
  );
};

export default ScanCountChart;
