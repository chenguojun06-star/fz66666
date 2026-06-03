import React from 'react';
import { Button, Tooltip } from 'antd';
import { UnorderedListOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { PatternDevelopmentStats } from '@/types/production';

interface StyleStatsCardProps {
  stats: PatternDevelopmentStats | null;
  loading: boolean;
  /** 是否折叠，默认 false；折叠时仅显示标题栏 */
  collapsed?: boolean;
  /** 点击标题时的展开/折叠回调 */
  onToggle?: () => void;
  /** 点击查看明细时的回调 */
  onViewDetails?: () => void;
}

/**
 * 开发费用统计按钮（紧凑版，点击展开明细）
 * 日期选项已移至弹窗内部
 */
const StyleStatsCard: React.FC<StyleStatsCardProps> = ({
  stats,
  loading,
  collapsed = false,
  onToggle,
  onViewDetails,
}) => {
  const formatDuration = (seconds: number | undefined): string => {
    if (!seconds || seconds <= 0) return '-';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}天${hours}小时`;
    return `${hours}小时`;
  };

  if (collapsed) {
    return (
      <Tooltip title="点击查看开发费用统计">
        <Button
          type="primary"
          size="small"
          icon={<UnorderedListOutlined />}
          onClick={onToggle}
          loading={loading}
        >
          费用
        </Button>
      </Tooltip>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Tooltip title="点击查看明细">
        <Button
          type="primary"
          size="middle"
          icon={<UnorderedListOutlined />}
          onClick={onViewDetails}
          loading={loading}
        >
          开发费用
        </Button>
      </Tooltip>

      {stats?.totalDevelopmentTimeSeconds && stats.totalDevelopmentTimeSeconds > 0 && (
        <Tooltip title="开发周期">
          <Button
            type="text"
            size="middle"
            icon={<ClockCircleOutlined />}
            style={{
              background: 'rgba(102, 126, 234, 0.1)',
              border: '1px solid rgba(102, 126, 234, 0.2)',
              color: '#667eea',
            }}
          >
            <span style={{ fontSize: 13 }}>
              {formatDuration(stats.totalDevelopmentTimeSeconds)}
            </span>
          </Button>
        </Tooltip>
      )}
    </div>
  );
};

export default StyleStatsCard;
