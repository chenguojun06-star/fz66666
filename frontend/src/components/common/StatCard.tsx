import React from 'react';
import { Card, Statistic } from 'antd';
import type { StatisticProps } from 'antd';

interface StatCardProps {
  /** 标题 */
  title: string;
  /** 数值 */
  value: number | string;
  /** 前缀图标 */
  icon?: React.ReactNode;
  /** 后缀 */
  suffix?: React.ReactNode;
  /** 精度（小数位数） */
  precision?: number;
  /** 是否加载中 */
  loading?: boolean;
  /** 点击事件 */
  onClick?: () => void;
  /** 自定义类名 */
  className?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 数值样式（使用styles.content代替） */
  valueStyle?: React.CSSProperties;
  /** 前缀文本 */
  prefix?: React.ReactNode;
  /** 自定义格式化函数 */
  formatter?: StatisticProps['formatter'];
}

/**
 * 统计卡片组件
 * 用于展示单个统计数据，包含标题、数值、图标等
 */
export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  suffix,
  precision,
  loading = false,
  onClick,
  className,
  style,
  valueStyle,
  prefix,
  formatter,
}) => {
  const cardStyle: React.CSSProperties = {
    cursor: onClick ? 'pointer' : 'default',
    transition: 'all 0.3s ease',
    ...style,
  };

  const hoverStyle = onClick
    ? {
        ':hover': {
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          transform: 'translateY(-2px)',
        },
      } as React.CSSProperties
    : {};

  return (
    <Card
      className={className}
      style={{ ...cardStyle, ...hoverStyle }}
      onClick={onClick}
      hoverable={!!onClick}
    >
      <Statistic
        title={title}
        value={value}
        prefix={prefix || icon}
        suffix={suffix}
        precision={precision}
        loading={loading}
        styles={valueStyle ? { content: valueStyle } : undefined}
        formatter={formatter}
      />
    </Card>
  );
};

export default StatCard;
