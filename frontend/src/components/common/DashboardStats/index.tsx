import React from 'react';
import { Card, Col, Row, Statistic } from 'antd';

/**
 * 统计卡片配置
 */
export interface StatCardConfig {
  title: string;                    // 统计标题
  value: number;                    // 统计值
  precision?: number;               // 小数位数
  prefix?: React.ReactNode;         // 前缀（如 ¥）
  suffix?: React.ReactNode;         // 后缀（如 件、元）
  valueColor?: string;              // 数值颜色
  icon?: React.ReactNode;           // 图标
  loading?: boolean;                // 加载状态
}

/**
 * 通用数据看板统计卡片组
 * 用于展示多个统计数据
 */
interface DashboardStatsProps {
  /**
   * 统计卡片配置数组
   */
  stats: StatCardConfig[];

  /**
   * 每行显示的列数
   * @default 4
   */
  columns?: 2 | 3 | 4 | 6;

  /**
   * 卡片间距
   * @default 16
   */
  gutter?: number | [number, number];

  /**
   * 是否显示加载状态
   * @default false
   */
  loading?: boolean;

  /**
   * 自定义样式
   */
  style?: React.CSSProperties;

  /**
   * 自定义类名
   */
  className?: string;
}

/**
 * 通用数据看板统计组件
 *
 * @example
 * ```tsx
 * <DashboardStats
 *   columns={4}
 *   stats={[
 *     { title: '总订单', value: 1250, suffix: '个', valueColor: 'var(--color-info)' },
 *     { title: '总金额', value: 156800, prefix: '¥', precision: 2, valueColor: 'var(--color-success)' },
 *     { title: '待处理', value: 23, suffix: '个', valueColor: 'var(--color-warning)' },
 *     { title: '已完成', value: 1227, suffix: '个', valueColor: 'var(--color-success)' },
 *   ]}
 * />
 * ```
 */
const DashboardStats: React.FC<DashboardStatsProps> = ({
  stats,
  columns = 4,
  gutter = 16,
  loading = false,
  style,
  className,
}) => {
  const span = 24 / columns;

  return (
    <Row gutter={gutter} style={style} className={className}>
      {stats.map((stat, index) => (
        <Col span={span} key={index}>
          <Card
            loading={loading || stat.loading}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <Statistic
              title={<span style={{ fontSize: '12px' }}>{stat.title}</span>}
              value={stat.value}
              precision={stat.precision}
              prefix={stat.prefix}
              suffix={stat.suffix}
              valueStyle={{
                fontSize: '18px',
                lineHeight: '24px',
                color: stat.valueColor,
              }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

export default DashboardStats;
