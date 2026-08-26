import React, { Suspense, lazy } from 'react';

const ReactECharts = lazy(() => import('echarts-for-react'));

export interface TrendChartItem {
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}

interface TrendChartProps {
  data: TrendChartItem[];
}

// D-142：与首页/现金流趋势统一的 ECharts 平滑线条风格（原 CSS 叠条已废弃）
const TrendChart: React.FC<TrendChartProps> = ({ data }) => {
  if (!data.length) return <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)', fontSize: 14 }}>暂无数据</div>;

  const option = {
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'var(--color-bg-base)',
      borderColor: 'var(--color-border)',
      borderWidth: 1,
      textStyle: { color: 'var(--color-text-primary)' },
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        const label = params[0].axisValue;
        let html = `<div style="padding: 4px 0; font-weight: 600; color: var(--color-text-primary);">${label}</div>`;
        params.forEach((item: any) => {
          const value = Number(item.value ?? 0);
          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 2px 0;">
              <span style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${item.color};"></span>
                <span style="color: var(--color-text-primary);">${item.seriesName}</span>
              </span>
              <span style="font-weight: 600; color: var(--color-text-primary);">¥${value.toLocaleString()}</span>
            </div>
          `;
        });
        return html;
      },
    },
    legend: {
      data: ['营收', '成本'],
      top: 5,
      textStyle: { fontSize: 13, color: '#6b7280' },
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
      data: data.map(d => d.label),
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#9ca3af', fontSize: 12 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#9ca3af',
        fontSize: 12,
        formatter: (value: number) => {
          if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`;
          return value.toLocaleString();
        },
      },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [
      {
        name: '营收',
        type: 'line',
        smooth: true,
        data: data.map(d => d.revenue),
        lineStyle: { width: 2, color: '#52c41a' },
        itemStyle: { color: '#52c41a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82, 196, 26, 0.22)' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.02)' },
            ],
          },
        },
      },
      {
        name: '成本',
        type: 'line',
        smooth: true,
        data: data.map(d => d.cost),
        lineStyle: { width: 2, color: '#f59e0b' },
        itemStyle: { color: '#f59e0b' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 158, 11, 0.18)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0.02)' },
            ],
          },
        },
      },
    ],
  };

  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)', fontSize: 14 }}>图表加载中...</div>}>
      <ReactECharts option={option} style={{ height: 260 }} />
    </Suspense>
  );
};

export default TrendChart;
