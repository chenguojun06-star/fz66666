import React, { useMemo } from 'react';
import { Button, Tag } from 'antd';
import { BulbOutlined } from '@ant-design/icons';
import type { StyleInfo } from '@/types/style';
import type { StyleIntelligenceProfileResponse, StyleQuoteSuggestionResponse } from '@/services/intelligence/intelligenceApi';
import {
  buildFallbackInsights,
  INSIGHT_COLOR,
  INSIGHT_LABEL,
  normalizeInsights,
  type StyleInsightItem,
} from '../helpers';

interface InsightPanelProps {
  loading: boolean;
  profile: StyleIntelligenceProfileResponse | null;
  quoteSuggestion: StyleQuoteSuggestionResponse | null;
  style: StyleInfo | null;
  onRefresh: () => void;
}

const InsightPanel: React.FC<InsightPanelProps> = ({ loading, profile, quoteSuggestion, style, onRefresh }) => {
  const items: StyleInsightItem[] = useMemo(() => {
    const fallback = buildFallbackInsights(style || ({} as StyleInfo), quoteSuggestion);
    return normalizeInsights((profile as any)?.insights, fallback);
  }, [profile, quoteSuggestion, style]);

  return (
    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(114,46,209,0.05)', border: '1px solid rgba(114,46,209,0.15)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BulbOutlined style={{ color: 'var(--color-accent-purple)', fontSize: 14 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1f1f1f' }}>AI 洞察</span>
        </div>
        <Button
          size="small"
          type="link"
          onClick={onRefresh}
          loading={loading}
          style={{ padding: 0, fontSize: 12 }}
        >
          刷新洞察
        </Button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((it, idx) => (
          <Tag
            key={`${it.category}_${idx}`}
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: '18px',
              padding: '3px 8px',
              color: INSIGHT_COLOR[it.category],
              background: `${INSIGHT_COLOR[it.category]}14`,
              border: `1px solid ${INSIGHT_COLOR[it.category]}40`,
              borderRadius: 10,
            }}
          >
            <b style={{ color: INSIGHT_COLOR[it.category] }}>{INSIGHT_LABEL[it.category]}</b>
            <span style={{ color: '#595959', marginLeft: 6 }}>{it.text}</span>
          </Tag>
        ))}
      </div>
    </div>
  );
};

export default InsightPanel;
