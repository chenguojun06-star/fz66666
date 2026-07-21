import React from 'react';
import { Tag } from 'antd';
import { BulbOutlined, CalendarOutlined, NodeIndexOutlined, RadarChartOutlined } from '@ant-design/icons';
import type { DifficultyAssessment, StyleIntelligenceProfileResponse, StyleQuoteSuggestionResponse } from '@/services/intelligence/intelligenceApi';
import { fmtMoney } from '../helpers';

interface SummaryMetricsProps {
  loading: boolean;
  profile: StyleIntelligenceProfileResponse | null;
  quoteSuggestion: StyleQuoteSuggestionResponse | null;
  activeDifficulty: DifficultyAssessment | null;
  deliveryMeta: { label: string; color: string; detail: string };
  completionRate: number;
  doneCount: number;
  stageTags: Array<{ key: string; label: string; done: boolean }>;
  orderCount: number;
  latestOrderStatus?: string;
}

const SummaryMetrics: React.FC<SummaryMetricsProps> = ({
  loading,
  profile,
  quoteSuggestion,
  activeDifficulty,
  deliveryMeta,
  completionRate,
  doneCount,
  stageTags,
  orderCount,
  latestOrderStatus,
}) => {
  const metrics = [
    {
      key: 'delivery',
      icon: <CalendarOutlined />,
      title: '交期风险',
      value: deliveryMeta.label,
      extra: deliveryMeta.detail,
      color: deliveryMeta.color === 'error' ? 'var(--color-danger)' : deliveryMeta.color === 'warning' ? 'var(--color-warning)' : 'var(--color-success)',
    },
    {
      key: 'progress',
      icon: <NodeIndexOutlined />,
      title: '开发完成度',
      value: `${completionRate}%`,
      extra: `${doneCount}/${stageTags.length} 节点完成`,
      color: 'var(--color-primary)',
    },
    {
      key: 'quote',
      icon: <BulbOutlined />,
      title: 'AI建议报价',
      value: loading ? '…' : fmtMoney(profile?.finance?.suggestedQuotation ?? quoteSuggestion?.suggestedPrice),
      extra: activeDifficulty?.adjustedSuggestedPrice
        ? `难度调整: ${fmtMoney(activeDifficulty.adjustedSuggestedPrice)}`
        : `历史 ${(profile?.finance?.historicalOrderCount ?? quoteSuggestion?.historicalOrderCount) || 0} 单`,
      color: '#d48806',
    },
    {
      key: 'orders',
      icon: <RadarChartOutlined />,
      title: '系统联动',
      value: `${orderCount} 单`,
      extra: latestOrderStatus || '暂无订单',
      color: 'var(--color-accent-purple)',
    },
  ];

  return (
    <div style={{ flex: '0 0 42%', minWidth: 0 }}>
      {/* 4个指标 — 紧凑 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
        {metrics.map((item) => (
          <div key={item.key} style={{ padding: '5px 7px', borderRadius: 6, background: 'var(--color-bg-base)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 1 }}>
              <span style={{ color: item.color, fontSize: 12 }}>{item.icon}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{item.title}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: item.color, lineHeight: 1.3 }}>{item.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 1, lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.extra}</div>
          </div>
        ))}
      </div>

      {/* 节点标签 */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {stageTags.map((item) => (
          <Tag key={item.key} color={item.done ? 'success' : 'default'} style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 5px' }}>
            {item.label}{item.done ? ' ' : ''}
          </Tag>
        ))}
      </div>
    </div>
  );
};

export default SummaryMetrics;
