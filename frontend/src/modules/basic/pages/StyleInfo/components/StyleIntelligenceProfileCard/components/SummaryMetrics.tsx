import React from 'react';
import { Tag } from 'antd';
import { BulbOutlined, RadarChartOutlined } from '@ant-design/icons';
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
  deliveryMeta: _deliveryMeta,
  completionRate: _completionRate,
  doneCount: _doneCount,
  stageTags,
  orderCount: _orderCount,
  latestOrderStatus,
}) => {
  // D-347 去重：交期/完成度/订单数已由顶部标题栏常驻展示，这里只留标题栏没有的信息
  const metrics = [
    {
      key: 'quote',
      icon: <BulbOutlined />,
      title: 'AI建议报价',
      value: loading ? '…' : fmtMoney(profile?.finance?.suggestedQuotation ?? quoteSuggestion?.suggestedPrice),
      extra: activeDifficulty?.adjustedSuggestedPrice
        ? `难度调整: ${fmtMoney(activeDifficulty.adjustedSuggestedPrice)}`
        : `历史 ${(profile?.finance?.historicalOrderCount ?? quoteSuggestion?.historicalOrderCount) || 0} 单`,
      color: 'var(--color-warning)',
    },
    {
      key: 'latestOrder',
      icon: <RadarChartOutlined />,
      title: '最新订单状态',
      value: latestOrderStatus || '暂无订单',
      // 距交期天数已在上方信息条展示，这里不再重复
      extra: '',
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
