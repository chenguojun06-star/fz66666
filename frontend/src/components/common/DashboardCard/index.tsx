import React from 'react';
import { Card, Empty, Spin } from 'antd';
import './styles.css';

/**
 * 数据卡片配置
 */
export interface DataCardConfig {
  title: string;                      // 卡片标题
  icon?: React.ReactNode;             // 标题图标
  extra?: React.ReactNode;            // 右侧操作区域
  loading?: boolean;                  // 加载状态
  size?: 'default' | 'small';         // 尺寸
  className?: string;                 // 自定义类名
  style?: React.CSSProperties;        // 卡片样式
  children?: React.ReactNode;         // 内容
}

/**
 * 通用数据卡片组件
 * 统一数据看板中各个卡片的样式和行为
 *
 * @example
 * ```tsx
 * <DashboardCard
 *   title="订单趋势"
 *
 *   extra={<Button size="small">查看详情</Button>}
 * >
 *   <Line data={chartData} />
 * </DashboardCard>
 * ```
 */
const DashboardCard: React.FC<DataCardConfig> = ({
  title,
  icon,
  extra,
  loading = false,
  size = 'default',
  className,
  style,
  children,
}) => {
  return (
    <Card
      title={
        <span className="dashboard-card-title">
          {icon && <span className="dashboard-card-icon">{icon}</span>}
          {title}
        </span>
      }
      extra={extra}
      loading={loading}
      variant="outlined"
      size={size}
      className={`dashboard-card ${className || ''}`}
      style={style}
      styles={{
        header: { background: '#fafafa', borderBottom: '1px solid #f0f0f0' },
        body: { padding: size === 'small' ? 12 : 24 },
      }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin />
        </div>
      ) : children ? (
        children
      ) : (
        <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Card>
  );
};

export default DashboardCard;
