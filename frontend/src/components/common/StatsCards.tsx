import React from 'react';

export interface StatCard {
  label: string;
  value: number | string;
  color: string;
  onClick?: () => void;
  formatter?: (value: number | string) => string;
}

interface StatsCardsProps {
  stats: StatCard[];
  minWidth?: number;
}

/**
 * 通用统计卡片组件
 * 用于显示页面顶部的数据概览（订单数、总数量、延期数等）
 */
const StatsCards: React.FC<StatsCardsProps> = ({ stats, minWidth = 120 }) => {
  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      marginBottom: '12px',
      flexWrap: 'wrap'
    }}>
      {stats.map((stat, index) => {
        const isClickable = !!stat.onClick;
        const displayValue = stat.formatter
          ? stat.formatter(stat.value)
          : typeof stat.value === 'number'
            ? stat.value.toLocaleString()
            : stat.value;

        return (
          <div
            key={index}
            onClick={stat.onClick}
            style={{
              flex: `1 1 ${minWidth}px`,
              minWidth: `${minWidth}px`,
              padding: '6px 12px',
              background: '#fff',
              border: '1px solid #e8e8e8',
              borderRadius: '6px',
              cursor: isClickable ? 'pointer' : 'default',
              transition: 'all 0.2s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}
            onMouseEnter={isClickable ? (e) => {
              e.currentTarget.style.borderColor = stat.color;
              e.currentTarget.style.boxShadow = `0 2px 8px ${stat.color}26`;
            } : undefined}
            onMouseLeave={isClickable ? (e) => {
              e.currentTarget.style.borderColor = '#e8e8e8';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
            } : undefined}
          >
            <div style={{ fontSize: '12px', color: '#999', marginBottom: '2px' }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: stat.color }}>
              {displayValue}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsCards;
