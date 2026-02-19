import React from 'react';
import { Line } from '@ant-design/charts';
import { Empty, Spin } from 'antd';
import './styles.css';

interface LineChartDataPoint {
  date: string;
  value: number;
  type: string;
}

export interface DashboardLineChartProps {
  data: LineChartDataPoint[];
  loading?: boolean;
  height?: number;
  xField?: string;
  yField?: string;
  seriesField?: string;
  smooth?: boolean;
  areaStyle?: boolean;
  legend?: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
  color?: string[];
}

const DashboardLineChart: React.FC<DashboardLineChartProps> = ({
  data,
  loading = false,
  height = 400,
  xField = 'date',
  yField = 'value',
  seriesField = 'type',
  smooth = true,
  areaStyle = false,
  legend = true,
  xAxisLabel,
  yAxisLabel,
  color = ['var(--color-info)', 'var(--color-success)', '#722ed1'],
}) => {
  if (loading) {
    return (
      <div className="dashboard-line-chart-loading" style={{ height }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="dashboard-line-chart-empty" style={{ height }}>
        <Empty description="暂无数据" />
      </div>
    );
  }

  const config = {
    data,
    xField,
    yField,
    seriesField,
    height,
    smooth,
    color,
    legend: legend ? {
      position: 'top-right' as const,
      itemName: {
        style: {
          fill: '#666',
          fontSize: "var(--font-size-base)",
        },
      },
    } : false,
    xAxis: {
      label: {
        autoRotate: false,
        style: {
          fill: '#666',
          fontSize: "var(--font-size-xs)",
        },
      },
      title: xAxisLabel ? {
        text: xAxisLabel,
        style: {
          fontSize: "var(--font-size-sm)",
          fill: '#666',
        },
      } : undefined,
    },
    yAxis: {
      label: {
        formatter: (v: string) => {
          const num = Number(v);
          if (num >= 10000) {
            return `${(num / 10000).toFixed(1)}万`;
          }
          return v;
        },
        style: {
          fill: '#666',
          fontSize: "var(--font-size-xs)",
        },
      },
      title: yAxisLabel ? {
        text: yAxisLabel,
        style: {
          fontSize: "var(--font-size-sm)",
          fill: '#666',
        },
      } : undefined,
    },
    point: {
      size: 4,
      shape: 'circle',
      style: {
        fill: 'white',
        stroke: 'var(--color-info)',
        lineWidth: 2,
      },
    },
    tooltip: {
      showTitle: true,
      title: (title: string) => `📅 ${title}`,
      formatter: (datum: LineChartDataPoint) => {
        const value = datum.value || 0;
        let formattedValue = '';

        if (value >= 10000) {
          formattedValue = `${(value / 10000).toFixed(2)} 万件`;
        } else if (value >= 1000) {
          formattedValue = `${value.toLocaleString('zh-CN')} 件`;
        } else {
          formattedValue = `${value} 件`;
        }

        return {
          name: datum.type,
          value: formattedValue,
        };
      },
      domStyles: {
        'g2-tooltip': {
          padding: '12px',
          background: 'rgba(255, 255, 255, 0.98)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          minWidth: '220px',
        },
        'g2-tooltip-title': {
          fontSize: '14px',
          fontWeight: '600',
          color: '#262626',
          marginBottom: '10px',
          paddingBottom: '8px',
          borderBottom: '2px solid #f0f0f0',
        },
        'g2-tooltip-list-item': {
          margin: '8px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        'g2-tooltip-name': {
          fontSize: '13px',
          color: '#595959',
        },
        'g2-tooltip-value': {
          fontSize: '15px',
          fontWeight: '700',
          color: '#262626',
          marginLeft: '20px',
        },
      },
    },
    ...(areaStyle ? {
      area: {
        style: {
          fillOpacity: 0.15,
        },
      },
    } : {}),
    animation: {
      appear: {
        animation: 'path-in',
        duration: 1000,
      },
    },
  };

  return (
    <div className="dashboard-line-chart">
      <Line {...config} />
    </div>
  );
};

export default DashboardLineChart;
