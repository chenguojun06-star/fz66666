import React from 'react';
import styles from '../index.module.css';

export interface TrendChartItem {
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}

interface TrendChartProps {
  data: TrendChartItem[];
}

// 趋势柱图：叠加显示营收（蓝）与成本（橙）
const TrendChart: React.FC<TrendChartProps> = ({ data }) => {
  if (!data.length) return <div className={styles.emptyChart}>暂无数据</div>;
  const max = Math.max(...data.flatMap(d => [d.revenue, d.cost]), 1);
  return (
    <div className={styles.barChart} style={{ height: 'auto', padding: '12px 0' }}>
      {data.map((item, idx) => (
        <div key={idx} className={styles.barItem} style={{ height: 28, marginBottom: 4 }}>
          <div className={styles.barLabel}>{item.label}</div>
          <div className={styles.barContainer} style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${(item.revenue / max) * 100}%`,
                background: 'linear-gradient(90deg, #1890ff, #40a9ff)',
                borderRadius: 4,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                height: '40%',
                width: `${(item.cost / max) * 100}%`,
                background: '#ffa940',
                borderRadius: 4,
                opacity: 0.85,
              }}
            />
          </div>
          <div className={styles.barValue} style={{ width: 110 }}>
            ¥{item.revenue.toLocaleString()} / -¥{item.cost.toLocaleString()}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1890ff', marginRight: 4, borderRadius: 2 }} />营收
        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#ffa940', margin: '0 4px 0 12px', borderRadius: 2 }} />成本
      </div>
    </div>
  );
};

export default TrendChart;
