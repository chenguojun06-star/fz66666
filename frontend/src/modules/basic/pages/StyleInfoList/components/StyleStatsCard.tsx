import React from 'react';
import { Card, Segmented, Spin } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import type { PatternDevelopmentStats } from '@/types/production';
import type { StatsRangeType } from '../../StyleInfo/hooks/useStyleStats';

interface StyleStatsCardProps {
  stats: PatternDevelopmentStats | null;
  loading: boolean;
  rangeType: StatsRangeType;
  onRangeChange: (value: string | number) => void;
  /** 是否折叠，默认 false；折叠时仅显示标题栏 */
  collapsed?: boolean;
  /** 点击标题时的展开/折叠回调 */
  onToggle?: () => void;
}

const fmt = (v: number) => v.toFixed(2);

/**
 * 开发费用统计迷你看板（紧凑单行版，支持折叠）
 * collapsed=true 时仅显示标题栏，点击可展开
 */
const StyleStatsCard: React.FC<StyleStatsCardProps> = ({
  stats,
  loading,
  rangeType,
  onRangeChange,
  collapsed = false,
  onToggle,
}) => {
  const cardBase = {
    size: 'small' as const,
    className: 'development-stats-card mb-sm',
    styles: { body: { padding: '6px 12px' } },
    style: { background: '#f8f9fa', border: '1px solid #e9ecef' },
  };

  /* 折叠状态：只渲染标题行 */
  if (collapsed) {
    return (
      <Card {...cardBase}>
        <span
          onClick={onToggle}
          style={{
            fontSize: 12, fontWeight: 600, color: 'var(--neutral-text)',
            whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <RightOutlined style={{ fontSize: 10 }} />
          开发费用统计
        </span>
      </Card>
    );
  }

  /* 展开状态：完整费用看板 */
  return (
    <Card {...cardBase}>
      <Spin spinning={loading}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'nowrap' }}>
          {/* 标题（点击折叠） */}
          <span
            onClick={onToggle}
            style={{
              fontSize: 12, fontWeight: 600, color: 'var(--neutral-text)',
              whiteSpace: 'nowrap', marginRight: 16,
              cursor: onToggle ? 'pointer' : 'default',
              userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <DownOutlined style={{ fontSize: 10 }} />
            开发费用统计
          </span>

          {/* 数据条目 */}
          <div style={{ display: 'flex', flex: 1, gap: 8, alignItems: 'center', justifyContent: 'space-evenly' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 10, color: 'var(--neutral-text-secondary)', lineHeight: 1.2 }}> 面辅料</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-text)', lineHeight: 1.4 }}>¥{fmt(stats?.materialCost ?? 0)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 10, color: 'var(--neutral-text-secondary)', lineHeight: 1.2 }}> 工序单价</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-text)', lineHeight: 1.4 }}>¥{fmt(stats?.processCost ?? 0)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 10, color: 'var(--neutral-text-secondary)', lineHeight: 1.2 }}> 二次工艺</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-text)', lineHeight: 1.4 }}>¥{fmt(stats?.secondaryProcessCost ?? 0)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 10, color: 'var(--neutral-text-secondary)', lineHeight: 1.2 }}> 总开发费</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary-color)', lineHeight: 1.4 }}>¥{fmt(stats?.totalCost ?? 0)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 10, color: 'var(--neutral-text-secondary)', lineHeight: 1.2 }}> 样衣数量</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-text)', lineHeight: 1.4 }}>{stats?.patternCount ?? 0} 件</span>
            </div>
          </div>

          {/* 时间筛选 */}
          <Segmented
            value={rangeType}
            onChange={onRangeChange}
            options={[
              { label: '今日', value: 'day' },
              { label: '本周', value: 'week' },
              { label: '本月', value: 'month' },
              { label: '本年', value: 'year' },
            ]}
           
            style={{ flexShrink: 0, marginLeft: 16 }}
          />
        </div>
      </Spin>
    </Card>
  );
};

export default StyleStatsCard;
