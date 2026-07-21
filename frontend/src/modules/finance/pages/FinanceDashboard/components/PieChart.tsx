import React from 'react';
import styles from '../index.module.css';
import { PIE_COLORS } from '../helpers';

export interface PieChartItem {
  type: string;
  value: number;
}

interface PieChartProps {
  data: PieChartItem[];
}

const PieChart: React.FC<PieChartProps> = ({ data }) => {
  const total = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  if (total === 0) return <div className={styles.emptyChart}>暂无成本数据</div>;
  let currentAngle = 0;
  return (
    <div className={styles.pieChart}>
      <svg viewBox="0 0 100 100" className={styles.pieSvg}>
        {data.map((item, idx) => {
          const value = Number(item.value) || 0;
          if (value <= 0) return null;
          const angle = (value / total) * 360;
          const startAngle = currentAngle;
          currentAngle += angle;
          const startRad = (startAngle - 90) * (Math.PI / 180);
          const endRad = (currentAngle - 90) * (Math.PI / 180);
          const x1 = 50 + 40 * Math.cos(startRad);
          const y1 = 50 + 40 * Math.sin(startRad);
          const x2 = 50 + 40 * Math.cos(endRad);
          const y2 = 50 + 40 * Math.sin(endRad);
          const largeArcFlag = angle > 180 ? 1 : 0;
          const path = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
          return <path key={idx} d={path} fill={PIE_COLORS[idx % PIE_COLORS.length]} />;
        })}
        <circle cx="50" cy="50" r="25" fill="var(--color-bg-base)" />
      </svg>
      <div className={styles.pieLegend}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          总成本 ¥{total.toLocaleString()}
        </div>
        {data.map((item, idx) => {
          const value = Number(item.value) || 0;
          const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
          return (
            <div key={idx} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
              <span className={styles.legendText}>{item.type}</span>
              <span className={styles.legendValue}>¥{value.toLocaleString()} ({percent}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PieChart;
