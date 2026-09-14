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
    <div className="u-mt-10 u-p-8px10px u-br-8" style={{ background: 'rgba(114,46,209,0.05)', border: '1px solid rgba(114,46,209,0.15)' }}>
      <div className="u-d-flex u-ai-center u-jc-between u-mb-6">
        <div className="u-d-flex u-ai-center u-gap-6">
          <BulbOutlined className="u-fs-14" style={{ color: 'var(--color-accent-purple)' }} />
          <span className="u-fs-13 u-fw-600" style={{ color: 'var(--color-text-primary)' }}>AI 洞察</span>
        </div>
        <Button
          size="small"
          type="link"
          onClick={onRefresh}
          loading={loading}
          className="u-p-0 u-fs-12"
        >
          刷新洞察
        </Button>
      </div>
      <div className="u-d-flex u-fwrap-wrap u-gap-6">
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
            <span className="u-ml-6" style={{ color: 'var(--color-gray-700)' }}>{it.text}</span>
          </Tag>
        ))}
      </div>
    </div>
  );
};

export default InsightPanel;
