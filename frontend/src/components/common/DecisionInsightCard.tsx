import React from 'react';
import { Button, Tag } from 'antd';

export const SMART_CARD_CONTENT_WIDTH = 280;
export const SMART_CARD_OVERLAY_WIDTH = 308;

export interface DecisionInsight {
  level?: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  summary: string;
  painPoint?: string;
  confidence?: string;
  source?: string;
  evidence?: string[];
  note?: string;
  execute?: string;
  actionLabel?: string;
  labels?: {
    summary?: string;
    painPoint?: string;
    execute?: string;
    evidence?: string;
    note?: string;
    action?: string;
  };
  onAction?: () => void;
}

const paletteMap: Record<NonNullable<DecisionInsight['level']>, { bg: string; border: string; title: string; dot: string }> = {
  danger: { bg: '#fff1f0', border: '#ffccc7', title: '#cf1322', dot: '#ff4d4f' },
  warning: { bg: '#fff7e6', border: '#ffd591', title: '#d46b08', dot: '#fa8c16' },
  info: { bg: '#f0f5ff', border: '#adc6ff', title: '#1d39c4', dot: '#1677ff' },
  success: { bg: '#f6ffed', border: '#b7eb8f', title: '#389e0d', dot: '#52c41a' },
};

const DecisionInsightCard: React.FC<{
  insight: DecisionInsight;
  compact?: boolean;
}> = ({ insight, compact = false }) => {
  const tone = paletteMap[insight.level ?? 'info'];
  const evidence = (insight.evidence ?? []).filter(Boolean).slice(0, compact ? 2 : 3);
  const labelWidth = compact ? 30 : 38;
  const lineLabels = {
    summary: insight.labels?.summary ?? '现在',
    painPoint: insight.labels?.painPoint ?? '重点',
    execute: insight.labels?.execute ?? '建议',
    evidence: insight.labels?.evidence ?? '数据',
    note: insight.labels?.note ?? '补充',
    action: insight.labels?.action ?? '操作',
  };

  const renderLine = (label: string, value?: string, color = '#262626') => {
    if (!value) return null;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`, columnGap: 6, alignItems: 'start' }}>
        <span style={{ color: '#8c8c8c', fontSize: compact ? 10 : 11, lineHeight: 1.6, textAlign: 'left' }}>{label}</span>
        <span style={{ color, fontSize: compact ? 11 : 12, lineHeight: 1.6, wordBreak: 'break-word' }}>{value}</span>
      </div>
    );
  };

  return (
    <div
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
        padding: compact ? '8px 12px' : '10px 12px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone.dot, flexShrink: 0 }} />
          <span style={{ color: tone.title, fontSize: compact ? 12 : 13, fontWeight: 700 }}>{insight.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {insight.source ? <Tag color="default" style={{ margin: 0, fontSize: 10 }}>{insight.source}</Tag> : null}
          {insight.confidence ? <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>{insight.confidence}</Tag> : null}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: evidence.length > 0 || insight.note || insight.actionLabel || insight.execute ? 6 : 0 }}>
        {renderLine(lineLabels.summary, insight.summary)}
        {renderLine(lineLabels.painPoint, insight.painPoint, tone.title)}
        {renderLine(lineLabels.execute, insight.execute, '#595959')}
      </div>

      {evidence.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`, columnGap: 6, marginBottom: insight.note || insight.actionLabel ? 6 : 0 }}>
          <div style={{ fontSize: compact ? 10 : 11, color: '#8c8c8c', lineHeight: 1.6 }}>{lineLabels.evidence}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            {evidence.map((item, index) => (
              <div key={`${item}-${index}`} style={{ fontSize: compact ? 10 : 11, color: '#595959', lineHeight: 1.5, wordBreak: 'break-word' }}>
                • {item}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {insight.note ? (
        <div style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`, columnGap: 6, marginBottom: insight.actionLabel ? 6 : 0 }}>
          <div style={{ fontSize: compact ? 10 : 11, color: '#8c8c8c', lineHeight: 1.6 }}>{lineLabels.note}</div>
          <div style={{ fontSize: compact ? 10 : 11, color: '#8c8c8c', lineHeight: 1.5, wordBreak: 'break-word' }}>
            {insight.note}
          </div>
        </div>
      ) : null}

      {insight.actionLabel ? (
        insight.onAction ? (
          <div style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`, columnGap: 6 }}>
            <div style={{ fontSize: compact ? 10 : 11, color: '#8c8c8c', lineHeight: 1.6 }}>{lineLabels.action}</div>
            <Button type="link" size="small" onClick={insight.onAction} style={{ padding: 0, height: 'auto', fontSize: 12, justifyContent: 'flex-start' }}>
              {insight.actionLabel}
            </Button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`, columnGap: 6 }}>
            <div style={{ fontSize: compact ? 10 : 11, color: '#8c8c8c', lineHeight: 1.6 }}>{lineLabels.action}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: tone.title, lineHeight: 1.6 }}>{insight.actionLabel}</div>
          </div>
        )
      ) : null}
    </div>
  );
};

export default DecisionInsightCard;
