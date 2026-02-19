import React from 'react';
import { Row, Col } from 'antd';
import StatCard from './StatCard';

export interface StatItem {
  /** 唯一标识 */
  key: string;
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
  /** 点击事件 */
  onClick?: () => void;
  /** 数值样式（将传递给Statistic的styles.value） */
  valueStyle?: React.CSSProperties;
  /** 前缀文本 */
  prefix?: React.ReactNode;
}

interface StatsGridProps {
  /** 统计项列表 */
  items: StatItem[];
  /** 列数 (2/3/4/7) */
  columns?: 2 | 3 | 4 | 7;
  /** 是否加载中 */
  loading?: boolean;
  /** 栅格间距 */
  gutter?: number | [number, number];
  /** 自定义类名 */
  className?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 响应式配置 */
  responsive?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
    xxl?: number;
  };
}

/**
 * 统计卡片网格组件
 * 用于展示多个统计数据卡片，支持响应式布局
 *
 * @example
 * ```tsx
 * const statsItems = [
 *   { key: 'total', title: '总数', value: 100, icon: <UserOutlined /> },
 *   { key: 'active', title: '活跃', value: 80 },
 * ];
 *
 * <StatsGrid items={statsItems} columns={3} />
 * ```
 */
export const StatsGrid: React.FC<StatsGridProps> = ({
  items,
  columns = 3,
  loading = false,
  gutter = 16,
  className,
  style,
  responsive,
}) => {
  // 计算每列占据的栅格数
  const colSpan = 24 / columns;

  // 默认响应式配置
  const defaultResponsive = responsive || {
    xs: 24, // 手机：1列
    sm: 12, // 平板竖屏：2列
    md: colSpan, // 平板横屏及以上：按columns配置
  };

  return (
    <Row gutter={gutter} className={className} style={style}>
      {items.map((item) => (
        <Col {...defaultResponsive} key={item.key}>
          <StatCard
            title={item.title}
            value={item.value}
            icon={item.icon}
            suffix={item.suffix}
            precision={item.precision}
            loading={loading}
            onClick={item.onClick}
            valueStyle={item.valueStyle}
            prefix={item.prefix}
          />
        </Col>
      ))}
    </Row>
  );
};

export default StatsGrid;
